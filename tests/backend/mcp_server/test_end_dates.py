"""review_due_on stops at a card's first served end date, so no ended term is vouched for."""

from datetime import date
from pathlib import Path

import pytest

from backend.mcp_server.end_dates import (
    CHANGE_PHRASE,
    DATED_PHRASE,
    dates_in,
    earliest_end,
    served_text,
)
from backend.models import Card

from .conftest import connect, structured

CARDS_DIR = Path(__file__).parents[3] / "backend" / "data" / "cards"
CHECKED = date(2026, 11, 7)


def _cards() -> list[Card]:
    paths = CARDS_DIR.glob("**/*.json")
    return [Card.model_validate_json(p.read_text()) for p in paths if "staging" not in p.parts]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Travel through Dec 31, 2026, then only airline tickets", date(2026, 12, 31)),
        ("Activate by then, through June 22, 2027.", date(2027, 6, 22)),
        ("Lyft (through Sep 2027)", date(2027, 9, 30)),
        ("$50 × 2 · thru 6/30/2027", date(2027, 6, 30)),
        ("Partner perks (through 2027)", date(2027, 12, 31)),
        ("running through the Dec 31, 2027 promo window", date(2027, 12, 31)),
        ("Redeemable through Nov 30, 2026.", date(2026, 11, 30)),
        ("1.5¢ on Chase Travel until Oct 26, 2027", date(2027, 10, 26)),
        ("Quarterly rotating category. This quarter (Q4): dining", date(2026, 12, 31)),
        ("From the first card anniversary on or after January 1, 2027, this", date(2027, 1, 1)),
        ("and Fine Hotels + Resorts joins them from Jan 1, 2027.", date(2027, 1, 1)),
        ("starting Mar 2027, the credit is monthly", date(2027, 3, 1)),
        ("Starting in 2027, the rate drops to 2×", date(2027, 1, 1)),
        ("Discover dropped it at the end of February 2018", date(2018, 2, 28)),
    ],
)
def test_each_phrasing_in_the_catalog_reads_as_its_end_date(text, expected):
    assert dates_in(text, CHECKED) == [expected]


def test_a_quarter_already_over_at_the_check_rolls_to_next_year():
    assert dates_in("This quarter (Q1): gas", date(2026, 11, 7)) == [date(2027, 3, 31)]


def test_text_without_an_end_date_has_none():
    assert dates_in("Restaurants worldwide (up to $50k/yr, then 1×)", CHECKED) == []
    assert dates_in("Launched in 2019 and refreshed since", CHECKED) == []
    # "from" counts only with a date right after it.
    assert dates_in("sits at 0.75¢/point (cut from 1¢ in Aug 2025)", CHECKED) == []
    assert dates_in("(doubled from 1,500 in the July 2025 refresh)", CHECKED) == []


def test_past_quarters_in_freedom_flexs_real_note_never_make_it_overdue():
    """The note lists 2026's earlier quarters ("Q1 was Norwegian Cruise Line and dining"). None
    may read as a date, or the card would show as overdue the day it was checked."""
    card = next(c for c in _cards() if c.id == "chase-freedom-flex")
    assert "Q1 was" in card.earn_note
    assert dates_in(card.earn_note, CHECKED) == []
    assert earliest_end(card, CHECKED) == date(2026, 12, 31)


def test_no_dated_wording_in_served_text_escapes_the_parser():
    checked = 0
    for card in _cards():
        for text in served_text(card):
            for phrase in DATED_PHRASE.finditer(text):
                checked += 1
                assert dates_in(phrase.group(0), CHECKED), (card.id, phrase.group(0))
    assert checked >= 30, "the catalog's dated terms are missing, so this proves nothing"


def test_no_change_date_wording_escapes_the_parser():
    checked = 0
    for card in _cards():
        for text in served_text(card):
            for phrase in CHANGE_PHRASE.finditer(text):
                checked += 1
                assert dates_in(phrase.group(0), CHECKED), (card.id, phrase.group(0))
    assert checked >= 5, "the catalog's change dates are missing, so this proves nothing"


def test_earlier_dates_never_shorten_a_check():
    card = next(c for c in _cards() if c.id == "chase-freedom-flex")
    assert earliest_end(card, date(2027, 2, 1)) > date(2027, 2, 1)


@pytest.mark.parametrize(
    ("card_id", "verified", "due"),
    [
        ("chase-freedom-flex", "2026-11-07", "2026-12-31"),
        ("chase-ihg-one-rewards-premier", "2026-11-07", "2026-12-31"),
        ("chase-ihg-one-rewards-traveler", "2026-11-07", "2026-12-31"),
        ("us-bank-altitude-connect", "2026-11-13", "2026-11-30"),
        ("amex-platinum", "2026-11-07", "2026-12-31"),
        ("bilt-blue", "2026-11-07", "2027-01-01"),
        ("bilt-obsidian", "2026-11-07", "2027-01-01"),
        ("bilt-palladium", "2026-11-07", "2027-01-01"),
        ("amex-gold", "2026-11-07", "2027-05-06"),
    ],
)
async def test_review_due_on_stops_at_the_first_served_end_date(snapshot, card_id, verified, due):
    async with connect(snapshot) as client:
        data = structured(await client.call_tool("get_card", {"card_id": card_id}))
    assert data["provenance"]["verified_on"] == verified
    assert data["provenance"]["review_due_on"] == due


@pytest.mark.parametrize(
    ("today", "overdue"),
    [(date(2026, 11, 30), False), (date(2026, 12, 1), True)],
)
async def test_review_overdue_is_worked_out_per_request(snapshot, monkeypatch, today, overdue):
    """The snapshot is built once at boot, and keep-warm can keep it alive for weeks, so the
    flag must come from the date of the request, not the date the server started."""
    from backend.mcp_server import projections

    monkeypatch.setattr(projections, "today", lambda: today)
    async with connect(snapshot) as client:
        connect_card = structured(
            await client.call_tool("get_card", {"card_id": "us-bank-altitude-connect"})
        )
        gold = structured(await client.call_tool("get_card", {"card_id": "amex-gold"}))
        found = structured(await client.call_tool("find_cards", {"query": "altitude connect"}))
    assert connect_card["provenance"]["review_due_on"] == "2026-11-30"
    assert connect_card["provenance"]["review_overdue"] is overdue
    assert found["cards"][0]["provenance"]["review_overdue"] is overdue
    assert gold["provenance"]["review_overdue"] is False


async def test_a_card_with_no_check_is_never_overdue(snapshot):
    async with connect(snapshot) as client:
        data = structured(await client.call_tool("get_card", {"card_id": "us-bank-split"}))
    assert data["provenance"]["review_due_on"] is None
    assert data["provenance"]["review_overdue"] is False
