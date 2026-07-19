import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

CARD_IDS = ["amex", "csr", "venturex", "delta", "amex-gold"]


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
    assert len(data["earn_rates"]) > 0


def test_get_card_not_found() -> None:
    response = client.get("/api/cards/nonexistent")
    assert response.status_code == 404


def test_annual_fees_are_correct() -> None:
    response = client.get("/api/cards")
    fees = {c["id"]: c["annual_fee"] for c in response.json()}
    assert fees["amex"] == 895
    assert fees["csr"] == 795
    assert fees["venturex"] == 395
    assert fees["delta"] == 350
    assert fees["amex-gold"] == 325


def test_easy_credits_not_negative() -> None:
    response = client.get("/api/cards")
    for card in response.json():
        assert card["total_easy_credits"] >= 0
        assert card["total_max_credits"] >= card["total_easy_credits"]


def test_removed_credits_excluded_from_totals() -> None:
    """Credits marked removed=true must not contribute to easy/max credit totals."""
    response = client.get("/api/cards/amex")
    card = response.json()
    # Saks is removed (max_annual=0, removed=true) — verify it's in data but excluded from totals
    saks = next(c for c in card["credits"] if c["id"] == "saks")
    assert saks["removed"] is True
    # Recalculate totals manually and compare to summary
    summary_response = client.get("/api/cards")
    amex_summary = next(c for c in summary_response.json() if c["id"] == "amex")
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
