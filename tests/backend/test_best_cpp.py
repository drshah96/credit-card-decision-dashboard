"""`CardSummary.best_cpp` must be the redemption the author flagged.

Every card's `redemption_options` are rungs. On airline cards they run
"Statement / low-end", then "Average redemption", then "Premium-cabin sweet
spots" — and the author flags the middle one, because that is what a typical
person actually gets. The top rung is real but aspirational.

`best_cpp` took the maximum, so it returned the sweet spot: Delta at 2.2 cents
against the authored 1.15, United at 2.5 against 1.3. Top Picks ranks on
`multiplier x best_cpp`, which meant this site's own ranking engine valued
cards at their advertised ceiling — the exact thing the site argues against.

The failure was invisible because the number was plausible, internally
consistent, and appeared nowhere as text. Nothing displays `best_cpp`; it only
moves cards up a ranking.
"""

import json
import pathlib

from backend.services.cards import get_card_summaries

CARDS_DIR = pathlib.Path(__file__).resolve().parents[2] / "backend" / "data" / "cards"


def _authored() -> dict[str, list[dict]]:
    out = {}
    for path in CARDS_DIR.glob("*/*.json"):
        if path.parent.name == "staging":
            continue
        card = json.loads(path.read_text())
        out[card["id"]] = (card.get("points") or {}).get("redemption_options") or []
    return out


def test_best_cpp_matches_the_flagged_option_on_every_card() -> None:
    authored = _authored()
    summaries = {c.id: c.best_cpp for c in get_card_summaries()}
    assert len(summaries) > 100

    wrong = []
    for card_id, options in authored.items():
        flagged = [o["cpp"] for o in options if o.get("best") and o.get("cpp") is not None]
        expected = max(flagged) if flagged else 0.0
        if abs(summaries.get(card_id, 0.0) - expected) > 1e-9:
            wrong.append(f"{card_id}: expected {expected}, got {summaries.get(card_id)}")
    assert wrong == [], "\n".join(wrong)


def test_best_cpp_is_not_simply_the_highest_number_on_the_card() -> None:
    """The regression itself, stated as a property rather than a value.

    If `best_cpp` ever equals `max(all options)` on every card again, either
    the bug is back or every unflagged high rung has been deleted. Both want
    looking at, which is why this asserts the disagreement still exists rather
    than pinning particular cards.
    """
    authored = _authored()
    summaries = {c.id: c.best_cpp for c in get_card_summaries()}

    disagreeing = [
        card_id
        for card_id, options in authored.items()
        if options
        and max((o["cpp"] for o in options if o.get("cpp") is not None), default=0.0)
        > summaries.get(card_id, 0.0) + 1e-9
    ]
    # 16 cards carry a higher unflagged rung than the one the author chose.
    assert len(disagreeing) >= 10, (
        "no card has an unflagged redemption higher than its best_cpp, which "
        "means best_cpp is taking the maximum again or the rungs are gone"
    )


def test_the_airline_cards_are_ranked_on_their_average_not_their_sweet_spot() -> None:
    """Named cards, because these are the ones the bug distorted most and the
    ones whose rankings visibly moved when it was fixed."""
    summaries = {c.id: c.best_cpp for c in get_card_summaries()}
    for card_id, expected in [
        ("amex-delta-skymiles-gold", 1.15),
        ("amex-delta-skymiles-reserve", 1.15),
        ("chase-united-explorer", 1.3),
        ("citi-aadvantage-platinum-select", 1.4),
    ]:
        assert summaries[card_id] == expected, card_id


def test_a_card_with_no_redemption_options_still_reports_zero() -> None:
    """13 cards have none. They ranked at 0.0 before and must still, or every
    cash-back card would silently drop out of the points-weighted rankings."""
    authored = _authored()
    summaries = {c.id: c.best_cpp for c in get_card_summaries()}
    empty = [cid for cid, options in authored.items() if not options]
    assert len(empty) >= 5
    for card_id in empty:
        assert summaries[card_id] == 0.0, card_id
