"""The Python ranking must equal the TypeScript ranking, floats included."""

import json
import os

import pytest

from backend.mcp_server.ranking import (
    BRAND_EXCLUDE_SOURCES,
    CATEGORIES,
    CENTS_PER_GALLON_SOURCE,
    LIMITED_RATE_SOURCE,
    MATCHER_SOURCES,
    ROTATING_RATE_SOURCE,
    WHOLESALE_EXCLUDES,
    RankInput,
    collation_key,
    parse_multiplier_value,
    rank_category,
)
from backend.services.cards import get_card_summaries

from .parity_fixture import (
    EXPECTED_PATH,
    SCENARIOS_PATH,
    SUMMARIES_PATH,
    WINNING_RATES_PATH,
    build_scenarios,
    build_summaries,
    build_winning_rates,
    dump_json,
)

REGENERATE = """Ranking inputs or rules changed. Regenerate, then review the expected.json diff:
UPDATE_RANKING_FIXTURE=1 uv run pytest tests/backend/mcp_server/test_ranking_parity.py
(cd frontend && npx vitest run tests/utils/rankingParity.test.ts -u)
uv run pytest tests/backend/mcp_server/test_ranking_parity.py"""


@pytest.fixture(scope="module")
def summaries():
    return get_card_summaries()


def test_update_mode_writes_inputs_and_refuses_ci(summaries):
    if not os.environ.get("UPDATE_RANKING_FIXTURE"):
        pytest.skip("only runs in update mode")
    assert not os.environ.get("CI"), "fixtures are regenerated locally, never in CI"
    dumped = build_summaries(summaries)
    SUMMARIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARIES_PATH.write_text(dump_json(dumped))
    SCENARIOS_PATH.write_text(dump_json(build_scenarios(dumped)))
    WINNING_RATES_PATH.write_text(dump_json(build_winning_rates(dumped)))


def _expected() -> dict:
    return json.loads(EXPECTED_PATH.read_text())


def test_inputs_are_current(summaries):
    dumped = build_summaries(summaries)
    assert json.loads(SUMMARIES_PATH.read_text()) == dumped, REGENERATE
    assert json.loads(SCENARIOS_PATH.read_text()) == build_scenarios(dumped), REGENERATE
    assert json.loads(WINNING_RATES_PATH.read_text()) == build_winning_rates(dumped), (
        "Which rate a card competes on changed. Regenerate, then read the winning_rates.json "
        "diff for any partner-only, online-only or time-limited rate now counting.\n" + REGENERATE
    )


def test_output_equals_typescript_exactly(summaries):
    inputs = [RankInput.from_summary(s) for s in summaries]
    by_id = {c.id: c for c in inputs}
    expected = _expected()["scenarios"]
    scenarios = json.loads(SCENARIOS_PATH.read_text())
    assert set(expected) == {s["name"] for s in scenarios}, REGENERATE

    for scenario in scenarios:
        ids = scenario["card_ids"]
        cards = inputs if ids is None else [by_id[i] for i in ids]
        for category in CATEGORIES:
            ranked = rank_category(
                cards, category.key, pooling=scenario["pooling"], own_cards=scenario["own_cards"]
            )
            actual = {
                "total": len(ranked),
                "real": sum(not e.is_fallback for e in ranked),
                "top": [
                    [e.card.id, e.effective_value, e.multiplier, e.is_fallback, e.is_pooled]
                    for e in ranked[:10]
                ],
            }
            where = f"{scenario['name']}/{category.key}\n{REGENERATE}"
            assert actual == expected[scenario["name"]][category.key], where


def test_definitions_equal_typescript():
    expected = _expected()
    assert [
        {
            "key": c.key,
            "label": c.label,
            "emoji": c.emoji,
            "description": c.description,
            "group": c.group,
        }
        for c in CATEGORIES
    ] == expected["categories"], REGENERATE
    assert {k: {"source": v, "flags": "i"} for k, v in MATCHER_SOURCES.items()} == expected[
        "matchers"
    ], REGENERATE
    assert list(WHOLESALE_EXCLUDES) == expected["wholesale_excludes"], REGENERATE
    assert {k: {"source": v, "flags": "i"} for k, v in BRAND_EXCLUDE_SOURCES.items()} == expected[
        "brand_excludes"
    ], REGENERATE
    assert expected["limited_rate"] == {"source": LIMITED_RATE_SOURCE, "flags": "i"}, REGENERATE
    assert expected["rotating_rate"] == {"source": ROTATING_RATE_SOURCE, "flags": "i"}, REGENERATE
    assert expected["cents_per_gallon"] == {
        "source": CENTS_PER_GALLON_SOURCE,
        "flags": "i",
    }, REGENERATE


def test_name_collation_equals_locale_compare(summaries):
    names = sorted((s.name for s in summaries), key=collation_key)
    assert names == _expected()["names_sorted"], REGENERATE


def test_the_fixture_actually_exercises_each_rule():
    expected = _expected()["scenarios"]
    rows = [row for scenario in expected.values() for row in scenario.values()]
    assert len(expected) >= 27
    assert all(len(scenario) == 19 for scenario in expected.values())
    assert any(any(top[4] for top in row["top"]) for row in rows), "no pooled entry"
    assert any(any(top[3] for top in row["top"]) for row in rows), "no fallback entry"

    scenarios = {s["name"]: s for s in json.loads(SCENARIOS_PATH.read_text())}
    summaries = json.loads(SUMMARIES_PATH.read_text())
    hidden = {s["secured_variant_id"] for s in summaries if s["secured_variant_id"]}
    ranked_ids = {top[0] for row in expected["secured_pairs"].values() for top in row["top"]}
    assert hidden <= set(scenarios["secured_pairs"]["card_ids"])
    assert not hidden & ranked_ids, "no secured twin was hidden"


@pytest.mark.parametrize(
    ("label", "value"),
    [("5×", 5.0), ("1.5%", 1.5), ("2 pts/$1", 2.0), ("1.2.3x", 1.2), (".5x", 0.5), ("Stars", None)],
)
def test_parse_multiplier_follows_parse_float(label, value):
    expected = float("-inf") if value is None else value
    assert parse_multiplier_value(label) == expected
