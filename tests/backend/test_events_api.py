"""Tests for POST /api/events and the record_page_view() service it calls.

Uses the shared session-scoped test database from conftest.py (same as
test_cards_api.py) rather than an isolated per-test engine — record_page_view,
like every function in services/cards.py, goes through the global
session_scope() rather than taking a Session param, so there's no clean way
to swap in a throwaway engine per test the way test_upsert.py does for
upsert_card. Each test uses its own unique session_id and queries only for
that id, so tests stay independent despite sharing a database that
persists (and accumulates rows) across the whole test run.
"""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.db import session_scope
from backend.db_models import PageView, SessionModel
from backend.main import app

client = TestClient(app)


def _unique_session_id() -> str:
    return f"test-session-{uuid4()}"


def test_track_event_creates_a_session_and_a_page_view() -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={
            "session_id": session_id,
            "event_type": "card_view",
            "issuer": "Citi",
            "card_id": "citi-strata-premier",
        },
    )

    assert response.status_code == 200
    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        views = db.query(PageView).filter(PageView.session_id == session_id).all()
        assert len(views) == 1
        assert views[0].event_type == "card_view"
        assert views[0].issuer == "Citi"
        assert views[0].card_slug == "citi-strata-premier"


def test_track_event_reuses_the_same_session_across_multiple_views() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Chase"},
    )
    client.post(
        "/api/events",
        json={
            "session_id": session_id,
            "event_type": "card_view",
            "issuer": "Chase",
            "card_id": "chase-sapphire-preferred",
        },
    )

    with session_scope() as db:
        # One session row, not two — the second call must update the
        # existing row rather than fail on the primary key or create a
        # duplicate.
        assert db.query(SessionModel).filter(SessionModel.id == session_id).count() == 1
        views = db.query(PageView).filter(PageView.session_id == session_id).all()
        assert len(views) == 2
        assert {v.event_type for v in views} == {"issuer_view", "card_view"}


def test_track_event_issuer_view_has_no_card_id() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Bilt"},
    )

    with session_scope() as db:
        view = db.query(PageView).filter(PageView.session_id == session_id).one()
        assert view.event_type == "issuer_view"
        assert view.issuer == "Bilt"
        assert view.card_slug is None


def test_track_event_reads_country_from_the_cf_ipcountry_header() -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={"CF-IPCountry": "CA"},
    )

    assert response.status_code == 200
    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.country == "CA"


def test_track_event_treats_unknown_country_placeholder_as_none() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={"CF-IPCountry": "XX"},
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.country is None


def test_track_event_without_the_header_leaves_country_none() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.country is None


def test_track_event_rejects_an_invalid_event_type() -> None:
    response = client.post(
        "/api/events",
        json={"session_id": _unique_session_id(), "event_type": "not_a_real_type"},
    )
    assert response.status_code == 422


def test_track_event_requires_a_session_id() -> None:
    response = client.post("/api/events", json={"event_type": "issuer_view"})
    assert response.status_code == 422
