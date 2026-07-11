import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

CARD_IDS = ["amex", "csr", "venturex", "delta"]


def test_list_cards_returns_all_four() -> None:
    response = client.get("/api/cards")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4
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


def test_easy_credits_not_negative() -> None:
    response = client.get("/api/cards")
    for card in response.json():
        assert card["total_easy_credits"] >= 0
        assert card["total_max_credits"] >= card["total_easy_credits"]
