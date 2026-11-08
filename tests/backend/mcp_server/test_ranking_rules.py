"""LIMITED_RATE on the real catalog: the rates an outside review flagged never count."""

import json

import pytest

from backend.mcp_server.ranking import RankInput, RateInput, _best_rate

from .parity_fixture import SUMMARIES_PATH


def _card(card_id: str) -> RankInput:
    summary = next(s for s in json.loads(SUMMARIES_PATH.read_text()) if s["id"] == card_id)
    rates = tuple(
        RateInput(r["category"], r["multiplier"], r["is_base"]) for r in summary["categories"]
    )
    return RankInput(
        id=card_id,
        name=summary["name"],
        annual_fee=summary["annual_fee"],
        categories=rates,
        best_cpp=summary["best_cpp"],
        secured_variant_id=summary["secured_variant_id"],
        points_pool_id=summary["points_pool_id"],
        points_pool_receiver=summary["points_pool_receiver"],
    )


@pytest.mark.parametrize(
    ("card_id", "category", "competes_on"),
    [
        # Online groceries only; Sapphire Preferred's supermarket purchases earn the base rate.
        ("chase-sapphire-preferred", "groceries", None),
        # Costco gas only; every other station earns 4%.
        ("citi-costco-anywhere-visa", "gas-ev", "4%"),
        # Citi Nights is Friday and Saturday, 6pm to 6am ET.
        ("citi-strata-elite", "dining", "3×"),
        # Bilt partner restaurants only.
        ("bilt-obsidian", "dining", "3×"),
        ("bilt-palladium", "dining", None),
        ("bilt-blue", "dining", None),
        # Amazon and Whole Foods only; Disney+, Hulu and ESPN only.
        ("chase-amazon-prime-visa", "groceries", None),
        ("chase-disney-premier", "streaming", None),
        # A rate open to every purchase in the category still counts.
        ("amex-gold", "dining", "4×"),
    ],
)
def test_a_rate_most_purchases_dont_earn_never_counts(card_id, category, competes_on):
    best = _best_rate(_card(card_id), category)
    assert (best[1] if best else None) == competes_on
