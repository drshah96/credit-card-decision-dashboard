"""Every rule in ADR 0003 D8, over the real app and over real ASGI."""

import json
from dataclasses import replace

import anyio
import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from backend.main import app
from backend.mcp_server import mcp_endpoint
from backend.mcp_server.config import McpConfig
from backend.mcp_server.keys import KeyStore

from .http_helpers import FAST, HEADERS, INITIALIZE, auth, call_tool, enabled_config, running


def test_auth_failures_use_our_shape_and_advertise_no_oauth(snapshot):
    config, _ = enabled_config()
    with running(snapshot, config) as client:
        missing = client.post("/mcp", json=INITIALIZE, headers=HEADERS)
        wrong = client.post(
            "/mcp", json=INITIALIZE, headers={**HEADERS, "authorization": "Bearer nope"}
        )
        metadata = client.get("/.well-known/oauth-protected-resource")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == 'Bearer realm="thewalletaudit-mcp"'
    assert missing.json()["error"]["code"] == -32000
    assert "Bearer <key>" in missing.json()["error"]["message"]
    assert wrong.status_code == 401
    assert 'error="invalid_token"' in wrong.headers["www-authenticate"]
    assert "resource_metadata" not in wrong.headers["www-authenticate"]
    assert metadata.status_code == 404


def test_a_query_string_key_is_not_accepted(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post(f"/mcp?api_key={key}&key={key}", json=INITIALIZE, headers=HEADERS)
    assert response.status_code == 401


def test_post_works_with_no_redirect_and_tags_the_response(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post("/mcp", json=INITIALIZE, headers=auth(key))
    assert response.status_code == 200
    assert response.json()["result"]["serverInfo"]["name"] == "thewalletaudit"
    assert response.headers["x-request-id"]


def test_trailing_slash_is_a_hint_not_a_redirect(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post("/mcp/", json=INITIALIZE, headers=auth(key))
    assert response.status_code == 404
    assert "without a trailing slash" in response.text


@pytest.mark.parametrize("method", ["GET", "DELETE", "PUT", "PATCH"])
def test_only_post_is_allowed(snapshot, method):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.request(method, "/mcp", headers=auth(key))
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"


def test_oversized_bodies_are_refused_by_header_and_by_stream(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        by_header = client.post(
            "/mcp", content=b"x", headers={**auth(key), "content-length": "99999999"}
        )
        unparseable = client.post(
            "/mcp", content=b"x", headers={**auth(key), "content-length": "abc"}
        )

        def chunks():
            yield b"x" * 40_000

        by_stream = client.post("/mcp", content=chunks(), headers=auth(key))
    assert by_header.status_code == 413
    assert unparseable.status_code == 413
    assert by_stream.status_code == 413


def test_deep_nesting_is_a_clean_400_never_a_500(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post("/mcp", content=b"[" * 5000, headers=auth(key))
    assert response.status_code == 400


def test_transport_checks_stay_on(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        bad_host = client.post(
            "/mcp", json=INITIALIZE, headers={**auth(key), "host": "api.thewalletaudit.com"}
        )
        any_origin = client.post(
            "/mcp", json=INITIALIZE, headers={**auth(key), "origin": "https://evil.example"}
        )
        plain_text = client.post(
            "/mcp",
            content=json.dumps(INITIALIZE),
            headers={**auth(key), "content-type": "text/plain"},
        )
    assert bad_host.status_code == 421
    assert any_origin.status_code == 403
    assert plain_text.status_code == 400


def test_per_key_limit_answers_429_and_leaves_other_keys_alone(snapshot):
    limited, key = enabled_config(per_minute=2)
    other_config, other_key = enabled_config()
    both = KeyStore(list(limited.keys._by_id.values()) + list(other_config.keys._by_id.values()))
    config = McpConfig(True, None, both, ("testserver",), FAST)
    with running(snapshot, config) as client:
        statuses = [
            client.post("/mcp", json=INITIALIZE, headers=auth(key)).status_code for _ in range(3)
        ]
        over = client.post("/mcp", json=INITIALIZE, headers=auth(key))
        fine = client.post("/mcp", json=INITIALIZE, headers=auth(other_key))
    assert statuses == [200, 200, 429]
    assert int(over.headers["retry-after"]) >= 1
    assert fine.status_code == 200


def test_failed_auth_budget_never_locks_out_a_valid_key(snapshot):
    config, key = enabled_config(replace(FAST, failed_auth_per_client=3))
    bad = {**HEADERS, "authorization": "Bearer bad"}
    with running(snapshot, config) as client:
        statuses = [client.post("/mcp", json=INITIALIZE, headers=bad).status_code for _ in range(5)]
        good = client.post("/mcp", json=INITIALIZE, headers=auth(key))
    assert statuses == [401, 401, 401, 429, 429]
    assert good.status_code == 200


def test_forged_forwarded_for_does_not_escape_the_failed_auth_budget(snapshot):
    config, _ = enabled_config(replace(FAST, failed_auth_per_client=2))
    with running(snapshot, config) as client:
        statuses = [
            client.post(
                "/mcp",
                json=INITIALIZE,
                headers={
                    **HEADERS,
                    "authorization": "Bearer bad",
                    "x-forwarded-for": f"198.51.100.{i}",
                },
            ).status_code
            for i in range(4)
        ]
    assert statuses == [401, 401, 429, 429]


def test_global_failed_auth_budget_stops_rotating_clients(snapshot):
    config, _ = enabled_config(replace(FAST, failed_auth_global=2))
    with running(snapshot, config) as client:
        statuses = [
            client.post(
                "/mcp",
                json=INITIALIZE,
                headers={
                    **HEADERS,
                    "authorization": "Bearer bad",
                    "cf-connecting-ip": f"198.51.100.{i}",
                },
            ).status_code
            for i in range(4)
        ]
    assert statuses == [401, 401, 429, 429]


@pytest.mark.parametrize(
    "config",
    [
        McpConfig(False, "MCP_API_KEYS is not set", KeyStore([]), ("testserver",), FAST),
        McpConfig(False, "MCP_API_KEYS is invalid", KeyStore([]), ("testserver",), FAST),
    ],
)
def test_disabled_config_answers_503_while_the_site_serves(snapshot, config):
    with running(snapshot, config) as client:
        assert client.post("/mcp", json=INITIALIZE, headers=HEADERS).status_code == 503
        assert client.get("/healthz").status_code == 200
        assert client.get("/api/cards").status_code == 200


def test_a_snapshot_that_keeps_failing_disables_mcp_only(snapshot):
    calls = []

    def failing():
        calls.append(1)
        raise RuntimeError("boom")

    config, key = enabled_config()
    with running(snapshot, config, builder=failing) as client:
        assert client.post("/mcp", json=INITIALIZE, headers=auth(key)).status_code == 503
        assert client.get("/api/cards").status_code == 200
    assert len(calls) == 3


def test_a_snapshot_that_recovers_enables_mcp(snapshot):
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("transient")
        return snapshot

    config, key = enabled_config()
    with running(snapshot, config, builder=flaky) as client:
        assert client.post("/mcp", json=INITIALIZE, headers=auth(key)).status_code == 200
    assert len(calls) == 2


def test_the_api_keeps_its_own_behaviour(snapshot):
    config, _ = enabled_config()
    with running(snapshot, config) as client:
        assert client.post("/api/cards").status_code == 405
        missing = client.get("/no-such-path")
        assert missing.status_code == 404
        assert missing.json() == {"detail": "Not Found"}
        assert client.get("/").json()["mcp"] == "https://mcp.thewalletaudit.com/mcp"


def test_large_responses_are_gzipped(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post(
            "/mcp",
            json=call_tool("get_card", {"card_id": "amex-platinum"}),
            headers={**auth(key), "accept-encoding": "gzip", "accept": HEADERS["accept"]},
        )
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert "amex-platinum" in response.text


def _scope(key: str, path: str = "/mcp") -> dict:
    return {
        "type": "http",
        "method": "POST",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("192.0.2.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
        "headers": [
            (b"host", b"testserver"),
            (b"authorization", f"Bearer {key}".encode()),
            (b"content-type", b"application/json"),
            (b"accept", b"application/json, text/event-stream"),
        ],
    }


class _Sink:
    def __init__(self) -> None:
        self.messages = []

    async def __call__(self, message) -> None:
        self.messages.append(message)

    @property
    def status(self) -> int:
        return self.messages[0]["status"]


def _enable(monkeypatch, config, snapshot) -> None:
    monkeypatch.setattr(mcp_endpoint, "config_loader", lambda: config)
    monkeypatch.setattr(mcp_endpoint, "snapshot_builder", lambda: snapshot)


async def _never_finishes():
    await anyio.sleep(3600)
    return {"type": "http.disconnect"}


async def test_a_slow_body_gets_408(snapshot, monkeypatch):
    config, key = enabled_config(replace(FAST, body_read_seconds=0.02))
    _enable(monkeypatch, config, snapshot)
    async with mcp_endpoint.run():
        sink = _Sink()
        await mcp_endpoint(_scope(key), _never_finishes, sink)
    assert sink.status == 408


async def test_a_slow_sdk_gets_504_and_frees_its_slot(snapshot, monkeypatch):
    config, key = enabled_config(replace(FAST, sdk_deadline_seconds=0.02))
    _enable(monkeypatch, config, snapshot)
    body = json.dumps(INITIALIZE).encode()

    async def slow_app(scope, receive, send):
        await anyio.sleep(3600)

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async with mcp_endpoint.run():
        mcp_endpoint._live.app = slow_app
        sink = _Sink()
        await mcp_endpoint(_scope(key), receive, sink)
        assert sink.status == 504
        assert mcp_endpoint._live.in_flight == 0


async def test_an_sdk_crash_is_a_clean_500_that_leaks_nothing(snapshot, monkeypatch):
    config, key = enabled_config()
    _enable(monkeypatch, config, snapshot)
    body = json.dumps(INITIALIZE).encode()

    async def broken_app(scope, receive, send):
        raise RuntimeError("postgres://user:hunter2@host/db")

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async with mcp_endpoint.run():
        mcp_endpoint._live.app = broken_app
        sink = _Sink()
        await mcp_endpoint(_scope(key), receive, sink)
        assert mcp_endpoint._live.in_flight == 0
    assert sink.status == 500
    assert b"hunter2" not in sink.messages[1]["body"]


async def test_the_in_flight_limit_answers_503(snapshot, monkeypatch):
    config, key = enabled_config(replace(FAST, max_in_flight=1))
    _enable(monkeypatch, config, snapshot)
    body = json.dumps(INITIALIZE).encode()
    entered = anyio.Event()
    release = anyio.Event()

    async def slow_app(scope, receive, send):
        entered.set()
        await release.wait()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async with mcp_endpoint.run():
        mcp_endpoint._live.app = slow_app
        first = _Sink()
        second = _Sink()
        async with anyio.create_task_group() as tasks:
            tasks.start_soon(mcp_endpoint, _scope(key), receive, first)
            await entered.wait()
            await mcp_endpoint(_scope(key), receive, second)
            release.set()
    assert second.status == 503
    assert dict(second.messages[0]["headers"])[b"retry-after"] == b"1"


async def test_the_official_client_completes_list_and_call(snapshot, monkeypatch):
    config, key = enabled_config()
    _enable(monkeypatch, config, snapshot)
    async with app.router.lifespan_context(app):
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport, headers={"authorization": f"Bearer {key}"}
        ) as http_client:
            url = "http://testserver/mcp"
            async with Client(streamable_http_client(url, http_client=http_client)) as client:
                tools = await client.list_tools()
                result = await client.call_tool("get_card", {"card_id": "amex-gold"})
    assert len(tools.tools) == 5
    assert result.is_error is not True
    assert result.structured_content["card"]["id"] == "amex-gold"


def test_a_tool_error_passes_through_as_a_result(snapshot):
    config, key = enabled_config()
    with running(snapshot, config) as client:
        response = client.post(
            "/mcp", json=call_tool("get_card", {"card_id": "no-such-card"}), headers=auth(key)
        )
    assert response.status_code == 200
    assert response.json()["result"]["isError"] is True
