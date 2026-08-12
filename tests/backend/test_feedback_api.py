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
from backend.db_models import LIKED_FEATURES, CardFeedback, CardFeedbackFeature
from backend.main import app
from backend.models import MAX_FEATURES

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


def _features(feedback_id: int) -> list[str]:
    with session_scope() as session:
        return sorted(
            f.feature for f in session.query(CardFeedbackFeature).filter_by(feedback_id=feedback_id)
        )


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


# ─── Interested respondents ──────────────────────────────────────────────────
# The second branch of the form: someone who does not hold the card but is
# interested, naming the feature that drew them. Before this, that visitor had
# nothing to submit and left no trace.


def test_an_interested_respondent_is_stored_without_holder_fields() -> None:
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": ["credits"],
            "comment": "The Uber credit looks useful.",
            "session_id": sid,
        },
        headers=BROWSER,
    )
    assert response.status_code == 201
    row = _rows(sid)[0]
    assert row.respondent_type == "interested"
    assert _features(row.feedback_id) == ["credits"]
    assert row.rating is None
    assert row.held_for is None
    assert row.would_keep is None
    assert row.maximizes_value is None


def test_a_submission_without_a_respondent_type_is_treated_as_a_holder() -> None:
    """A browser still running the previous bundle during a deploy posts no
    respondent_type. Every submission that existed before the column did was a
    holder's, so that is what it defaults to rather than a 422."""
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 4, "session_id": sid},
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert _rows(sid)[0].respondent_type == "holder"


def test_the_two_branches_cannot_be_mixed() -> None:
    """Rejected rather than quietly stripped: a payload answering both branches
    means the client and the model disagree about the form, and silently
    dropping half of it would hide that."""
    mixed = [
        ("holder with no rating", {"respondent_type": "holder"}),
        (
            "interested with a rating",
            {"respondent_type": "interested", "rating": 4, "features": ["credits"]},
        ),
        (
            "interested with held_for",
            {"respondent_type": "interested", "features": ["credits"], "held_for": "1_to_2y"},
        ),
        (
            "interested with would_keep",
            {"respondent_type": "interested", "features": ["credits"], "would_keep": True},
        ),
        (
            # The fourth holder-only field, and the one most likely to be
            # forgotten when this list is extended.
            "interested with maximizes_value",
            {
                "respondent_type": "interested",
                "features": ["credits"],
                "maximizes_value": "partly",
            },
        ),
        ("interested naming nothing", {"respondent_type": "interested"}),
    ]
    for label, payload in mixed:
        response = client.post(
            "/api/feedback", json={"card_id": REAL_CARD, **payload}, headers=BROWSER
        )
        assert response.status_code == 422, label


def test_an_unknown_liked_feature_is_rejected() -> None:
    """These strings live in three places: the form, the Pydantic Literal and a
    DB CHECK. A typo in any one is a 422 in production."""
    response = client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "respondent_type": "interested", "features": ["vibes"]},
        headers=BROWSER,
    )
    assert response.status_code == 422


def test_every_option_the_form_can_send_is_accepted() -> None:
    """The other direction from the CHECK constraint: a value the form offers
    that the API rejects would be a dead option nobody can pick.

    Iterates the canonical tuple rather than a hand-typed copy.
    test_liked_feature_options.py is what proves that tuple agrees with the
    TypeScript union, the Pydantic Literal and the CHECK.
    """
    for feature in LIKED_FEATURES:
        # Eight submissions exceeds the 6-per-hour budget, which is the limiter
        # doing its job. Cleared per iteration so this measures what it claims.
        main._feedback_rate_limit_hits.clear()
        response = client.post(
            "/api/feedback",
            json={
                "card_id": REAL_CARD,
                "respondent_type": "interested",
                "features": [feature],
                "session_id": _session_id(),
            },
            headers=BROWSER,
        )
        assert response.status_code == 201, feature


def test_up_to_the_cap_is_accepted_and_every_pick_is_stored() -> None:
    """The question is multi-select. Storing only the first pick would look
    identical from the endpoint, which answers 201 either way."""
    sid = _session_id()
    picks = list(LIKED_FEATURES[:MAX_FEATURES])
    response = client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": picks,
            "session_id": sid,
        },
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert sorted(_features(_rows(sid)[0].feedback_id)) == sorted(picks)


def test_more_than_the_cap_is_rejected() -> None:
    """Nothing enforced this before: the cap was raised from one to three and no
    test noticed, because no test named a number. The frontend disables the
    remaining options at the cap, so reaching here means a crafted payload."""
    response = client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": list(LIKED_FEATURES[: MAX_FEATURES + 1]),
            "session_id": _session_id(),
        },
        headers=BROWSER,
    )
    assert response.status_code == 422
    assert "at most" in response.text


def test_the_same_pick_twice_is_deduped_rather_than_rejected() -> None:
    """Sending one feature twice means it once. Deduping happens before the cap
    is applied, so a client that repeats itself is not punished for it, and the
    child table's unique constraint never sees the duplicate.

    The ordering is load-bearing and easy to lose: Pydantic's own `max_length`
    would run before the validator, so expressing the cap that way would 422
    this payload instead of accepting it.
    """
    sid = _session_id()
    response = client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": ["credits", "credits"],
            "session_id": sid,
        },
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert _features(_rows(sid)[0].feedback_id) == ["credits"]


def test_duplicates_are_collapsed_before_the_cap_not_after() -> None:
    """The cap counts distinct picks. A payload of cap+1 entries that dedupes to
    cap is a client repeating itself, not someone exceeding the limit."""
    sid = _session_id()
    picks = list(LIKED_FEATURES[:MAX_FEATURES])
    response = client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": [*picks, picks[0]],
            "session_id": sid,
        },
        headers=BROWSER,
    )
    assert response.status_code == 201
    assert sorted(_features(_rows(sid)[0].feedback_id)) == sorted(picks)


def test_a_holder_may_name_several_features_or_none() -> None:
    """Optional for holders and capped the same way. Both branches answer over
    one option set with one cap, which is what makes the two distributions
    comparable; a different cap per branch would silently weight one of them."""
    sid = _session_id()
    picks = list(LIKED_FEATURES[:MAX_FEATURES])
    assert (
        client.post(
            "/api/feedback",
            json={
                "card_id": REAL_CARD,
                "rating": 4,
                "features": picks,
                "session_id": sid,
            },
            headers=BROWSER,
        ).status_code
        == 201
    )
    assert sorted(_features(_rows(sid)[0].feedback_id)) == sorted(picks)

    bare = _session_id()
    assert (
        client.post(
            "/api/feedback",
            json={"card_id": REAL_CARD, "rating": 4, "session_id": bare},
            headers=BROWSER,
        ).status_code
        == 201
    )
    assert _features(_rows(bare)[0].feedback_id) == []


def test_resubmitting_replaces_every_previous_pick() -> None:
    """The write path deletes the old child rows before inserting the new ones.
    With more than one pick allowed, a missed delete no longer merely leaves a
    stale answer: it unions the two submissions and can carry someone past the
    cap they were held to."""
    sid = _session_id()
    for features in (list(LIKED_FEATURES[:MAX_FEATURES]), ["lounge_access"]):
        client.post(
            "/api/feedback",
            json={
                "card_id": REAL_CARD,
                "respondent_type": "interested",
                "features": features,
                "session_id": sid,
            },
            headers=BROWSER,
        )
    rows = _rows(sid)
    assert len(rows) == 1
    assert _features(rows[0].feedback_id) == ["lounge_access"]


def test_switching_branch_on_resubmission_clears_the_other_side() -> None:
    """Someone who rates the card, then corrects themselves to 'interested',
    must not leave a stale rating behind on the row that replaces it."""
    sid = _session_id()
    client.post(
        "/api/feedback",
        json={"card_id": REAL_CARD, "rating": 5, "held_for": "1_to_2y", "session_id": sid},
        headers=BROWSER,
    )
    client.post(
        "/api/feedback",
        json={
            "card_id": REAL_CARD,
            "respondent_type": "interested",
            "features": ["earn_rates"],
            "session_id": sid,
        },
        headers=BROWSER,
    )
    rows = _rows(sid)
    assert len(rows) == 1
    assert rows[0].respondent_type == "interested"
    assert rows[0].rating is None
    assert rows[0].held_for is None
    assert _features(rows[0].feedback_id) == ["earn_rates"]
