"""Tests for the seed_catalog.py bulk-seed script.

Like test_drafts.py, these go through the app's real shared database, so
every fixture card uses a "zz-test-" slug prefix and a fixture deletes
anything under that prefix after each test.
"""

import json
from contextlib import contextmanager

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.scripts.seed_catalog as seed_catalog_module
from backend.db import Base, session_scope
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


# ─── deactivate_missing (backlog #13 item 6) ───────────────────────────────
#
# These need their own isolated database rather than the shared one every
# other test in this file uses: conftest.py's session-scoped fixture
# pre-seeds that shared DB with the real 103-card catalog, and
# deactivate_missing=True's UPDATE has no way to know which active rows
# came from this test's tiny tmp_path glob vs. the real catalog — it would
# flip every one of those 103 real cards to inactive for the rest of the
# test session. Swapping seed_catalog's session_scope for one bound to a
# private SQLite file keeps the blast radius to just this test.


@pytest.fixture
def isolated_catalog_db(monkeypatch, tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'isolated_seed_catalog.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    IsolatedSession = sessionmaker(bind=engine)

    @contextmanager
    def isolated_session_scope():
        session = IsolatedSession()
        try:
            yield session
            session.commit()
        finally:
            session.close()

    monkeypatch.setattr(seed_catalog_module, "session_scope", isolated_session_scope)
    yield IsolatedSession
    engine.dispose()


def test_deactivate_missing_off_by_default_for_a_non_default_pattern(tmp_path):
    path = tmp_path / "card.json"
    path.write_text(json.dumps(make_card_json()))
    seed_catalog(str(tmp_path / "*.json"))

    path.unlink()
    (tmp_path / "other.json").write_text(json.dumps(make_card_json({"id": "zz-test-other"})))
    seed_catalog(str(tmp_path / "*.json"))  # deactivate_missing not passed -> inferred False

    with session_scope() as session:
        card = session.query(CardModel).filter_by(slug=TEST_SLUG).one()
        assert card.is_active is True


def test_deactivate_missing_marks_a_disappeared_card_inactive(isolated_catalog_db, tmp_path):
    path = tmp_path / "card.json"
    path.write_text(json.dumps(make_card_json()))
    seed_catalog(str(tmp_path / "*.json"), deactivate_missing=True)

    path.unlink()
    (tmp_path / "other.json").write_text(json.dumps(make_card_json({"id": "zz-test-other"})))
    seed_catalog(str(tmp_path / "*.json"), deactivate_missing=True)

    session = isolated_catalog_db()
    card = session.query(CardModel).filter_by(slug=TEST_SLUG).one()
    assert card.is_active is False
    session.close()


def test_a_reappearing_card_is_reactivated(isolated_catalog_db, tmp_path):
    path = tmp_path / "card.json"
    other_path = tmp_path / "other.json"
    path.write_text(json.dumps(make_card_json()))
    seed_catalog(str(tmp_path / "*.json"), deactivate_missing=True)

    path.unlink()
    other_path.write_text(json.dumps(make_card_json({"id": "zz-test-other"})))
    seed_catalog(str(tmp_path / "*.json"), deactivate_missing=True)

    session = isolated_catalog_db()
    assert session.query(CardModel).filter_by(slug=TEST_SLUG).one().is_active is False
    session.close()

    path.write_text(json.dumps(make_card_json()))
    other_path.unlink()
    seed_catalog(str(tmp_path / "*.json"), deactivate_missing=True)

    session = isolated_catalog_db()
    assert session.query(CardModel).filter_by(slug=TEST_SLUG).one().is_active is True
    session.close()
