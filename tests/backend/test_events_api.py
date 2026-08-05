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

import threading
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import session_scope
from backend.db_models import PageView, SessionModel
from backend.main import _device_type, _is_bot, app
from backend.services.events import record_page_view

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


def test_track_event_extracts_the_host_from_a_full_referrer_url() -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={
            "session_id": session_id,
            "event_type": "issuer_view",
            "issuer": "Amex",
            "referrer": "https://www.google.com/search?q=amex+gold",
        },
    )

    assert response.status_code == 200
    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.referrer == "www.google.com"


def test_track_event_without_a_referrer_leaves_it_none() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.referrer is None


def test_device_type_returns_none_for_a_missing_user_agent() -> None:
    """Covers the genuinely-absent-header case (a None argument) directly —
    unreachable through the HTTP-level tests below, since TestClient always
    sends some User-Agent value, even an empty-string override."""
    assert _device_type(None) is None


@pytest.mark.parametrize(
    "user_agent",
    [
        "Googlebot/2.1 (+http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
        "facebookexternalhit/1.1",
        "curl/8.4.0",
        "Wget/1.21.3",
        "python-requests/2.31.0",
        "PostmanRuntime/7.32.3",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "HeadlessChrome/119.0.0.0 Safari/537.36",
    ],
)
def test_is_bot_true_for_known_bot_and_tool_user_agents(user_agent: str) -> None:
    assert _is_bot(user_agent) is True


@pytest.mark.parametrize(
    "user_agent",
    [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    ],
)
def test_is_bot_false_for_real_browser_user_agents(user_agent: str) -> None:
    assert _is_bot(user_agent) is False


def test_is_bot_true_for_a_missing_user_agent() -> None:
    assert _is_bot(None) is True


def test_track_event_from_a_bot_user_agent_returns_ok_but_records_nothing() -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Chase"},
        headers={"User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"},
    )

    assert response.status_code == 200
    with session_scope() as db:
        assert db.query(SessionModel).filter(SessionModel.id == session_id).count() == 0
        assert db.query(PageView).filter(PageView.session_id == session_id).count() == 0


def test_track_event_reads_device_type_mobile_from_an_iphone_user_agent() -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            )
        },
    )

    assert response.status_code == 200
    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.device_type == "mobile"


def test_track_event_reads_device_type_mobile_from_an_android_phone_user_agent() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"
            )
        },
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.device_type == "mobile"


def test_track_event_reads_device_type_tablet_from_an_ipad_user_agent() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            )
        },
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.device_type == "tablet"


def test_track_event_reads_device_type_tablet_from_an_android_tablet_user_agent() -> None:
    """Android tablets omit the "Mobile" token that Android phones include —
    that's the actual signal _device_type() uses to tell them apart."""
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            )
        },
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.device_type == "tablet"


def test_track_event_reads_device_type_desktop_from_a_desktop_user_agent() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            )
        },
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        assert session_row.device_type == "desktop"


def test_track_event_with_an_empty_user_agent_records_nothing() -> None:
    """TestClient sends a default "testclient" User-Agent on every request
    (unlike a real browser omitting the header entirely, which isn't
    reachable through the test client) — classified as "desktop" like any
    other non-mobile/tablet UA, covered separately below. This test instead
    covers the genuinely-empty-header case: since _is_bot() treats a falsy
    User-Agent as a bot signal (every real browser sends one), this no
    longer even reaches device_type classification — the event is dropped
    before any row is written, same as test_track_event_from_a_bot_user_agent
    above."""
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
        headers={"User-Agent": ""},
    )

    with session_scope() as db:
        assert db.get(SessionModel, session_id) is None


def test_track_event_with_an_unrecognized_user_agent_defaults_to_desktop() -> None:
    session_id = _unique_session_id()

    client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": "issuer_view", "issuer": "Amex"},
    )

    with session_scope() as db:
        session_row = db.get(SessionModel, session_id)
        assert session_row is not None
        # TestClient's own default User-Agent ("testclient") doesn't match
        # any mobile/tablet signal, same as any other unrecognized UA.
        assert session_row.device_type == "desktop"


def test_record_page_view_recovers_from_concurrent_session_insert_race() -> None:
    """Two requests racing to record the same brand-new session_id (e.g.
    React StrictMode double-invoking an effect on mount, or two tabs opened
    at once) must not crash — one wins the INSERT, the other must recover
    by re-querying instead of surfacing sessions' primary-key UNIQUE
    constraint as an unhandled IntegrityError. A Barrier gets both threads
    to record_page_view's entry at the same moment, reliably reproducing
    the race instead of depending on incidental thread-scheduling luck —
    same technique as
    test_upsert.py::test_get_or_create_recovers_from_concurrent_insert_race
    for the same class of race in a different function."""
    session_id = _unique_session_id()
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def worker() -> None:
        try:
            barrier.wait(timeout=5)
            record_page_view(
                session_id=session_id,
                event_type="issuer_view",
                issuer="Chase",
                card_slug=None,
            )
        except BaseException as exc:  # noqa: BLE001 — surface it to the main thread below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert not errors, f"record_page_view raised under concurrent access: {errors}"
    with session_scope() as db:
        assert db.query(SessionModel).filter(SessionModel.id == session_id).count() == 1
        assert db.query(PageView).filter(PageView.session_id == session_id).count() == 2


@pytest.mark.parametrize(
    "event_type",
    [
        "home_view",
        "top_pick_view",
        "compare_view",
        "methodology_view",
        "top_pick_card_selected",
        "compare_card_selected",
    ],
)
def test_track_event_accepts_the_new_page_and_selection_event_types(event_type: str) -> None:
    session_id = _unique_session_id()

    response = client.post(
        "/api/events",
        json={"session_id": session_id, "event_type": event_type, "card_id": "amex-gold"},
    )

    assert response.status_code == 200
    with session_scope() as db:
        view = db.query(PageView).filter(PageView.session_id == session_id).one()
        assert view.event_type == event_type


def test_track_event_rejects_an_invalid_event_type() -> None:
    response = client.post(
        "/api/events",
        json={"session_id": _unique_session_id(), "event_type": "not_a_real_type"},
    )
    assert response.status_code == 422


def test_track_event_requires_a_session_id() -> None:
    response = client.post("/api/events", json={"event_type": "issuer_view"})
    assert response.status_code == 422
