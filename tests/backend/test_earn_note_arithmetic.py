"""Dollar figures in earn notes must agree with the card's own earn rates.

An earn note that says a bonus category is "worth at most $N a year more than
the base rate" is doing arithmetic in prose, and prose arithmetic is not
checked by anything else in this repo. `discover-it-chrome` said $80 a year
when the answer is $40, because $80 is the gross return on the capped spend
and the base rate would have earned half of it anyway. Its sibling
`discover-it-student-chrome`, with an identical earn structure, said the
correct figure. The two disagreed for months and nothing noticed.

The error survived a length rewrite that explicitly diffed every number
against the previous version: that check proves no number was *invented*,
which is a different and weaker claim than the numbers being *right*.

So this recomputes the claim from `earn_rates` rather than trusting it:

    incremental = (bonus_rate - base_rate) x capped_spend

Only notes phrased as an explicit "more than the base rate" comparison are
checkable, so the test asserts how many it found. A phrasing change that
silently drops every card out of scope fails here rather than passing over
nothing.
"""

import json
import pathlib
import re

CARDS_DIR = pathlib.Path(__file__).resolve().parents[2] / "backend" / "data" / "cards"

# "worth at most $40 a year more than the base rate" / "$10 a quarter over the base"
CLAIM = re.compile(r"\$([\d,]+) a (year|quarter) (?:more than the base|over the base)", re.I)
# "first $1,000/quarter combined with restaurants" / "on up to $1,000 combined per quarter"
CAP = re.compile(r"\$([\d,]+)\s*(?:/|\s+(?:combined\s+)?per\s+)quarter", re.I)
PERCENT = re.compile(r"^([\d.]+)%$")


def _cards() -> list[dict]:
    out = []
    for path in sorted(CARDS_DIR.glob("*/*.json")):
        if path.parent.name == "staging":
            continue
        out.append(json.loads(path.read_text()))
    return out


def _money(text: str) -> int:
    return int(text.replace(",", ""))


def _rate(multiplier: str) -> float | None:
    """A percentage earn rate as a fraction. None for points multipliers ("3x"),
    which do not convert to dollars without a cents-per-point figure."""
    match = PERCENT.match(multiplier.strip())
    return float(match.group(1)) / 100 if match else None


def test_earn_notes_that_state_a_dollar_gain_compute_it_correctly() -> None:
    checked, wrong = 0, []

    for card in _cards():
        note = card.get("earn_note") or ""
        claim = CLAIM.search(note)
        if not claim:
            continue

        rates = card.get("earn_rates") or []
        base = next((_rate(r["multiplier"]) for r in rates if r.get("is_base")), None)
        # The capped bonus rate: the one whose category names a quarterly cap.
        bonus = next(
            (
                (_rate(r["multiplier"]), CAP.search(r["category"]))
                for r in rates
                if not r.get("is_base") and CAP.search(r.get("category") or "")
            ),
            None,
        )
        if base is None or bonus is None or bonus[0] is None:
            continue

        bonus_rate, cap_match = bonus
        per_quarter = (bonus_rate - base) * _money(cap_match.group(1))
        expected = per_quarter if claim.group(2).lower() == "quarter" else per_quarter * 4
        stated = _money(claim.group(1))
        checked += 1
        if abs(stated - expected) > 0.51:
            wrong.append(
                f"{card['id']}: note says ${stated} a {claim.group(2)} over the base, "
                f"but ({bonus_rate:.0%} - {base:.0%}) x ${_money(cap_match.group(1)):,} "
                f"is ${expected:.0f}"
            )

    assert wrong == [], "\n".join(wrong)
    # Not a vacuous pass: if a rewrite rephrases every note out of scope, the
    # regex stops matching and this test would otherwise report success while
    # checking nothing.
    assert checked >= 2, (
        f"only {checked} notes matched the claim pattern; has the phrasing changed?"
    )


def test_sibling_cards_with_the_same_earn_structure_state_the_same_gain() -> None:
    """The Chrome pair is the reason this file exists: identical earn rates and
    caps, one note right and one wrong. Cards that earn the same should not
    disagree about what that earns you."""
    by_shape: dict[tuple, list[tuple[str, int, str]]] = {}

    for card in _cards():
        note = card.get("earn_note") or ""
        claim = CLAIM.search(note)
        if not claim:
            continue
        shape = tuple(
            sorted((r["multiplier"], r.get("category", "")) for r in card.get("earn_rates") or [])
        )
        per_year = _money(claim.group(1)) * (4 if claim.group(2).lower() == "quarter" else 1)
        by_shape.setdefault(shape, []).append((card["id"], per_year, claim.group(0)))

    disagreements = [
        f"{[c[0] for c in cards]} share an earn structure but claim {sorted({c[2] for c in cards})}"
        for cards in by_shape.values()
        if len(cards) > 1 and len({c[1] for c in cards}) > 1
    ]
    assert disagreements == [], "\n".join(disagreements)
