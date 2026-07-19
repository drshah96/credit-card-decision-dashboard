import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

CARD_IDS = [
    "amex-platinum",
    "chase-sapphire-reserve",
    "venturex",
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
    # Full card fields must NOT be in summary
    assert "credits" not in card
    assert "insurance" not in card
    assert "timeline" not in card


@pytest.mark.parametrize("card_id", CARD_IDS)
def test_get_card_detail(card_id: str) -> None:
    response = client.get(f"/api/cards/{card_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == card_id
    assert "credits" in data
    assert "insurance" in data
    assert "timeline" in data
    # Slate Edge has no rewards program at all (0% APR + APR-reduction mechanic
    # instead of cash back/points) — every other card earns something.
    if card_id != "chase-slate-edge":
        assert len(data["earn_rates"]) > 0


def test_get_card_not_found() -> None:
    response = client.get("/api/cards/nonexistent")
    assert response.status_code == 404


def test_annual_fees_are_correct() -> None:
    response = client.get("/api/cards")
    fees = {c["id"]: c["annual_fee"] for c in response.json()}
    assert fees["amex-platinum"] == 895
    assert fees["chase-sapphire-reserve"] == 795
    assert fees["venturex"] == 395
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


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
