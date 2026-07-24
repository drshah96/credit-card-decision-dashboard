"""Tests for the drafts.py review-queue CLI.

Unlike test_upsert.py, these go through the app's real shared database
(backend.db.session_scope) since the cmd_* functions hardcode that import —
they aren't parameterized to accept a test session. To avoid colliding with
the 4 real cards conftest.py seeds every session, every draft/card created
here uses a "zz-test-" slug prefix, and a fixture deletes anything under
that prefix after each test.
"""

import argparse
import json
from datetime import datetime, timezone

import pytest

from backend.db import session_scope
from backend.db_models import CardDraft, CardModel
from backend.scripts import drafts

TEST_SLUG = "zz-test-card"


def make_card_json(overrides: dict | None = None) -> dict:
    data = {
        "id": TEST_SLUG,
        "name": "Test Card",
        "issuer": "Zz Test Bank",
        "network": "TEST NETWORK",
        "points_program": "Test Points",
        "accent_color": "#123456",
        "annual_fee": 500,
        "effective_cost": "Medium",
        "verdict": {"status": "situational", "text": "Depends on usage"},
        "earn_rates": [
            {
                "emoji": "✈️",
                "multiplier": "3×",
                "category": "Travel",
                "highlight": True,
                "is_base": False,
            },
        ],
        "earn_note": "",
        "points": {
            "currency": "Test Points",
            "redemption_options": [{"method": "Statement credit", "cpp": 1.0, "best": True}],
            "per_100k": "$1,000",
            "note": "",
        },
        "transfer_partners": {
            "airline_count": 0,
            "hotel_count": 0,
            "highlight": "",
            "recent_changes": "",
            "partners": [],
        },
        "credits": [
            {
                "id": "travel",
                "name": "Travel Credit",
                "subtitle": "",
                "max_annual": 300,
                "default_value": 0,
                "tier": "easy",
                "removed": False,
                "description": "",
                "tips": [],
            },
        ],
        "insurance": [{"coverage": "Rental car CDW", "detail": "Primary", "level": "strong"}],
        "protection_note": "",
        "rental_note": "",
        "status_perks": [],
        "services": [],
        "additional_cards": {"title": "", "options": [], "note": ""},
        "timeline": [],
    }
    if overrides:
        data.update(overrides)
    return data


@pytest.fixture
def json_file(tmp_path):
    def _write(overrides: dict | None = None):
        path = tmp_path / "draft.json"
        path.write_text(json.dumps(make_card_json(overrides)))
        return str(path)

    return _write


@pytest.fixture(autouse=True)
def cleanup_test_rows():
    yield
    with session_scope() as session:
        session.query(CardDraft).filter(CardDraft.card_slug.like("zz-test%")).delete(
            synchronize_session=False
        )
        session.query(CardModel).filter(CardModel.slug.like("zz-test%")).delete(
            synchronize_session=False
        )


def add_args(
    json_path, slug=TEST_SLUG, source_url="https://example.com/card"
) -> argparse.Namespace:
    return argparse.Namespace(slug=slug, source_url=source_url, json_file=json_path)


# ─── add ─────────────────────────────────────────────────────────────────────


def test_add_creates_pending_draft(json_file):
    drafts.cmd_add(add_args(json_file()))

    with session_scope() as session:
        draft = session.query(CardDraft).filter_by(card_slug=TEST_SLUG).one()
        assert draft.status == "pending"
        assert draft.source_url == "https://example.com/card"
        assert json.loads(draft.extracted_json)["name"] == "Test Card"


def test_add_rejects_slug_mismatch(json_file):
    path = json_file({"id": "some-other-slug"})
    with pytest.raises(SystemExit):
        drafts.cmd_add(add_args(path, slug=TEST_SLUG))

    with session_scope() as session:
        assert session.query(CardDraft).filter_by(card_slug=TEST_SLUG).count() == 0


def test_add_rejects_invalid_schema(json_file, tmp_path):
    # Missing several required Card fields (insurance, credits, etc.)
    path = tmp_path / "bad.json"
    path.write_text(json.dumps({"id": TEST_SLUG, "name": "Broken"}))

    with pytest.raises(SystemExit):
        drafts.cmd_add(add_args(str(path)))

    with session_scope() as session:
        assert session.query(CardDraft).filter_by(card_slug=TEST_SLUG).count() == 0


# ─── list / show ─────────────────────────────────────────────────────────────


def test_list_filters_by_status(json_file, capsys):
    drafts.cmd_add(add_args(json_file()))
    capsys.readouterr()

    drafts.cmd_list(argparse.Namespace(status="pending"))
    out = capsys.readouterr().out
    assert TEST_SLUG in out

    drafts.cmd_list(argparse.Namespace(status="approved"))
    out = capsys.readouterr().out
    assert TEST_SLUG not in out


def test_show_errors_on_missing_draft():
    with pytest.raises(SystemExit):
        drafts.cmd_show(argparse.Namespace(draft_id=999_999))


def test_show_prints_extracted_json(json_file, capsys):
    drafts.cmd_add(add_args(json_file()))
    with session_scope() as session:
        draft_id = session.query(CardDraft).filter_by(card_slug=TEST_SLUG).one().draft_id

    capsys.readouterr()
    drafts.cmd_show(argparse.Namespace(draft_id=draft_id))
    out = capsys.readouterr().out
    assert TEST_SLUG in out
    assert '"name": "Test Card"' in out


# ─── promote ─────────────────────────────────────────────────────────────────


def _add_and_get_id(json_file, overrides=None) -> int:
    drafts.cmd_add(add_args(json_file(overrides)))
    with session_scope() as session:
        # Drafts intentionally accumulate as history (re-adding the same slug
        # doesn't replace prior drafts) — grab the one just created, not "the"
        # draft for this slug.
        return (
            session.query(CardDraft)
            .filter_by(card_slug=TEST_SLUG)
            .order_by(CardDraft.draft_id.desc())
            .first()
            .draft_id
        )


def test_promote_upserts_card_and_marks_approved(json_file):
    draft_id = _add_and_get_id(json_file)

    drafts.cmd_promote(argparse.Namespace(draft_id=draft_id, notes="looks good"))

    with session_scope() as session:
        card = session.query(CardModel).filter_by(slug=TEST_SLUG).one()
        assert card.name == "Test Card"

        draft = session.get(CardDraft, draft_id)
        assert draft.status == "approved"
        assert draft.reviewer_notes == "looks good"
        assert draft.reviewed_at is not None


def test_promote_missing_draft_errors(json_file):
    with pytest.raises(SystemExit):
        drafts.cmd_promote(argparse.Namespace(draft_id=999_999, notes=None))


def test_promote_already_approved_blocked(json_file):
    draft_id = _add_and_get_id(json_file)
    drafts.cmd_promote(argparse.Namespace(draft_id=draft_id, notes=None))

    with pytest.raises(SystemExit):
        drafts.cmd_promote(argparse.Namespace(draft_id=draft_id, notes=None))


def test_promote_rejected_draft_blocked(json_file):
    """Regression test: `promote` used to only check `status == "approved"`,
    so a draft a reviewer explicitly rejected could still be silently
    promoted. It must now be blocked the same as an already-approved one."""
    draft_id = _add_and_get_id(json_file)
    drafts.cmd_reject(argparse.Namespace(draft_id=draft_id, notes="fee is wrong"))

    with pytest.raises(SystemExit):
        drafts.cmd_promote(argparse.Namespace(draft_id=draft_id, notes=None))

    with session_scope() as session:
        assert session.query(CardModel).filter_by(slug=TEST_SLUG).count() == 0
        draft = session.get(CardDraft, draft_id)
        assert draft.status == "rejected"  # unchanged by the blocked promote attempt


def test_promote_reruns_upsert_for_updated_draft(json_file):
    """A card can be promoted, then re-researched and re-added as a fresh
    draft (e.g. after a fee change) — promoting the new draft should update
    the existing card row, not fail or create a duplicate."""
    first_id = _add_and_get_id(json_file, {"annual_fee": 500})
    drafts.cmd_promote(argparse.Namespace(draft_id=first_id, notes=None))

    second_id = _add_and_get_id(json_file, {"annual_fee": 650})
    drafts.cmd_promote(argparse.Namespace(draft_id=second_id, notes=None))

    with session_scope() as session:
        cards = session.query(CardModel).filter_by(slug=TEST_SLUG).all()
        assert len(cards) == 1
        assert cards[0].annual_fee_cents == 65000


# ─── reject ──────────────────────────────────────────────────────────────────


def test_reject_marks_status_and_notes(json_file):
    draft_id = _add_and_get_id(json_file)

    before = datetime.now(timezone.utc)
    drafts.cmd_reject(argparse.Namespace(draft_id=draft_id, notes="numbers don't match the source"))

    with session_scope() as session:
        draft = session.get(CardDraft, draft_id)
        assert draft.status == "rejected"
        assert draft.reviewer_notes == "numbers don't match the source"
        assert draft.reviewed_at >= before.replace(tzinfo=None)


def test_reject_missing_draft_errors():
    with pytest.raises(SystemExit):
        drafts.cmd_reject(argparse.Namespace(draft_id=999_999, notes="n/a"))
