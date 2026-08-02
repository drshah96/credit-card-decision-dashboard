import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

CARD_IDS = [
    "amex-platinum",
    "chase-sapphire-reserve",
    "capital-one-venture-x",
    "amex-delta-skymiles-platinum",
    "amex-gold",
    "amex-green",
    "amex-blue-cash-everyday",
    "amex-blue-cash-preferred",
    "amex-marriott-bonvoy-brilliant",
    "amex-marriott-bonvoy-bevy",
    "amex-hilton-honors",
    "amex-hilton-honors-surpass",
    "amex-hilton-honors-aspire",
    "amex-delta-skymiles-gold",
    "amex-delta-skymiles-reserve",
    "amex-delta-skymiles-blue",
    "chase-sapphire-preferred",
    "chase-freedom-unlimited",
    "chase-freedom-flex",
    "chase-freedom-rise",
    "chase-slate-edge",
    "chase-united-explorer",
    "chase-united-quest",
    "chase-united-club-infinite",
    "chase-southwest-rapid-rewards-plus",
    "chase-southwest-rapid-rewards-premier",
    "chase-southwest-rapid-rewards-priority",
    "chase-world-of-hyatt",
    "chase-marriott-bonvoy-boundless",
    "chase-marriott-bonvoy-bold",
    "chase-ihg-one-rewards-premier",
    "chase-ihg-one-rewards-traveler",
    "chase-disney-premier",
    "chase-amazon-prime-visa",
    "capital-one-venture",
    "capital-one-venture-one",
    "capital-one-savor",
    "capital-one-savor-one",
    "capital-one-quicksilver",
    "capital-one-quicksilver-one",
    "capital-one-platinum",
    "capital-one-key-rewards",
    "capital-one-rei-co-op",
    "capital-one-bjs-one",
    "capital-one-bjs-one-plus",
    "capital-one-kohls-rewards",
    "capital-one-tmobile",
    "capital-one-bass-pro-cabelas-club",
    "capital-one-quicksilver-secured",
    "capital-one-platinum-secured",
    "citi-strata",
    "citi-strata-premier",
    "citi-strata-elite",
    "citi-double-cash",
    "citi-diamond-preferred",
    "citi-simplicity",
    "citi-secured",
    "citi-aadvantage-platinum-select",
    "citi-aadvantage-executive",
    "citi-aadvantage-mileup",
    "citi-aadvantage-globe",
    "citi-costco-anywhere-visa",
    "citi-best-buy-visa",
    "citi-home-depot-consumer",
    "citi-att-points-plus",
    "citi-exxonmobil-smart-card-plus",
    "citi-macys",
    "citi-bloomingdales",
    "citi-dillards",
    "citi-wayfair",
    "citi-goodyear",
    "citi-llbean",
    "citi-tractor-supply",
    "us-bank-smartly",
    "us-bank-cash-plus",
    "us-bank-shield",
    "us-bank-split",
    "us-bank-altitude-go",
    "us-bank-altitude-connect",
    "us-bank-altitude-go-secured",
    "us-bank-cash-plus-secured",
    "us-bank-secured",
    "bofa-customized-cash-rewards",
    "bofa-unlimited-cash-rewards",
    "bofa-bankamericard",
    "bofa-travel-rewards",
    "bofa-premium-rewards",
    "bofa-premium-rewards-elite",
    "bofa-cash-rewards-secured",
    "bofa-unlimited-cash-rewards-secured",
    "bofa-bankamericard-secured",
    "bofa-travel-rewards-secured",
    "bilt-blue",
    "bilt-obsidian",
    "bilt-palladium",
    "wells-fargo-active-cash",
    "wells-fargo-reflect",
    "wells-fargo-autograph",
    "wells-fargo-autograph-journey",
    "wells-fargo-one-key",
    "wells-fargo-one-key-plus",
    "wells-fargo-choice-privileges",
    "wells-fargo-choice-privileges-select",
]


def test_list_cards_returns_all_cards() -> None:
    response = client.get("/api/cards")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(CARD_IDS)
    ids = [c["id"] for c in data]
    assert set(ids) == set(CARD_IDS)


def test_list_cards_summary_shape() -> None:
    response = client.get("/api/cards")
    card = response.json()[0]
    assert "id" in card
    assert "name" in card
    assert "annual_fee" in card
    assert "verdict" in card
    assert "total_easy_credits" in card
    assert "total_max_credits" in card
    assert "categories" in card
    # Full card fields must NOT be in summary
    assert "credits" not in card
    assert "insurance" not in card
    assert "timeline" not in card
    assert "earn_rates" not in card


def test_summary_categories_match_full_detail_earn_rates() -> None:
    """CardSummary.categories is a lightweight {category, multiplier, is_base}
    projection of the full Card's earn_rates — not the full EarnRate objects
    (no emoji/highlight) — so a catalog-wide filter/rank feature can read it
    without fetching full detail for every card. is_base is kept (unlike
    emoji/highlight) since it's the only reliable way to identify a card's
    flat "everything else" rate from summary data alone."""
    card_id = "amex-gold"
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    detail = client.get(f"/api/cards/{card_id}").json()

    assert summary["categories"] == [
        {"category": r["category"], "multiplier": r["multiplier"], "is_base": r["is_base"]}
        for r in detail["earn_rates"]
    ]
    for cat in summary["categories"]:
        assert set(cat.keys()) == {"category", "multiplier", "is_base"}


def test_summary_best_cpp_matches_max_of_full_detail_redemption_options() -> None:
    """CardSummary.best_cpp is the highest cents-per-point across the full
    Card's redemption_options — lets a catalog-wide ranking feature compare
    cards' effective earn rate (multiplier x best_cpp) without fetching full
    detail for every card just to read redemption options."""
    card_id = "chase-sapphire-reserve"
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    detail = client.get(f"/api/cards/{card_id}").json()

    assert summary["best_cpp"] == max(o["cpp"] for o in detail["points"]["redemption_options"])


def test_summary_best_cpp_is_zero_when_no_redemption_options() -> None:
    """A card with no redemption_options at all (e.g. a no-rewards product)
    shouldn't error — best_cpp falls back to 0.0 rather than crashing on an
    empty max()."""
    for card in client.get("/api/cards").json():
        detail = client.get(f"/api/cards/{card['id']}").json()
        if not detail["points"]["redemption_options"]:
            assert card["best_cpp"] == 0.0
            return
    pytest.skip("no card in the current catalog has zero redemption options")


def test_secured_variant_id_on_primary_card() -> None:
    """An unsecured card with an identical-benefits secured counterpart (e.g.
    us-bank-cash-plus / us-bank-cash-plus-secured) carries secured_variant_id
    pointing at it, on both the summary and full-detail payload — this is
    what listing surfaces use to hide the secured twin in its favor."""
    card_id, secured_id = "us-bank-cash-plus", "us-bank-cash-plus-secured"
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    detail = client.get(f"/api/cards/{card_id}").json()

    assert summary["secured_variant_id"] == secured_id
    assert detail["secured_variant_id"] == secured_id
    # The primary card is never itself "the secured one" of something else.
    assert summary["is_secured_variant_of"] is None
    assert detail["is_secured_variant_of"] is None


def test_is_secured_variant_of_on_secured_card() -> None:
    """The reverse of the above: the secured card's own summary/detail carry
    is_secured_variant_of pointing back at the unsecured primary it's hidden
    in favor of — this field is never stored in that card's own JSON, it's
    computed server-side by reverse lookup."""
    card_id, primary_id = "us-bank-cash-plus-secured", "us-bank-cash-plus"
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    detail = client.get(f"/api/cards/{card_id}").json()

    assert summary["is_secured_variant_of"] == primary_id
    assert detail["is_secured_variant_of"] == primary_id
    # The secured card doesn't itself have a secured variant.
    assert summary["secured_variant_id"] is None
    assert detail["secured_variant_id"] is None


def test_standalone_secured_cards_have_no_pairing() -> None:
    """citi-secured and us-bank-secured have no unsecured counterpart in the
    catalog at all — both pairing fields should stay null for them, same as
    any ordinary card with no secured/unsecured relationship."""
    for card_id in ("citi-secured", "us-bank-secured"):
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["secured_variant_id"] is None
        assert detail["is_secured_variant_of"] is None


def test_capital_one_quicksilver_secured_not_paired() -> None:
    """capital-one-quicksilver-secured earns less than the unsecured
    Quicksilver (missing the 5% Entertainment bonus) — confirmed NOT a
    duplicate, so it must not be wired up as a pair despite the name."""
    detail = client.get("/api/cards/capital-one-quicksilver-secured").json()
    assert detail["is_secured_variant_of"] is None
    unsecured = client.get("/api/cards/capital-one-quicksilver").json()
    assert unsecured["secured_variant_id"] is None


def test_points_pool_id_shared_by_chase_ultimate_rewards_transfer_cards() -> None:
    """Freedom Flex/Unlimited (flat 1cpp alone) share a pool id with Sapphire
    Preferred/Reserve (the accounts that unlock transfer-partner value) —
    both on the summary list and full detail, since the Top Pick page's My
    Cards ranking reads this off the summary alone."""
    poolable = (
        "chase-freedom-flex",
        "chase-freedom-unlimited",
        "chase-sapphire-preferred",
        "chase-sapphire-reserve",
    )
    summaries = {c["id"]: c for c in client.get("/api/cards").json()}
    pool_ids = set()
    for card_id in poolable:
        assert summaries[card_id]["points_pool_id"] is not None
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_id"] == summaries[card_id]["points_pool_id"]
        pool_ids.add(summaries[card_id]["points_pool_id"])
    assert len(pool_ids) == 1, "all four cards must share the exact same pool id"


def test_points_pool_id_null_for_documented_non_poolable_ultimate_rewards_cards() -> None:
    """chase-freedom-rise and chase-amazon-prime-visa are also technically
    Ultimate Rewards under the hood, but each card's own points.note
    explicitly says it can't be moved into a premium account — regression
    guard against ever including them by loosely matching on currency name
    instead of the hand-verified pair list."""
    for card_id in ("chase-freedom-rise", "chase-amazon-prime-visa"):
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_id"] is None


def test_points_pool_id_null_for_amex_membership_rewards_cards() -> None:
    """Amex MR cards (Gold/Green/Platinum) already list transfer-partner cpp
    as their own best redemption option independently — no pooling gap to
    model, so none of them should carry a points_pool_id."""
    for card_id in ("amex-gold", "amex-green", "amex-platinum"):
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_id"] is None


def test_points_pool_receiver_only_true_for_the_premium_accounts() -> None:
    """Only the card whose own account a pooled balance actually redeems
    through is a receiver — Sapphire Preferred/Reserve and Strata Premier/
    Elite. The feeder cards (which only reach full value once pooled with
    one of these) must stay false, not just non-null pool ids, so a ranking
    can't mistake a feeder for a valid boost source."""
    receivers = (
        "chase-sapphire-preferred",
        "chase-sapphire-reserve",
        "citi-strata-premier",
        "citi-strata-elite",
    )
    feeders = (
        "chase-freedom-flex",
        "chase-freedom-unlimited",
        "citi-double-cash",
        "citi-strata",
    )
    summaries = {c["id"]: c for c in client.get("/api/cards").json()}
    for card_id in receivers:
        assert summaries[card_id]["points_pool_receiver"] is True
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_receiver"] is True
    for card_id in feeders:
        assert summaries[card_id]["points_pool_receiver"] is False
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_receiver"] is False


def test_points_pool_id_shared_by_citi_thankyou_points_transfer_cards() -> None:
    """Double Cash (flat 1cpp alone) and plain Strata (1.2cpp, reduced
    transfer ratio) share a pool id with Strata Premier/Elite (the accounts
    that unlock full 1:1 transfer-partner value) — confirmed via each
    card's own points.note, not inferred from the shared 'ThankYou Points'
    currency name alone (citi-att-points-plus also earns ThankYou Points but
    its own note says explicitly it has no transfer-partner access and never
    mentions pooling, so it's correctly excluded — see the next test)."""
    poolable = (
        "citi-double-cash",
        "citi-strata",
        "citi-strata-premier",
        "citi-strata-elite",
    )
    summaries = {c["id"]: c for c in client.get("/api/cards").json()}
    pool_ids = set()
    for card_id in poolable:
        assert summaries[card_id]["points_pool_id"] is not None
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["points_pool_id"] == summaries[card_id]["points_pool_id"]
        pool_ids.add(summaries[card_id]["points_pool_id"])
    assert len(pool_ids) == 1, "all four cards must share the exact same pool id"
    # And it must be a genuinely different pool than Chase's — pooling only
    # happens within the same issuer's rewards program in real life.
    chase_pool = client.get("/api/cards/chase-sapphire-reserve").json()["points_pool_id"]
    assert pool_ids != {chase_pool}


def test_points_pool_id_null_for_citi_att_points_plus() -> None:
    """citi-att-points-plus also earns 'ThankYou® Points' currency, but its
    own points.note explicitly says base-tier ThankYou Points have no
    transfer-partner access and never mentions pooling/linking — regression
    guard against ever including it by matching on currency name alone."""
    detail = client.get("/api/cards/citi-att-points-plus").json()
    assert detail["points_pool_id"] is None


@pytest.mark.parametrize("card_id", CARD_IDS)
def test_get_card_detail(card_id: str) -> None:
    response = client.get(f"/api/cards/{card_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == card_id
    assert "credits" in data
    assert "insurance" in data
    assert "timeline" in data
    # These cards have no rewards program at all (pure APR/credit-access/
    # financing products) — every other card earns something.
    NO_REWARDS_CARDS = (
        "chase-slate-edge",
        "capital-one-platinum",
        "capital-one-platinum-secured",
        "citi-diamond-preferred",
        "citi-simplicity",
        "citi-secured",
        "citi-home-depot-consumer",
        "citi-goodyear",
        "us-bank-split",
        "us-bank-secured",
        "bofa-bankamericard",
        "bofa-bankamericard-secured",
        "wells-fargo-reflect",
    )
    if card_id not in NO_REWARDS_CARDS:
        assert len(data["earn_rates"]) > 0


def test_get_card_not_found() -> None:
    response = client.get("/api/cards/nonexistent")
    assert response.status_code == 404


def test_bulk_card_detail_matches_individual_fetches() -> None:
    """The bulk endpoint (used by IssuerCardsPage to fetch a whole lineup in
    one request instead of fanning out into one request per card) must return
    byte-for-byte the same payload per card as the single-card endpoint."""
    ids = ["amex-platinum", "chase-sapphire-preferred", "citi-double-cash"]
    response = client.get("/api/cards/detail", params={"ids": ",".join(ids)})
    assert response.status_code == 200
    bulk_by_id = {c["id"]: c for c in response.json()}
    assert set(bulk_by_id) == set(ids)
    for card_id in ids:
        assert bulk_by_id[card_id] == client.get(f"/api/cards/{card_id}").json()


def test_bulk_card_detail_missing_ids_param_returns_empty_list() -> None:
    response = client.get("/api/cards/detail")
    assert response.status_code == 200
    assert response.json() == []


def test_bulk_card_detail_empty_ids_returns_empty_list() -> None:
    response = client.get("/api/cards/detail", params={"ids": ""})
    assert response.status_code == 200
    assert response.json() == []


def test_bulk_card_detail_unknown_id_silently_omitted() -> None:
    # A bulk fetch has "give me what you have" semantics, not the single-card
    # endpoint's 404 — one bad id shouldn't fail the whole batch.
    response = client.get("/api/cards/detail", params={"ids": "amex-platinum,nonexistent"})
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()]
    assert ids == ["amex-platinum"]


def test_bulk_card_detail_preserves_secured_variant_pairing_even_without_primary_in_batch() -> None:
    # Regression guard: the reverse secured/unsecured lookup must be resolved
    # against the whole catalog, not just the requested batch — otherwise
    # requesting only the secured card (without its unsecured primary also in
    # the batch) would wrongly lose its is_secured_variant_of pairing.
    response = client.get("/api/cards/detail", params={"ids": "us-bank-cash-plus-secured"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["is_secured_variant_of"] == "us-bank-cash-plus"


def test_amex_platinum_official_url() -> None:
    response = client.get("/api/cards/amex-platinum")
    assert response.status_code == 200
    data = response.json()
    assert data["official_url"] == (
        "https://www.americanexpress.com/us/credit-cards/card/platinum/"
        "?inav=en_us_menu_cards_personal_cards_platinum_card"
    )


@pytest.mark.parametrize("card_id", CARD_IDS)
def test_official_url_is_string_or_none(card_id: str) -> None:
    response = client.get(f"/api/cards/{card_id}")
    assert response.json()["official_url"] is None or isinstance(
        response.json()["official_url"], str
    )


@pytest.mark.parametrize("card_id", CARD_IDS)
def test_is_affiliate_link_false_for_every_card_today(card_id: str) -> None:
    """No card in the catalog has an affiliate relationship yet — the field
    exists so the disclosure UI is ready to go the moment one is added, not
    because anything is live now. Regression guard against a card ever
    getting silently flagged true without a deliberate, reviewed change.
    Checked on both the summary and full-detail payload, since the summary
    is what the ranking-integrity test in
    frontend/tests/utils/topPickCategories.test.ts actually depends on."""
    detail = client.get(f"/api/cards/{card_id}").json()
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    assert detail["is_affiliate_link"] is False
    assert summary["is_affiliate_link"] is False


def test_summary_is_affiliate_link_matches_full_detail() -> None:
    """CardSummary.is_affiliate_link mirrors Card.is_affiliate_link exactly
    — the Top Pick ranking path (which only ever sees CardSummary) reads
    the same value a detail page would, not a separately-tracked copy that
    could drift out of sync."""
    card_id = "amex-platinum"
    detail = client.get(f"/api/cards/{card_id}").json()
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    assert summary["is_affiliate_link"] == detail["is_affiliate_link"]


def test_annual_fees_are_correct() -> None:
    response = client.get("/api/cards")
    fees = {c["id"]: c["annual_fee"] for c in response.json()}
    assert fees["amex-platinum"] == 895
    assert fees["chase-sapphire-reserve"] == 795
    assert fees["capital-one-venture-x"] == 395
    assert fees["amex-delta-skymiles-platinum"] == 350
    assert fees["amex-gold"] == 325
    assert fees["amex-green"] == 150
    assert fees["amex-blue-cash-everyday"] == 0
    assert fees["amex-blue-cash-preferred"] == 95
    assert fees["amex-marriott-bonvoy-brilliant"] == 650
    assert fees["amex-marriott-bonvoy-bevy"] == 250
    assert fees["amex-hilton-honors"] == 0
    assert fees["amex-hilton-honors-surpass"] == 150
    assert fees["amex-hilton-honors-aspire"] == 550
    assert fees["amex-delta-skymiles-gold"] == 150
    assert fees["amex-delta-skymiles-reserve"] == 650
    assert fees["amex-delta-skymiles-blue"] == 0
    assert fees["chase-sapphire-preferred"] == 95
    assert fees["chase-freedom-unlimited"] == 0
    assert fees["chase-freedom-flex"] == 0
    assert fees["chase-freedom-rise"] == 0
    assert fees["chase-slate-edge"] == 0
    assert fees["chase-united-explorer"] == 150
    assert fees["chase-united-quest"] == 350
    assert fees["chase-united-club-infinite"] == 695
    assert fees["chase-southwest-rapid-rewards-plus"] == 99
    assert fees["chase-southwest-rapid-rewards-premier"] == 149
    assert fees["chase-southwest-rapid-rewards-priority"] == 229
    assert fees["chase-world-of-hyatt"] == 95
    assert fees["chase-marriott-bonvoy-boundless"] == 95
    assert fees["chase-marriott-bonvoy-bold"] == 0
    assert fees["chase-ihg-one-rewards-premier"] == 99
    assert fees["chase-ihg-one-rewards-traveler"] == 0
    assert fees["chase-disney-premier"] == 49
    assert fees["chase-amazon-prime-visa"] == 0
    assert fees["capital-one-venture"] == 95
    assert fees["capital-one-venture-one"] == 0
    assert fees["capital-one-savor"] == 0
    assert fees["capital-one-savor-one"] == 39
    assert fees["capital-one-quicksilver"] == 0
    assert fees["capital-one-quicksilver-one"] == 39
    assert fees["capital-one-platinum"] == 0
    assert fees["capital-one-key-rewards"] == 0
    assert fees["capital-one-rei-co-op"] == 0
    assert fees["capital-one-bjs-one"] == 0
    assert fees["capital-one-bjs-one-plus"] == 0
    assert fees["capital-one-kohls-rewards"] == 0
    assert fees["capital-one-tmobile"] == 0
    assert fees["capital-one-bass-pro-cabelas-club"] == 0
    assert fees["capital-one-quicksilver-secured"] == 0
    assert fees["capital-one-platinum-secured"] == 0
    assert fees["citi-strata"] == 0
    assert fees["citi-strata-premier"] == 95
    assert fees["citi-strata-elite"] == 595
    assert fees["citi-double-cash"] == 0
    assert fees["citi-diamond-preferred"] == 0
    assert fees["citi-simplicity"] == 0
    assert fees["citi-secured"] == 0
    assert fees["citi-aadvantage-platinum-select"] == 99
    assert fees["citi-aadvantage-executive"] == 595
    assert fees["citi-aadvantage-mileup"] == 0
    assert fees["citi-aadvantage-globe"] == 350
    assert fees["citi-costco-anywhere-visa"] == 0
    assert fees["citi-best-buy-visa"] == 0
    assert fees["citi-home-depot-consumer"] == 0
    assert fees["citi-att-points-plus"] == 0
    assert fees["citi-exxonmobil-smart-card-plus"] == 0
    assert fees["citi-macys"] == 0
    assert fees["citi-bloomingdales"] == 0
    assert fees["citi-dillards"] == 0
    assert fees["citi-wayfair"] == 0
    assert fees["citi-goodyear"] == 0
    assert fees["citi-llbean"] == 0
    assert fees["citi-tractor-supply"] == 0


def test_easy_credits_not_negative() -> None:
    response = client.get("/api/cards")
    for card in response.json():
        assert card["total_easy_credits"] >= 0
        assert card["total_max_credits"] >= card["total_easy_credits"]


def test_removed_credits_excluded_from_totals() -> None:
    """Credits marked removed=true must not contribute to easy/max credit totals."""
    response = client.get("/api/cards/amex-platinum")
    card = response.json()
    # Saks is removed (max_annual=0, removed=true) — verify it's in data but excluded from totals
    saks = next(c for c in card["credits"] if c["id"] == "saks")
    assert saks["removed"] is True
    # Recalculate totals manually and compare to summary
    summary_response = client.get("/api/cards")
    amex_summary = next(c for c in summary_response.json() if c["id"] == "amex-platinum")
    manual_easy = sum(
        c["default_value"] for c in card["credits"] if c["tier"] == "easy" and not c["removed"]
    )
    manual_max = sum(c["max_annual"] for c in card["credits"] if not c["removed"])
    assert amex_summary["total_easy_credits"] == manual_easy
    assert amex_summary["total_max_credits"] == manual_max


def test_credit_default_does_not_exceed_max() -> None:
    """Every credit's default_value must be <= max_annual."""
    for card_id in CARD_IDS:
        response = client.get(f"/api/cards/{card_id}")
        for credit in response.json()["credits"]:
            assert credit["default_value"] <= credit["max_annual"], (
                f"{card_id}/{credit['id']}: "
                f"default {credit['default_value']} > max {credit['max_annual']}"
            )


def test_earn_rate_multiplier_preserves_original_unit() -> None:
    """Percentage-based cash-back cards must render as "5%", not "5×" — the
    API used to reconstruct the multiplier string from a parsed float with a
    hardcoded × suffix, silently corrupting every %-based card's earn rate."""
    response = client.get("/api/cards/chase-freedom-flex")
    multipliers = [r["multiplier"] for r in response.json()["earn_rates"]]
    assert all("%" in m for m in multipliers), multipliers


def test_earn_rate_multiplier_preserves_ceiling_framing() -> None:
    """ "Up to N×"-style ceiling framing (and any trailing annotation like a
    footnote asterisk) must survive verbatim, not collapse to a bare "N×"."""
    response = client.get("/api/cards/bilt-blue")
    rates = {r["category"]: r["multiplier"] for r in response.json()["earn_rates"]}
    assert rates["Rent or mortgage (Bilt Housing Rewards)"] == "Up to 1.25×*"
    assert rates["Bilt partner restaurants (20,000+ U.S. locations)"] == "Up to 4×"


def test_verdict_text_fits_two_lines() -> None:
    """The verdict badge on the card detail page is a fixed 280px-wide box —
    text much beyond ~80 characters wraps past 2 lines and gets clipped
    against the card art next to it. This is a length proxy, not a pixel
    measurement (jsdom can't lay out real text), calibrated against the
    longest verdict that's confirmed to render at exactly 2 lines."""
    response = client.get("/api/cards")
    long_verdicts = [
        (c["id"], c["verdict"]["text"]) for c in response.json() if len(c["verdict"]["text"]) > 80
    ]
    assert long_verdicts == []


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ─── intro APR / balance transfer / foreign transaction fee ───────────────────
# Sourced from real issuer terms per-card (see backend/models.py
# Card.intro_apr_purchases), rolled out incrementally by issuer. None means
# "not yet audited" for that card, not "confirmed absent" — distinct states.


@pytest.mark.parametrize("card_id", CARD_IDS)
def test_summary_apr_and_fx_fields_match_full_detail(card_id: str) -> None:
    """CardSummary's three fields mirror Card's exactly, whatever their
    current value — the Compare tab's Category chips (which only ever see
    CardSummary) must never read a value that could drift from the detail
    page's own. Same pattern as the is_affiliate_link parity test."""
    detail = client.get(f"/api/cards/{card_id}").json()
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == card_id)
    for field in ("intro_apr_purchases", "intro_apr_balance_transfers", "foreign_transaction_fee"):
        assert summary[field] == detail[field], field


def test_has_lounge_access_true_for_a_known_lounge_card() -> None:
    """amex-platinum has real Centurion Lounge access in its status_perks —
    confirms has_lounge_access is actually derived from that data, not
    hardcoded false."""
    detail = client.get("/api/cards/amex-platinum").json()
    summary = next(c for c in client.get("/api/cards").json() if c["id"] == "amex-platinum")
    assert detail["has_lounge_access"] is True
    assert summary["has_lounge_access"] is True


def test_has_lounge_access_false_for_a_card_with_no_such_perk() -> None:
    detail = client.get("/api/cards/chase-freedom-unlimited").json()
    assert detail["has_lounge_access"] is False


def test_intro_apr_shape_when_present() -> None:
    """Whichever card ends up with an audited intro-APR offer, the field is
    a {rate, months} object, not a bare number or string."""
    cards = client.get("/api/cards").json()
    audited = [c for c in cards if c["intro_apr_purchases"] is not None]
    if not audited:
        pytest.skip("no card has an audited intro_apr_purchases offer yet")
    sample = audited[0]["intro_apr_purchases"]
    assert set(sample.keys()) == {"rate", "months"}
    assert isinstance(sample["rate"], str)
    assert isinstance(sample["months"], int)


# Chase pilot batch (2026-08-01/02): all 19 Chase cards researched against
# Chase's own official pages. Only the three cards Chase actually markets on
# 0% APR carry the offer — every premium/travel/co-brand Chase card was
# confirmed (not just left unaudited) to have none. See
# [[project_apr_balance_transfer_fx_fee_audit]] memory for the full source
# list and the remaining-issuers backlog.
@pytest.mark.parametrize(
    "card_id,purchases_months,bt_months,fx_fee",
    [
        ("chase-freedom-unlimited", 15, 15, True),
        ("chase-freedom-flex", 15, 15, True),
        ("chase-slate-edge", 18, 18, True),
    ],
)
def test_chase_cards_with_a_real_intro_apr_offer(
    card_id: str, purchases_months: int, bt_months: int, fx_fee: bool
) -> None:
    detail = client.get(f"/api/cards/{card_id}").json()
    assert detail["intro_apr_purchases"] == {"rate": "0%", "months": purchases_months}
    assert detail["intro_apr_balance_transfers"] == {"rate": "0%", "months": bt_months}
    assert detail["foreign_transaction_fee"] is fx_fee


@pytest.mark.parametrize(
    "card_id",
    [
        "chase-sapphire-preferred",
        "chase-sapphire-reserve",
        "chase-united-explorer",
        "chase-united-quest",
        "chase-united-club-infinite",
        "chase-world-of-hyatt",
        "chase-marriott-bonvoy-boundless",
        "chase-marriott-bonvoy-bold",
        "chase-ihg-one-rewards-premier",
        "chase-ihg-one-rewards-traveler",
        "chase-southwest-rapid-rewards-plus",
        "chase-southwest-rapid-rewards-premier",
        "chase-southwest-rapid-rewards-priority",
    ],
)
def test_chase_travel_and_cobrand_cards_confirmed_no_foreign_transaction_fee(card_id: str) -> None:
    """These were actively researched and confirmed fee-free, not just left
    unaudited — distinct from a card this pilot batch didn't cover yet."""
    detail = client.get(f"/api/cards/{card_id}").json()
    assert detail["foreign_transaction_fee"] is False
    assert detail["intro_apr_purchases"] is None
    assert detail["intro_apr_balance_transfers"] is None


def test_chase_cards_with_confirmed_foreign_transaction_fee() -> None:
    # Freedom Flex/Unlimited/Rise/Slate Edge/Disney Premier all confirmed to
    # currently charge 3% (Freedom Flex is scheduled to drop it 2026-09-20,
    # still in the future as of this audit).
    for card_id in (
        "chase-freedom-rise",
        "chase-disney-premier",
        "chase-amazon-prime-visa",
    ):
        detail = client.get(f"/api/cards/{card_id}").json()
        assert detail["intro_apr_purchases"] is None
        assert detail["intro_apr_balance_transfers"] is None
    assert client.get("/api/cards/chase-freedom-rise").json()["foreign_transaction_fee"] is True
    assert client.get("/api/cards/chase-disney-premier").json()["foreign_transaction_fee"] is True
    assert client.get("/api/cards/chase-amazon-prime-visa").json()["foreign_transaction_fee"] is False
