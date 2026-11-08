"""Environment-driven configuration. load_config never raises: bad config disables MCP only.

MCP_ANONYMOUS_ACCESS=true serves requests that carry no credential, under one shared limit.
Keys still work alongside it, each under its own limit.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field

from backend.mcp_server.keys import KeyStore, parse_records

_DEFAULT_ALLOWED_HOSTS = "localhost:*,127.0.0.1:*"


@dataclass(frozen=True)
class Limits:
    max_body_bytes: int = 32_768
    body_read_seconds: float = 10.0
    sdk_deadline_seconds: float = 10.0
    per_minute: int = 60
    per_day: int = 2_000
    # One shared pool for every request without a credential. Claude's connectors reach us from
    # a few Anthropic addresses, so a per-address limit would split nothing.
    anonymous_per_minute: int = 120
    anonymous_per_day: int = 5_000
    max_in_flight: int = 8
    failed_auth_per_client: int = 20
    failed_auth_global: int = 200
    failed_auth_window_seconds: float = 60.0
    max_failed_auth_clients: int = 10_000
    rejection_log_seconds: float = 60.0
    snapshot_retry_delays: tuple[float, ...] = (1.0, 3.0)


@dataclass(frozen=True)
class McpConfig:
    enabled: bool
    reason: str | None
    keys: KeyStore
    allowed_hosts: tuple[str, ...]
    limits: Limits = field(default_factory=Limits)
    anonymous: bool = False


def _disabled(reason: str, hosts: tuple[str, ...]) -> McpConfig:
    return McpConfig(enabled=False, reason=reason, keys=KeyStore([]), allowed_hosts=hosts)


def load_config(env: Mapping[str, str] | None = None) -> McpConfig:
    env = os.environ if env is None else env
    hosts = tuple(
        h.strip()
        for h in env.get("MCP_ALLOWED_HOSTS", _DEFAULT_ALLOWED_HOSTS).split(",")
        if h.strip()
    )
    switch = (env.get("MCP_ANONYMOUS_ACCESS") or "false").strip().lower()
    if switch not in ("true", "false"):
        return _disabled("MCP_ANONYMOUS_ACCESS must be true or false", hosts)
    anonymous = switch == "true"
    raw = env.get("MCP_API_KEYS")
    if not raw:
        if anonymous:
            return McpConfig(True, None, KeyStore([]), hosts, anonymous=True)
        return _disabled("MCP_API_KEYS is not set", hosts)
    try:
        records = parse_records(raw)
    except ValueError:
        # The validation message can echo input, so it never reaches a log. A broken key list
        # disables MCP even with anonymous access on, so the mistake is noticed and fixed.
        return _disabled("MCP_API_KEYS is invalid", hosts)
    if not records and not anonymous:
        return _disabled("MCP_API_KEYS has no keys", hosts)
    return McpConfig(True, None, KeyStore(records), hosts, anonymous=anonymous)
