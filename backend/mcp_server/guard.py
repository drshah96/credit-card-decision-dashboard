"""The /mcp endpoint: a plain ASGI app that screens requests before the SDK sees them.

The order of checks is ADR 0003 D8. The SDK is imported only in run(), so an SDK problem
disables MCP without stopping the site from booting.
"""

import hashlib
import logging
import os
import re
import secrets
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import anyio
import anyio.to_thread
from pydantic_core import from_json

from backend.mcp_server import observability
from backend.mcp_server.config import Limits, McpConfig, load_config
from backend.mcp_server.keys import KeyRecord, KeyStore

_REALM = 'Bearer realm="thewalletaudit-mcp"'
_AUTH_MESSAGE = (
    "A valid The Wallet Audit API key is required in the Authorization header as: Bearer <key>."
)
_RPC_METHOD = re.compile(r"^[a-z][a-zA-Z/_]{0,63}$")
_CARD_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_CLIENT_TEXT = re.compile(r"^[\x20-\x7e]{1,64}$")
_PROTOCOL = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DAY_SECONDS = 86_400.0
_MINUTE_SECONDS = 60.0
_CAPTURE_BYTES = 262_144
# 202 is how the SDK accepts a notification, which has no response body.
_SUCCESS_STATUSES = frozenset({200, 202})
_KNOWN_TOOLS = frozenset(
    {"find_cards", "get_card", "compare_cards", "rank_by_category", "estimate_value"}
)
_KNOWN_CATEGORIES_MAX = 32
_CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo"


@dataclass
class _KeyWindow:
    minute_start: float
    minute_count: int = 0
    day_start: float = 0.0
    day_count: int = 0


@dataclass
class _Live:
    app: Callable
    keys: KeyStore
    limits: Limits
    rejections: observability.RejectionAggregator
    salt: bytes = field(default_factory=lambda: os.urandom(16))
    key_windows: dict[str, _KeyWindow] = field(default_factory=dict)
    failed_by_client: dict[str, tuple[float, int]] = field(default_factory=dict)
    failed_global: tuple[float, int] = (0.0, 0)
    in_flight: int = 0


def _build_snapshot():
    from backend.mcp_server.snapshot import build_snapshot

    return build_snapshot()


def _jsonrpc_error(message: str) -> bytes:
    text = message.replace('"', "'")
    return ('{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"' + text + '"}}').encode()


class McpEndpoint:
    def __init__(self) -> None:
        self.config_loader: Callable[[], McpConfig] = load_config
        self.snapshot_builder: Callable[[], object] = _build_snapshot
        self.clock: Callable[[], float] = time.monotonic
        self._live: _Live | None = None

    @asynccontextmanager
    async def run(self) -> AsyncIterator[None]:
        """Enter once per app lifespan. Any failure here disables MCP, never the site."""
        observability.scrub_access_log()
        config = self.config_loader()
        if not config.enabled:
            observability.emit(event="mcp_disabled", reason=config.reason)
            yield
            return

        started = await self._start(config)
        if started is None:
            yield
            return

        live, manager_context, snapshot = started
        self._live = live
        observability.emit(
            event="mcp_started",
            contract_version=snapshot.meta.contract_version,
            catalog_digest=snapshot.digest,
            cards=len(snapshot.cards),
            verified_cards=sum(s.verification is not None for s in snapshot.verification.values()),
            keys=len(config.keys),
            allowed_hosts=list(config.allowed_hosts),
        )
        try:
            yield
        finally:
            self._live = None
            live.rejections.flush()
            await manager_context.__aexit__(None, None, None)

    async def _start(self, config: McpConfig):
        try:
            snapshot = await self._build_with_retries(config.limits)
            from mcp.server.transport_security import TransportSecuritySettings

            from backend.mcp_server.tools import create_server

            server = create_server(lambda: snapshot)
            app = server.streamable_http_app(
                streamable_http_path="/mcp",
                stateless_http=True,
                json_response=True,
                max_request_body_size=config.limits.max_body_bytes,
                transport_security=TransportSecuritySettings(
                    enable_dns_rebinding_protection=True,
                    allowed_hosts=list(config.allowed_hosts),
                    allowed_origins=[],
                ),
            )
            manager_context = server.session_manager.run()
            await manager_context.__aenter__()
        except Exception as exc:
            observability.emit(
                logging.ERROR, event="mcp_disabled", reason=f"startup: {type(exc).__name__}"
            )
            return None
        live = _Live(
            app=app,
            keys=config.keys,
            limits=config.limits,
            rejections=observability.RejectionAggregator(
                config.limits.rejection_log_seconds, self.clock
            ),
        )
        return live, manager_context, snapshot

    async def _build_with_retries(self, limits: Limits):
        for delay in limits.snapshot_retry_delays:
            try:
                return await anyio.to_thread.run_sync(self.snapshot_builder)
            except Exception as exc:
                observability.emit(
                    logging.WARNING, event="mcp_snapshot_retry", reason=type(exc).__name__
                )
                await anyio.sleep(delay)
        return await anyio.to_thread.run_sync(self.snapshot_builder)

    async def __call__(self, scope, receive, send) -> None:
        request_id = secrets.token_hex(6)

        async def tagged_send(message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        live = self._live
        if scope["path"] != "/mcp":
            await self._refuse(
                live,
                tagged_send,
                404,
                "not_found",
                "The MCP endpoint is /mcp, without a trailing slash.",
            )
            return
        if scope["method"] != "POST":
            await self._refuse(
                live,
                tagged_send,
                405,
                "method",
                "The MCP endpoint accepts POST only.",
                [(b"allow", b"POST")],
            )
            return
        if live is None:
            await _respond(
                tagged_send,
                503,
                _jsonrpc_error("The MCP server is not available."),
                [(b"retry-after", b"60")],
            )
            return

        headers = {k.lower(): v for k, v in scope["headers"]}
        declared = _declared_length(headers.get(b"content-length"))
        if declared is False or (declared is not None and declared > live.limits.max_body_bytes):
            await self._refuse(
                live, tagged_send, 413, "too_large", "The request body is too large."
            )
            return

        authorization = headers.get(b"authorization", b"").decode("latin-1")
        record = live.keys.verify(authorization)
        if record is None:
            await self._reject_auth(live, scope, headers, tagged_send, bool(authorization))
            return

        await self._serve(live, record, scope, receive, tagged_send, request_id, headers)

    async def _serve(self, live, record, scope, receive, send, request_id, headers) -> None:
        started = self.clock()
        # Capacity comes first: a busy refusal did no work, so it must not spend the key's quota.
        if live.in_flight >= live.limits.max_in_flight:
            await _respond(
                send, 503, _jsonrpc_error("The server is busy."), [(b"retry-after", b"1")]
            )
            _log_request(request_id, record, None, headers, 503, "busy", started, self, 0, 0)
            return
        retry_after = self._charge_key(live, record)
        if retry_after is not None:
            await _respond(
                send,
                429,
                _jsonrpc_error("This API key is over its rate limit."),
                [(b"retry-after", str(retry_after).encode())],
            )
            _log_request(
                request_id, record, None, headers, 429, "rate_limited", started, self, 0, 0
            )
            return

        live.in_flight += 1
        try:
            body = await _read_body(receive, live.limits)
            if body is _DISCONNECTED:
                return
            if body is _TOO_LARGE or body is _TIMED_OUT:
                status, outcome, text = (
                    (413, "too_large", "The request body is too large.")
                    if body is _TOO_LARGE
                    else (408, "timeout", "Timed out reading the request body.")
                )
                await _respond(send, status, _jsonrpc_error(text))
                _log_request(
                    request_id, record, None, headers, status, outcome, started, self, 0, 0
                )
                return
            parsed = _parse_for_logging(body)
            status, outcome, response_bytes = await self._call_sdk(
                live, scope, body, parsed, receive, send
            )
            _log_request(
                request_id,
                record,
                parsed,
                headers,
                status,
                outcome,
                started,
                self,
                len(body),
                response_bytes,
            )
        finally:
            live.in_flight -= 1

    async def _call_sdk(self, live, scope, body, parsed, receive, send) -> tuple[int, str, int]:
        inner_scope = {**scope, "path": "/mcp", "raw_path": b"/mcp", "root_path": ""}
        replayed = False
        status = 500
        response_started = False
        captured = bytearray()
        size = 0

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        async def capture(message) -> None:
            nonlocal status, response_started, size
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                size += len(chunk)
                if len(captured) < _CAPTURE_BYTES:
                    captured.extend(chunk[: _CAPTURE_BYTES - len(captured)])
            await send(message)

        with anyio.move_on_after(live.limits.sdk_deadline_seconds) as deadline:
            try:
                await live.app(inner_scope, replay, capture)
            except Exception as exc:
                # Only the type is logged: an exception message can quote request data.
                observability.emit(logging.ERROR, event="mcp_sdk_error", error=type(exc).__name__)
                if not response_started:
                    await _respond(send, 500, _jsonrpc_error("Internal server error."))
                    return 500, "internal_error", 0
                return status, "internal_error", size
        if deadline.cancelled_caught:
            if response_started:
                return status, "timeout_after_start", size
            await _respond(send, 504, _jsonrpc_error("The request timed out."))
            return 504, "timeout", 0
        return status, _classify(status, bytes(captured), parsed), size

    def _charge_key(self, live: _Live, record: KeyRecord) -> int | None:
        """Seconds until the key may retry when over a limit, else None after counting it."""
        now = self.clock()
        window = live.key_windows.get(record.id)
        if window is None:
            window = _KeyWindow(minute_start=now, day_start=now)
            live.key_windows[record.id] = window
        if now - window.minute_start >= _MINUTE_SECONDS:
            window.minute_start, window.minute_count = now, 0
        if now - window.day_start >= _DAY_SECONDS:
            window.day_start, window.day_count = now, 0
        per_minute = record.per_minute or live.limits.per_minute
        per_day = record.per_day or live.limits.per_day
        if window.day_count >= per_day:
            return max(1, int(_DAY_SECONDS - (now - window.day_start)))
        if window.minute_count >= per_minute:
            return max(1, int(_MINUTE_SECONDS - (now - window.minute_start)))
        window.minute_count += 1
        window.day_count += 1
        return None

    async def _reject_auth(self, live, scope, headers, send, presented: bool) -> None:
        if self._over_failed_auth_budget(live, scope, headers):
            live.rejections.add("failed_auth_limited")
            await _respond(
                send,
                429,
                _jsonrpc_error("Too many failed authentication attempts."),
                [(b"retry-after", b"60")],
            )
            return
        live.rejections.add("unauthorized")
        challenge = _REALM + (', error="invalid_token"' if presented else "")
        await _respond(
            send, 401, _jsonrpc_error(_AUTH_MESSAGE), [(b"www-authenticate", challenge.encode())]
        )

    def _over_failed_auth_budget(self, live: _Live, scope, headers) -> bool:
        limits = live.limits
        now = self.clock()
        window = limits.failed_auth_window_seconds
        start, count = live.failed_global
        if now - start >= window:
            start, count = now, 0
        live.failed_global = (start, count + 1)
        over_global = count >= limits.failed_auth_global

        if len(live.failed_by_client) > limits.max_failed_auth_clients:
            live.failed_by_client.clear()
        client = _client_key(live.salt, scope, headers)
        start, count = live.failed_by_client.get(client, (now, 0))
        if now - start >= window:
            start, count = now, 0
        live.failed_by_client[client] = (start, count + 1)
        return over_global or count >= limits.failed_auth_per_client

    async def _refuse(self, live, send, status, kind, message, extra_headers=()) -> None:
        if live is not None:
            live.rejections.add(kind)
        await _respond(send, status, _jsonrpc_error(message), list(extra_headers))


_TOO_LARGE = object()
_TIMED_OUT = object()
_DISCONNECTED = object()


def _declared_length(value: bytes | None):
    """None when absent, False when unparseable, else the integer."""
    if value is None:
        return None
    text = value.decode("latin-1").strip()
    return int(text) if text.isascii() and text.isdigit() else False


async def _read_body(receive, limits: Limits):
    chunks = bytearray()
    with anyio.move_on_after(limits.body_read_seconds):
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return _DISCONNECTED
            chunks.extend(message.get("body", b""))
            if len(chunks) > limits.max_body_bytes:
                return _TOO_LARGE
            if not message.get("more_body", False):
                return bytes(chunks)
    return _TIMED_OUT


def _parse_for_logging(body: bytes):
    # pydantic-core rejects deep nesting cleanly, where stdlib json raises RecursionError.
    try:
        parsed = from_json(body)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _client_key(salt: bytes, scope, headers) -> str:
    # X-Forwarded-For is never read: its leftmost entry is client-controlled on Render.
    ip = headers.get(b"cf-connecting-ip") or headers.get(b"true-client-ip")
    if not ip:
        client = scope.get("client")
        ip = (client[0] if client else "").encode()
    return hashlib.blake2b(salt + ip, digest_size=16).hexdigest()


async def _respond(send, status: int, body: bytes, extra_headers=()) -> None:
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
        *extra_headers,
    ]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


def _calls_unknown_tool(parsed: dict | None) -> bool:
    if parsed is None or parsed.get("method") != "tools/call":
        return False
    params = parsed.get("params")
    name = params.get("name") if isinstance(params, dict) else None
    return isinstance(name, str) and name not in _KNOWN_TOOLS


def _classify(status: int, body: bytes, parsed: dict | None) -> str:
    if status not in _SUCCESS_STATUSES:
        return "internal_error" if status >= 500 else f"http_{status}"
    try:
        payload = from_json(body)
    except Exception:
        return "ok"
    if not isinstance(payload, dict):
        return "ok"
    error = payload.get("error")
    if isinstance(error, dict):
        return f"rpc_error:{error.get('code')}"
    result = payload.get("result")
    if not (isinstance(result, dict) and result.get("isError")):
        return "ok"
    content = result.get("content") or [{}]
    text = str(content[0].get("text", ""))
    if text.startswith("["):
        return f"tool_error:{text[1 : text.find(']')]}"
    if _calls_unknown_tool(parsed):
        return "unknown_tool"
    return "invalid_arguments" if "validation error" in text else "internal_error"


def _client_name(params: dict) -> str | None:
    # Older protocols send clientInfo on initialize, newer ones in each request's _meta.
    meta = params.get("_meta")
    info = params.get("clientInfo")
    if info is None and isinstance(meta, dict):
        info = meta.get(_CLIENT_INFO_META_KEY)
    if not isinstance(info, dict):
        return None
    name, version = info.get("name"), info.get("version")
    if not (isinstance(name, str) and isinstance(version, str)):
        return None
    client = f"{name}/{version}"
    return client if _CLIENT_TEXT.match(client) else None


def _safe_request_fields(parsed: dict | None, headers: dict) -> dict:
    fields = {
        "rpc_method": None,
        "tool": None,
        "card_ids": None,
        "category": None,
        "client": None,
        "protocol_version": None,
    }
    version = headers.get(b"mcp-protocol-version", b"").decode("latin-1")
    if _PROTOCOL.match(version):
        fields["protocol_version"] = version
    if parsed is None:
        return fields
    method = parsed.get("method")
    if isinstance(method, str) and _RPC_METHOD.match(method):
        fields["rpc_method"] = method
    params = parsed.get("params")
    if not isinstance(params, dict):
        return fields
    if method == "initialize":
        declared = params.get("protocolVersion")
        if isinstance(declared, str) and _PROTOCOL.match(declared):
            fields["protocol_version"] = declared
    fields["client"] = _client_name(params)
    if method == "tools/call":
        name = params.get("name")
        fields["tool"] = name if isinstance(name, str) and name in _KNOWN_TOOLS else "<unknown>"
        arguments = params.get("arguments")
        if isinstance(arguments, dict):
            ids = arguments.get("card_ids")
            ids = ids if isinstance(ids, list) else [arguments.get("card_id")]
            safe = [i for i in ids if isinstance(i, str) and len(i) <= 64 and _CARD_ID.match(i)]
            fields["card_ids"] = safe[:25] or None
            category = arguments.get("category")
            if (
                isinstance(category, str)
                and len(category) <= _KNOWN_CATEGORIES_MAX
                and _CARD_ID.match(category)
            ):
                fields["category"] = category
    return fields


def _log_request(
    request_id, record, parsed, headers, status, outcome, started, endpoint, sent, received
) -> None:
    observability.emit(
        event="mcp_request",
        request_id=request_id,
        key_id=record.id,
        http_status=status,
        outcome=outcome,
        duration_ms=round((endpoint.clock() - started) * 1000, 1),
        request_bytes=sent,
        response_bytes=received,
        **_safe_request_fields(parsed, headers),
    )


mcp_endpoint = McpEndpoint()
