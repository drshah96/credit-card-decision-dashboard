"""One useful JSON line per request, and never a key, an Authorization value or an IP."""

import json
import logging
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace

from backend.mcp_server.observability import RejectionAggregator, logger

from .http_helpers import FAST, HEADERS, INITIALIZE, auth, call_tool, enabled_config, running

IP_LIKE = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(record.getMessage())

    def events(self, name: str) -> list[dict]:
        parsed = [json.loads(line) for line in self.lines]
        return [p for p in parsed if p["event"] == name]


@contextmanager
def captured() -> Iterator[_Capture]:
    capture = _Capture()
    logger.addHandler(capture)
    try:
        yield capture
    finally:
        logger.removeHandler(capture)


def test_each_authenticated_request_logs_one_complete_line(snapshot):
    config, key = enabled_config()
    with captured() as logs, running(snapshot, config) as client:
        client.post("/mcp", json=INITIALIZE, headers=auth(key))
        client.post("/mcp", json=call_tool("get_card", {"card_id": "amex-gold"}), headers=auth(key))
        client.post("/mcp", json=call_tool("get_card", {"card_id": "nope"}), headers=auth(key))
        client.post(
            "/mcp", json=call_tool("rank_by_category", {"category": "bad"}), headers=auth(key)
        )
        client.post("/mcp", json=call_tool("secret_tool", {}), headers=auth(key))
    started = logs.events("mcp_started")
    assert started[0]["cards"] == 109
    assert started[0]["verified_cards"] == 86

    initialize, ok, unknown_card, invalid, unknown_tool = logs.events("mcp_request")
    assert initialize["rpc_method"] == "initialize"
    assert initialize["client"] == "pytest/1"
    assert initialize["protocol_version"] == "2025-06-18"
    assert ok["tool"] == "get_card"
    assert ok["card_ids"] == ["amex-gold"]
    assert ok["outcome"] == "ok"
    assert ok["http_status"] == 200
    assert ok["response_bytes"] > 0
    assert re.fullmatch(r"[0-9a-f]{8}", ok["key_id"])
    assert unknown_card["outcome"] == "tool_error:unknown_card_id"
    assert invalid["outcome"] == "invalid_arguments"
    assert unknown_tool["tool"] == "<unknown>"


def test_rejections_are_aggregated_not_logged_per_request(snapshot):
    config, _ = enabled_config()
    with captured() as logs, running(snapshot, config) as client:
        for _ in range(5):
            client.post("/mcp", json=INITIALIZE, headers=HEADERS)
    assert logs.events("mcp_request") == []
    assert logs.events("mcp_rejections")[0]["counts"] == {"unauthorized": 5}


def test_aggregator_emits_at_most_once_a_window():
    now = [0.0]
    aggregator = RejectionAggregator(60.0, clock=lambda: now[0])
    with captured() as logs:
        for _ in range(100):
            aggregator.add("unauthorized")
        assert logs.lines == []
        now[0] = 61.0
        aggregator.add("unauthorized")
        assert logs.events("mcp_rejections")[0]["counts"] == {"unauthorized": 101}


def test_disabled_start_logs_a_reason_with_no_secret(snapshot):
    config, key = enabled_config()
    config = replace(config, enabled=False, reason="MCP_API_KEYS is invalid")
    with captured() as logs, running(snapshot, config):
        pass
    assert logs.events("mcp_disabled")[0]["reason"] == "MCP_API_KEYS is invalid"
    assert key not in "".join(logs.lines)


def test_no_secret_or_ip_appears_in_any_log_line(snapshot):
    config, key = enabled_config(replace(FAST, failed_auth_per_client=1))
    secret = key.split("_", 2)[2]
    forged = {"cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.10"}
    with captured() as logs, running(snapshot, config) as client:
        client.post("/mcp", json=INITIALIZE, headers={**auth(key), **forged})
        client.post("/mcp", json=call_tool("get_card", {"card_id": key}), headers=auth(key))
        for _ in range(3):
            client.post(
                "/mcp",
                json=INITIALIZE,
                headers={**HEADERS, **forged, "authorization": f"Bearer {key}x"},
            )
        client.get("/mcp", headers={**auth(key), **forged})
        client.post("/mcp/", json=INITIALIZE, headers=auth(key))
    text = "\n".join(logs.lines)
    assert logs.lines
    assert secret not in text
    assert "Bearer" not in text
    assert "authorization" not in text.lower()
    assert not IP_LIKE.search(text), text


def test_the_logger_is_isolated_from_the_root_logger():
    assert logger.propagate is False
    assert logger.level == logging.INFO
