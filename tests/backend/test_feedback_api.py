"""Tests for POST /api/feedback and the record_card_feedback service.

Uses the shared session-scoped test database from conftest.py, like
test_events_api.py, and each test uses its own session id so rows do not
collide across a shared database.

The endpoint is public and unauthenticated and stores the only human-written
text on the site, so most of what is pinned here is about what must *not* reach
the table: junk card slugs that would split a real card's average, bot
submissions, oversized comments, and duplicate rows for one opinion.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.db import session_scope
from backend.db_models import CardFeedback
from backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_feedback_rate_limit() -> None:
    """The limiter is in-process and keyed by client IP, and every test here
    shares one. Six submissions per hour is the whole point of it in
    production, so without this reset the seventh test in the file starts
    failing with a 429 and the failure looks like a bug in the endpoint.
    test_the_rate_limit_actually_bites below exercises it on purpose."""
    main._feedback_rate_limit_hits.clear()


# A real browser UA. Without one _is_bot() treats the caller as automation and
# the submission is accepted and dropped, which would make every test below
# pass while writing nothing.
BROWSER = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36"}

# Any real card. The endpoint rejects slugs that are not in the catalog.
REAL_CARD = "amex-platinum"


def _session_id() -> str:
    return f"test-{uuid4()}"


def _rows(session_id: str) -> list[CardFeedback]:
    with session_scope() as session:
        return list(session.query(CardFeedback).filter_by(session_id=session_id).all())


def test_a_minimal_submission_is_stored() -> None:
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 4, "session_id": sid},
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert response.json()["status"] == "ok"
    rows = _rows(sid)
    assert len(rows) == 1
    assert rows[0].rating == 4
    assert rows[0].card_slug == REAL_CARD


def test_a_full_submission_keeps_every_answer() -> None:
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "rating": 5,
            "maximizes_value": "partly",
            "held_for": "1_to_2y",
            "would_keep": True,
            "comment": "  Worth it if you fly.  ",
            "session_id": sid,
        },
        headers=BROWSER,
    )
    row = _rows(sid)[0]
    assert row.maximizes_value == "partly"
    assert row.held_for == "1_to_2y"
    assert row.would_keep is True
    # Stripped on the way in, so "did they leave a comment" is one question.
    assert row.comment == "Worth it if you fly."


def test_would_keep_false_is_stored_rather_than_treated_as_unanswered() -> None:
    """False is falsy. A truthy check anywhere in this path would turn the most
    interesting answer the form collects into a NULL."""
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 1, "would_keep": False, "session_id": sid},
        headers=BROWSER,
    )
    assert _rows(sid)[0].would_keep is False


def test_a_blank_comment_is_stored_as_null() -> None:
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 3, "comment": "   ", "session_id": sid},
        headers=BROWSER,
    )
    assert _rows(sid)[0].comment is None


def test_nothing_is_published_by_default() -> None:
    """Collected and published are separate decisions. If this ever defaults to
    published, unmoderated visitor text goes live the moment it is written."""
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "session_id": sid},
        headers=BROWSER,
    )
    row = _rows(sid)[0]
    assert row.review_status == "pending"
    assert row.reviewed_at is None


def test_resubmitting_replaces_rather_than_duplicating() -> None:
    """A double click, a retry, or someone changing their mind. Per-card
    averages are the point of this table, so one person must be one row."""
    sid = _session_id()
    first = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "comment": "Love it.", "session_id": sid},
        headers=BROWSER,
    )
    second = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 2, "comment": "Changed my mind.", "session_id": sid},
        headers=BROWSER,
    )
    assert second.status_code == 201
    assert second.json()["feedback_id"] == first.json()["feedback_id"]
    rows = _rows(sid)
    assert len(rows) == 1
    assert rows[0].rating == 2
    assert rows[0].comment == "Changed my mind."


def test_editing_sends_the_row_back_for_review() -> None:
    """The text under review is not the text that was reviewed any more."""
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "session_id": sid},
        headers=BROWSER,
    )
    with session_scope() as session:
        row = session.query(CardFeedback).filter_by(session_id=sid).one()
        row.review_status = "published"

    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 1, "comment": "Actually, no.", "session_id": sid},
        headers=BROWSER,
    )
    assert _rows(sid)[0].review_status == "pending"


def test_one_session_can_review_two_different_cards() -> None:
    """The uniqueness is per session *and* card, not per session."""
    sid = _session_id()
    for card in (REAL_CARD, "chase-sapphire-reserve"):
        client.post(
            "/api/feedback",
            json={"card_id": card, "rating": 4, "session_id": sid},
            headers=BROWSER,
        )
    assert sorted(r.card_slug for r in _rows(sid)) == sorted([REAL_CARD, "chase-sapphire-reserve"])


def test_an_unknown_card_slug_is_dropped_silently() -> None:
    """A junk analytics row is inert; a junk feedback row lands in a per-card
    average. A plausible misspelling would split a real card's score rather
    than obviously breaking, so it never reaches the table."""
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={"card_id": "amex-platinm", "rating": 1, "session_id": sid},
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert _rows(sid) == []


def test_a_bot_submission_is_dropped_silently() -> None:
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "session_id": sid},
        headers={"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
    )
    assert response.status_code == 201
    assert _rows(sid) == []


def test_an_empty_user_agent_is_treated_as_automation() -> None:
    """Every real browser sends one. The header has to be blanked explicitly
    here: TestClient supplies its own "testclient" UA, so simply omitting it
    tests nothing, which is how the first version of this test passed while
    asserting the opposite of what it claimed."""
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "session_id": sid},
        headers={"user-agent": ""},
    )
    assert _rows(sid) == []


def test_ratings_outside_one_to_five_are_rejected() -> None:
    for rating in (0, 6, -1, 100):
        response = client.post(
            "/api/feedback",
            json={"card_id": REAL_CARD, "rating": rating},
            headers=BROWSER,
        )
        assert response.status_code == 422, rating


def test_unknown_bucket_values_are_rejected() -> None:
    """These strings exist in three places: the form, the Pydantic model and a
    DB CHECK. A typo in any one is a 422 in production."""
    for field, value in [("held_for", "ages"), ("maximizes_value", "maybe")]:
        response = client.post(
            "/api/feedback",
            json={"card_id": REAL_CARD, "rating": 3, field: value},
            headers=BROWSER,
        )
        assert response.status_code == 422, field


def test_an_oversized_comment_is_rejected_rather_than_truncated() -> None:
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 3, "comment": "x" * 1001},
        headers=BROWSER,
    )
    assert response.status_code == 422


def test_a_comment_at_the_limit_is_accepted() -> None:
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 3, "comment": "x" * 1000, "session_id": sid},
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert len(_rows(sid)[0].comment or "") == 1000


def test_a_submission_without_a_session_id_is_still_recorded() -> None:
    """Someone with localStorage disabled still gets to be heard. The unique
    constraint only constrains sessioned submissions, which is why the slug
    check and the rate limiter carry the weight here."""
    before = len(_all_rows_for_card(REAL_CARD))
    response = client.post(
        "/api/feedback", json={"card_id": REAL_CARD, "rating": 4}, headers=BROWSER
    )
    assert response.status_code == 201
    assert len(_all_rows_for_card(REAL_CARD)) == before + 1


def _all_rows_for_card(slug: str) -> list[CardFeedback]:
    with session_scope() as session:
        return list(session.query(CardFeedback).filter_by(card_slug=slug, session_id=None).all())


def test_the_rate_limit_actually_bites() -> None:
    """Feedback deliberately does not share /api/events' 120-per-minute budget.
    120 written opinions a minute from one client is a spam firehose against a
    table whose whole purpose is human text."""
    accepted = 0
    for _ in range(main._FEEDBACK_RATE_LIMIT_MAX + 3):
        response = client.post(
            "/api/feedback",
            json={"card_id": REAL_CARD, "rating": 3, "session_id": _session_id()},
            headers=BROWSER,
        )
        if response.status_code == 201:
            accepted += 1
        else:
            assert response.status_code == 429
    assert accepted == main._FEEDBACK_RATE_LIMIT_MAX


def test_the_feedback_budget_is_far_tighter_than_the_analytics_one() -> None:
    """A regression here would be silent: the endpoint keeps working, it just
    stops being a meaningful bound."""
    assert main._FEEDBACK_RATE_LIMIT_MAX < main._RATE_LIMIT_MAX_EVENTS / 10
    assert main._FEEDBACK_RATE_LIMIT_WINDOW_SECONDS >= main._RATE_LIMIT_WINDOW_SECONDS


def test_spending_the_feedback_budget_does_not_block_analytics() -> None:
    """Two separate counters. If they shared one, a burst of feedback would
    stop page views recording, which is a much bigger blast radius."""
    for _ in range(main._FEEDBACK_RATE_LIMIT_MAX + 2):
        client.post(
            "/api/feedback",
            json={"card_id": REAL_CARD, "rating": 3, "session_id": _session_id()},
            headers=BROWSER,
        )
    event = client.post(
        "/api/events",
        json={"session_id": _session_id(), "event_type": "home_view"},
        headers=BROWSER,
    )
    assert event.status_code == 200
