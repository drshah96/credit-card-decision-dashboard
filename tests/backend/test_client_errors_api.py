"""Tests for POST /api/client-errors — first-party frontend error capture
(issue #149). Same shared test database arrangement as test_events_api.py,
and the same posture under test: public endpoint, silent drops, hard caps."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.db import session_scope
from backend.db_models import ClientError
from backend.main import app

client = TestClient(app)

BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0"}


def _payload(**overrides):
    base = {
        "message": f"TypeError: test {uuid4()}",
        "session_id": f"test-session-{uuid4()}",
        "path": "/cards/amex-platinum",
        "stack": "TypeError: test\n    at t (index-abc123.js:1:100)",
        "component_stack": "\n    at CardDetailPage\n    at App",
    }
    base.update(overrides)
    return base


def test_records_an_error_with_derived_device_type() -> None:
    payload = _payload()
    response = client.post("/api/client-errors", json=payload, headers=BROWSER_UA)

    assert response.status_code == 200
    with session_scope() as db:
        row = db.query(ClientError).filter(ClientError.message == payload["message"]).one()
        assert row.session_id == payload["session_id"]
        assert row.path == payload["path"]
        assert row.stack == payload["stack"]
        assert row.component_stack == payload["component_stack"]
        # Derived server-side from the UA header, same helper as sessions —
        # the header itself must never be stored.
        assert row.device_type == "desktop"


def test_message_is_required() -> None:
    response = client.post(
        "/api/client-errors",
        json={"session_id": "test-x", "path": "/"},
        headers=BROWSER_UA,
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("message", 500),
        ("session_id", 64),
        ("path", 512),
        ("stack", 4000),
        ("component_stack", 4000),
    ],
)
def test_rejects_oversized_strings(field: str, limit: int) -> None:
    """Same reasoning as EventIn's caps: public unauthenticated write path,
    so every string is bounded before it can reach the database."""
    response = client.post(
        "/api/client-errors",
        json=_payload(**{field: "A" * (limit + 1)}),
        headers=BROWSER_UA,
    )
    assert response.status_code == 422, f"{field} accepted {limit + 1} chars"


def test_bot_traffic_is_dropped_silently() -> None:
    payload = _payload()
    response = client.post(
        "/api/client-errors",
        json=payload,
        headers={"User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"},
    )

    # Same contract as /api/events: 200 either way, no row.
    assert response.status_code == 200
    with session_scope() as db:
        assert (
            db.query(ClientError).filter(ClientError.message == payload["message"]).one_or_none()
            is None
        )


def test_shares_the_rate_limit_budget_with_events() -> None:
    """The two endpoints deliberately draw on one per-client allowance — an
    error storm shouldn't get a fresh budget on top of the events one.
    Rather than sending 120 real requests, exhaust the bucket directly and
    prove a report is then dropped (200, no row)."""
    ip = "203.0.113.77"
    key = main._client_key(type("R", (), {"headers": {"cf-connecting-ip": ip}, "client": None})())
    import time

    main._rate_limit_hits[key] = (time.monotonic(), main._RATE_LIMIT_MAX_EVENTS)
    try:
        payload = _payload()
        response = client.post(
            "/api/client-errors",
            json=payload,
            headers={**BROWSER_UA, "CF-Connecting-IP": ip},
        )
        assert response.status_code == 200
        with session_scope() as db:
            assert (
                db.query(ClientError)
                .filter(ClientError.message == payload["message"])
                .one_or_none()
                is None
            )
    finally:
        main._rate_limit_hits.pop(key, None)
