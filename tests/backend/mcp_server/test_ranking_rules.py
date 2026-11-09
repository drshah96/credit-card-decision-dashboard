"""LIMITED_RATE on the real catalog: the rates an outside review flagged never count."""

import json

import pytest

from backend.mcp_server.ranking import RankInput, RateInput, _best_rate, rank_category

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
        rewards_redeemable=summary["rewards_redeemable"],
        open_to_new_applicants=summary["open_to_new_applicants"],
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


def _competing(category: str) -> set[str]:
    summaries = json.loads(SUMMARIES_PATH.read_text())
    return {s["id"] for s in summaries if _best_rate(_card(s["id"]), category)}


def test_only_utility_bills_compete_in_utilities():
    assert _competing("utilities") == {
        "chase-ihg-one-rewards-traveler",
        "us-bank-cash-plus",
        "us-bank-cash-plus-secured",
    }


def test_phone_and_internet_rates_compete_in_their_own_category():
    assert _competing("phone-internet") == {
        "chase-ihg-one-rewards-traveler",
        "chase-marriott-bonvoy-bold",
        "us-bank-cash-plus",
        "us-bank-cash-plus-secured",
        "wells-fargo-autograph",
        "wells-fargo-choice-privileges",
        "wells-fargo-choice-privileges-select",
    }


def test_single_store_and_att_rates_compete_nowhere_but_wholesale():
    for card_id in ("citi-wayfair", "capital-one-key-rewards", "citi-att-points-plus"):
        card = _card(card_id)
        for category in ("home-improvement", "utilities", "phone-internet"):
            assert _best_rate(card, category) is None, (card_id, category)


def test_a_rotating_quarterly_rate_counts_only_for_cards_someone_holds():
    flex = _card("chase-freedom-flex")
    assert _best_rate(flex, "groceries") is None
    assert _best_rate(flex, "dining")[1] == "3%"
    assert _best_rate(flex, "groceries", own_cards=True)[1] == "5%"
    assert _best_rate(flex, "dining", own_cards=True)[1] == "5%"


STORE_ONLY = {
    "capital-one-key-rewards",
    "citi-best-buy-visa",
    "citi-dillards",
    "capital-one-kohls-rewards",
    "citi-macys",
    "citi-bloomingdales",
    "citi-tractor-supply",
    "citi-llbean",
    "capital-one-bass-pro-cabelas-club",
    "capital-one-rei-co-op",
    "capital-one-bjs-one",
    "capital-one-bjs-one-plus",
    "capital-one-tmobile",
    "citi-wayfair",
}


def _all_cards() -> list[RankInput]:
    return [_card(s["id"]) for s in json.loads(SUMMARIES_PATH.read_text())]


def test_exactly_the_store_only_and_closed_cards_are_marked():
    cards = _all_cards()
    assert {c.id for c in cards if c.rewards_redeemable == "store_only"} == STORE_ONLY
    assert {c.id for c in cards if not c.open_to_new_applicants} == {"amex-green"}


def test_store_only_and_closed_cards_sit_out_of_whole_catalog_rankings():
    cards = _all_cards()
    for key in ("dining", "groceries", "gas-ev", "catch-all", "home-improvement"):
        ranked = {e.card.id for e in rank_category(cards, key)}
        assert not ranked & (STORE_ONLY | {"amex-green"}), key


def test_a_store_only_club_card_still_ranks_in_wholesale():
    ranked = [e.card.id for e in rank_category(_all_cards(), "wholesale")]
    assert ranked[:2] == ["capital-one-bjs-one-plus", "capital-one-bjs-one"]


def test_cards_someone_holds_keep_store_only_and_closed_cards():
    held = [_card("amex-green"), _card("capital-one-key-rewards")]
    ranked = {e.card.id for e in rank_category(held, "dining", pooling=True, own_cards=True)}
    assert ranked == {"amex-green", "capital-one-key-rewards"}
