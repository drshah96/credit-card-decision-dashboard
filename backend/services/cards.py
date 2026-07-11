import json
from functools import lru_cache
from pathlib import Path

from backend.models import Card, CardSummary

_DATA_PATH = Path(__file__).parent.parent / "data" / "cards.json"


@lru_cache(maxsize=1)
def _load_raw() -> list[dict]:
    with _DATA_PATH.open() as f:
        return json.load(f)["cards"]


def get_all_cards() -> list[Card]:
    return [Card(**c) for c in _load_raw()]


def get_card(card_id: str) -> Card | None:
    for raw in _load_raw():
        if raw["id"] == card_id:
            return Card(**raw)
    return None


def get_card_summaries() -> list[CardSummary]:
    summaries = []
    for card in get_all_cards():
        easy_total = sum(
            c.default_value for c in card.credits if c.tier == "easy" and not c.removed
        )
        max_total = sum(c.max_annual for c in card.credits if not c.removed)
        summaries.append(
            CardSummary(
                id=card.id,
                name=card.name,
                issuer=card.issuer,
                network=card.network,
                points_program=card.points_program,
                accent_color=card.accent_color,
                annual_fee=card.annual_fee,
                effective_cost=card.effective_cost,
                verdict=card.verdict,
                total_easy_credits=easy_total,
                total_max_credits=max_total,
            )
        )
    return summaries
