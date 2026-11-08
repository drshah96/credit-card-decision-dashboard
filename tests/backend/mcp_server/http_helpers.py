"""Runs the real app with MCP enabled. follow_redirects=False so a redirect fails a test."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.mcp_server import mcp_endpoint
from backend.mcp_server.config import Limits, McpConfig
from backend.mcp_server.keys import KeyStore, mint_key

FAST = replace(Limits(), snapshot_retry_delays=(0.0, 0.0))
HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def enabled_config(limits: Limits = FAST, per_minute: int | None = None) -> tuple[McpConfig, str]:
    key, record = mint_key("test", None)
    if per_minute is not None:
        record = record.model_copy(update={"per_minute": per_minute})
    return McpConfig(True, None, KeyStore([record]), ("testserver",), limits), key


def anonymous_config(limits: Limits = FAST) -> tuple[McpConfig, str]:
    """Anonymous access on, with one key alongside it."""
    config, key = enabled_config(limits)
    return replace(config, anonymous=True), key


def rpc(method: str, params: dict | None = None, request_id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}


INITIALIZE = rpc(
    "initialize",
    {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "pytest", "version": "1"},
    },
)


def call_tool(name: str, arguments: dict) -> dict:
    return rpc("tools/call", {"name": name, "arguments": arguments})


def auth(key: str) -> dict:
    return {**HEADERS, "authorization": f"Bearer {key}"}


@contextmanager
def running(snapshot, config: McpConfig | None = None, builder=None) -> Iterator[TestClient]:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(mcp_endpoint, "config_loader", lambda: config)
        patch.setattr(mcp_endpoint, "snapshot_builder", builder or (lambda: snapshot))
        with TestClient(app, follow_redirects=False) as client:
            yield client
