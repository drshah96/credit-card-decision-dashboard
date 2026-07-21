"""Tests for the seed_catalog.py bulk-seed script.

Like test_drafts.py, these go through the app's real shared database, so
every fixture card uses a "zz-test-" slug prefix and a fixture deletes
anything under that prefix after each test.
"""

import json

import pytest

from backend.db import session_scope
from backend.db_models import CardModel
from backend.scripts.seed_catalog import seed_catalog

TEST_SLUG = "zz-test-seed-card"


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


@pytest.fixture(autouse=True)
def cleanup_test_rows():
    yield
    with session_scope() as session:
        session.query(CardModel).filter(CardModel.slug.like("zz-test%")).delete(
            synchronize_session=False
        )


def test_seeds_every_matching_file(tmp_path):
    (tmp_path / "card.json").write_text(json.dumps(make_card_json()))

    count = seed_catalog(str(tmp_path / "*.json"))

    assert count == 1
    with session_scope() as session:
        card = session.query(CardModel).filter_by(slug=TEST_SLUG).one()
        assert card.name == "Test Card"


def test_reruns_upsert_instead_of_duplicating(tmp_path):
    path = tmp_path / "card.json"
    path.write_text(json.dumps(make_card_json({"annual_fee": 500})))
    seed_catalog(str(tmp_path / "*.json"))

    path.write_text(json.dumps(make_card_json({"annual_fee": 650})))
    seed_catalog(str(tmp_path / "*.json"))

    with session_scope() as session:
        cards = session.query(CardModel).filter_by(slug=TEST_SLUG).all()
        assert len(cards) == 1
        assert cards[0].annual_fee_cents == 65000


def test_errors_when_no_files_match(tmp_path):
    with pytest.raises(SystemExit):
        seed_catalog(str(tmp_path / "*.json"))


def test_errors_on_invalid_schema(tmp_path):
    # Missing several required Card fields (insurance, credits, etc.)
    (tmp_path / "bad.json").write_text(json.dumps({"id": TEST_SLUG, "name": "Broken"}))

    with pytest.raises(SystemExit):
        seed_catalog(str(tmp_path / "*.json"))

    with session_scope() as session:
        assert session.query(CardModel).filter_by(slug=TEST_SLUG).count() == 0


def test_errors_on_non_object_json(tmp_path):
    (tmp_path / "list.json").write_text(json.dumps([1, 2, 3]))

    with pytest.raises(SystemExit):
        seed_catalog(str(tmp_path / "*.json"))
