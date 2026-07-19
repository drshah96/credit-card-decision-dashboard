"""Tests for upsert_card() — the shared path for every card write, whether
from a promoted draft or a direct re-sync. Each test gets its own fresh
SQLite file (not the session-scoped DB in conftest.py) so lookup-table
dedup and re-promotion behavior can be checked in isolation, independent
of whatever the API-level tests have already seeded.
"""

import os
import tempfile
import threading
from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.db_models import Base, CardModel, Issuer, LoyaltyProgram, Network
from backend.scripts.upsert import (
    _get_or_create,
    _parse_event_date,
    _parse_multiplier,
    _slugify,
    upsert_card,
)

# ─── Isolated per-test database ────────────────────────────────────────────


def _new_engine(path):
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db", prefix="test_upsert_")
    os.close(fd)
    engine = _new_engine(path)
    Base.metadata.create_all(engine)
    engine.dispose()
    try:
        yield path
    finally:
        os.remove(path)


@pytest.fixture
def session(db_path):
    engine = _new_engine(db_path)
    db_session = sessionmaker(bind=engine)()
    try:
        yield db_session
    finally:
        db_session.close()
        engine.dispose()


# ─── Fixture data ───────────────────────────────────────────────────────────


def make_card_data(overrides: dict | None = None) -> dict:
    data = {
        "id": "test-card",
        "name": "Test Card",
        "issuer": "Test Bank",
        "network": "TEST NETWORK",
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
            {
                "emoji": "💳",
                "multiplier": "1×",
                "category": "Everything else",
                "highlight": False,
                "is_base": True,
            },
        ],
        "earn_note": "Some earn note.",
        "points": {
            "currency": "Test Points",
            "redemption_options": [
                {"method": "Transfer partners", "cpp": 1.5, "best": True},
                {"method": "Statement credit", "cpp": 0.8, "best": False},
            ],
            "per_100k": "$1,500",
            "note": "Transfer for best value.",
        },
        "transfer_partners": {
            "airline_count": 5,
            "hotel_count": 2,
            "highlight": "Some highlight text.",
            "recent_changes": "Nothing recent.",
            "partners": [],
        },
        "credits": [
            {
                "id": "travel",
                "name": "Travel Credit",
                "subtitle": "auto-applies",
                "max_annual": 300,
                "default_value": 0,
                "tier": "easy",
                "removed": False,
                "description": "A travel credit.",
                "tips": ["Use it on flights.", "warn::Doesn't cover hotels."],
            },
        ],
        "insurance": [
            {"coverage": "Rental car CDW", "detail": "Primary", "level": "strong"},
        ],
        "protection_note": "Some protection note.",
        "rental_note": "Some rental note.",
        "status_perks": [],
        "services": [],
        "additional_cards": {"title": "", "options": [], "note": ""},
        "timeline": [],
    }
    if overrides:
        data.update(overrides)
    return data


# ─── Unit tests for the small parsing helpers ──────────────────────────────


def test_slugify_lowercases_and_hyphenates():
    assert _slugify("American Express") == "american-express"


def test_slugify_strips_punctuation():
    assert _slugify("Chase & Co.") == "chase-co"


def test_parse_multiplier_whole_number():
    assert _parse_multiplier("5×") == 5.0


def test_parse_multiplier_decimal():
    assert _parse_multiplier("1.5×") == 1.5


def test_parse_multiplier_no_digits_returns_zero():
    assert _parse_multiplier("N/A") == 0.0


def test_parse_event_date_month_day_year():
    assert _parse_event_date("Jul 8, 2026") == date(2026, 7, 8)


def test_parse_event_date_year_only():
    assert _parse_event_date("2021") == date(2021, 1, 1)


def test_parse_event_date_unparseable_range_returns_none():
    # "2022–24" isn't a real calendar date — the label is still shown as-is
    # in the API response, but event_date itself should be null, not guessed.
    assert _parse_event_date("2022–24") is None


# ─── upsert_card: basic insert ──────────────────────────────────────────────


def test_upsert_creates_new_card(session):
    card = upsert_card(session, make_card_data())
    session.commit()

    assert card.slug == "test-card"
    assert card.name == "Test Card"
    assert card.annual_fee_cents == 50000
    assert card.issuer.name == "Test Bank"
    assert card.network.name == "TEST NETWORK"
    assert card.points_program.name == "Test Points"
    assert len(card.credits) == 1
    assert len(card.earn_rates) == 2


def test_upsert_cents_conversion_round_trips(session):
    card = upsert_card(
        session,
        make_card_data(
            {
                "annual_fee": 895,
                "credits": [
                    {
                        "id": "c1",
                        "name": "C1",
                        "subtitle": "",
                        "max_annual": 200,
                        "default_value": 50,
                        "tier": "easy",
                        "removed": False,
                        "description": "",
                        "tips": [],
                    },
                ],
            }
        ),
    )
    session.commit()

    assert card.annual_fee_cents == 89500
    assert card.credits[0].max_annual_cents == 20000
    assert card.credits[0].default_value_cents == 5000


def test_upsert_multiplier_parsed_onto_earn_rate(session):
    card = upsert_card(session, make_card_data())
    session.commit()

    rates = {r.category: r.multiplier_x for r in card.earn_rates}
    assert rates["Travel"] == 3.0
    assert rates["Everything else"] == 1.0


def test_upsert_warn_prefixed_tip_marked_as_warning(session):
    card = upsert_card(session, make_card_data())
    session.commit()

    tips = {t.tip_text: t.is_warning for t in card.credits[0].tips}
    assert tips["Use it on flights."] is False
    assert tips["Doesn't cover hotels."] is True


def test_upsert_removed_credit_preserved_not_deleted(session):
    data = make_card_data(
        {
            "credits": [
                {
                    "id": "gone",
                    "name": "Removed Credit",
                    "subtitle": "",
                    "max_annual": 0,
                    "default_value": 0,
                    "tier": "niche",
                    "removed": True,
                    "description": "No longer offered.",
                    "tips": [],
                },
            ],
        }
    )
    card = upsert_card(session, data)
    session.commit()

    assert len(card.credits) == 1
    assert card.credits[0].is_removed is True


# ─── upsert_card: lookup dedup ──────────────────────────────────────────────


def test_upsert_dedupes_issuer_across_two_cards(session):
    upsert_card(session, make_card_data({"id": "card-a", "issuer": "Shared Bank"}))
    upsert_card(session, make_card_data({"id": "card-b", "issuer": "Shared Bank"}))
    session.commit()

    issuers = session.query(Issuer).filter_by(name="Shared Bank").all()
    assert len(issuers) == 1

    cards = session.query(CardModel).filter(CardModel.slug.in_(["card-a", "card-b"])).all()
    assert cards[0].issuer_id == cards[1].issuer_id


def test_upsert_dedupes_network_and_loyalty_program(session):
    upsert_card(session, make_card_data({"id": "card-a"}))
    upsert_card(session, make_card_data({"id": "card-b"}))
    session.commit()

    assert session.query(Network).filter_by(name="TEST NETWORK").count() == 1
    assert session.query(LoyaltyProgram).filter_by(name="Test Points").count() == 1


def test_upsert_transfer_partners_dedupe_loyalty_program(session):
    partner = {"name": "Shared Airline", "type": "airline", "ratio": "1:1", "notes": None}
    upsert_card(
        session,
        make_card_data(
            {
                "id": "card-a",
                "transfer_partners": {
                    "airline_count": 1,
                    "hotel_count": 0,
                    "highlight": "",
                    "recent_changes": "",
                    "partners": [partner],
                },
            }
        ),
    )
    upsert_card(
        session,
        make_card_data(
            {
                "id": "card-b",
                "transfer_partners": {
                    "airline_count": 1,
                    "hotel_count": 0,
                    "highlight": "",
                    "recent_changes": "",
                    "partners": [partner],
                },
            }
        ),
    )
    session.commit()

    assert session.query(LoyaltyProgram).filter_by(name="Shared Airline").count() == 1

    card_a = session.query(CardModel).filter_by(slug="card-a").one()
    card_b = session.query(CardModel).filter_by(slug="card-b").one()
    assert len(card_a.transfer_partners) == 1
    a_program_id = card_a.transfer_partners[0].loyalty_program_id
    b_program_id = card_b.transfer_partners[0].loyalty_program_id
    assert a_program_id == b_program_id


# ─── upsert_card: re-promotion / idempotency (regression coverage) ────────
#
# A real bug here: reassigning a relationship collection (`card.credits =
# [...]`) doesn't guarantee the old rows delete before the new ones insert,
# so re-running upsert_card for an already-live card crashed with
# UNIQUE(card_id, slug) against its own not-yet-deleted rows. Fixed by
# clearing and flushing child collections before reassignment — these tests
# pin that fix down.


def test_upsert_same_card_twice_does_not_raise(session):
    data = make_card_data()
    upsert_card(session, data)
    session.commit()

    # Re-running with identical data must not crash.
    upsert_card(session, deepcopy(data))
    session.commit()


def test_upsert_twice_does_not_duplicate_card_row(session):
    data = make_card_data()
    upsert_card(session, data)
    session.commit()
    upsert_card(session, deepcopy(data))
    session.commit()

    assert session.query(CardModel).filter_by(slug="test-card").count() == 1


def test_upsert_twice_does_not_duplicate_credits(session):
    data = make_card_data()
    upsert_card(session, data)
    session.commit()
    card = upsert_card(session, deepcopy(data))
    session.commit()

    assert len(card.credits) == 1  # not 2


def test_upsert_twice_does_not_duplicate_earn_rates_or_insurance(session):
    data = make_card_data()
    upsert_card(session, data)
    session.commit()
    card = upsert_card(session, deepcopy(data))
    session.commit()

    assert len(card.earn_rates) == 2
    assert len(card.insurance_benefits) == 1


def test_upsert_twice_does_not_duplicate_transfer_partners(session):
    partner = {"name": "Solo Airline", "type": "airline", "ratio": "1:1", "notes": None}
    data = make_card_data(
        {
            "transfer_partners": {
                "airline_count": 1,
                "hotel_count": 0,
                "highlight": "",
                "recent_changes": "",
                "partners": [partner],
            }
        }
    )
    upsert_card(session, data)
    session.commit()
    card = upsert_card(session, deepcopy(data))
    session.commit()

    assert len(card.transfer_partners) == 1


# ─── upsert_card: re-sync actually reflects new data (not just replay) ────


def test_upsert_updates_changed_scalar_fields(session):
    data = make_card_data({"annual_fee": 500})
    upsert_card(session, data)
    session.commit()

    updated = deepcopy(data)
    updated["annual_fee"] = 650
    updated["verdict"] = {"status": "keep", "text": "Now worth keeping"}
    card = upsert_card(session, updated)
    session.commit()

    assert card.annual_fee_cents == 65000
    assert card.verdict_status == "keep"
    assert card.verdict_text == "Now worth keeping"


def test_upsert_drops_credit_removed_from_source(session):
    data = make_card_data(
        {
            "credits": [
                {
                    "id": "keep",
                    "name": "Keep Me",
                    "subtitle": "",
                    "max_annual": 100,
                    "default_value": 0,
                    "tier": "easy",
                    "removed": False,
                    "description": "",
                    "tips": [],
                },
                {
                    "id": "drop",
                    "name": "Drop Me",
                    "subtitle": "",
                    "max_annual": 100,
                    "default_value": 0,
                    "tier": "easy",
                    "removed": False,
                    "description": "",
                    "tips": [],
                },
            ],
        }
    )
    upsert_card(session, data)
    session.commit()

    updated = deepcopy(data)
    updated["credits"] = [updated["credits"][0]]  # only "keep" remains in the source
    card = upsert_card(session, updated)
    session.commit()

    slugs = {c.slug for c in card.credits}
    assert slugs == {"keep"}


def test_upsert_credit_sort_order_matches_source_order(session):
    data = make_card_data(
        {
            "credits": [
                {
                    "id": "first",
                    "name": "First",
                    "subtitle": "",
                    "max_annual": 100,
                    "default_value": 0,
                    "tier": "easy",
                    "removed": False,
                    "description": "",
                    "tips": [],
                },
                {
                    "id": "second",
                    "name": "Second",
                    "subtitle": "",
                    "max_annual": 100,
                    "default_value": 0,
                    "tier": "easy",
                    "removed": False,
                    "description": "",
                    "tips": [],
                },
            ],
        }
    )
    card = upsert_card(session, data)
    session.commit()

    ordered = sorted(card.credits, key=lambda c: c.sort_order)
    assert [c.slug for c in ordered] == ["first", "second"]


# ─── _get_or_create: concurrent-insert race ────────────────────────────────


def test_get_or_create_recovers_from_concurrent_insert_race(db_path):
    """Two connections that both see no existing "Race Bank" row and both
    try to create it: one wins the insert, the other must recover by
    re-querying instead of crashing on the UNIQUE constraint. A Barrier
    forces both threads past their SELECT before either attempts the
    INSERT, so this reliably reproduces the race instead of depending on
    incidental thread-scheduling luck."""
    barrier = threading.Barrier(2)
    results: list[int | None] = [None, None]
    errors: list[BaseException] = []

    def worker(index):
        engine = _new_engine(db_path)
        session = sessionmaker(bind=engine)()
        try:
            # Force both threads' SELECT (inside _get_or_create) to happen
            # before either's INSERT by blocking here until both arrive.
            existing = session.query(Issuer).filter_by(name="Race Bank").one_or_none()
            assert existing is None
            barrier.wait(timeout=5)

            instance = _get_or_create(
                session, Issuer, name="Race Bank", defaults={"slug": "race-bank"}
            )
            session.commit()
            # Capture the plain id while the session is still open — the
            # ORM instance itself can't cross into the main thread's checks
            # below once this worker's session closes (DetachedInstanceError).
            results[index] = instance.issuer_id
        except BaseException as exc:  # noqa: BLE001 — surface it to the main thread below
            errors.append(exc)
        finally:
            session.close()
            engine.dispose()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert not errors, f"_get_or_create raised under concurrent access: {errors}"
    assert results[0] is not None and results[1] is not None
    assert results[0] == results[1]  # both threads resolved to the same row

    verify_engine = _new_engine(db_path)
    verify_session = sessionmaker(bind=verify_engine)()
    try:
        assert verify_session.query(Issuer).filter_by(name="Race Bank").count() == 1
    finally:
        verify_session.close()
        verify_engine.dispose()
