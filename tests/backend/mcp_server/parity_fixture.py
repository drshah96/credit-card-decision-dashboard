"""Builds the Python-written inputs of the ranking parity fixture. Deterministic."""

import json
import random
from pathlib import Path

from backend.mcp_server.ranking import RANK_INPUT_FIELDS
from backend.models import CardSummary

FIXTURE_DIR = Path(__file__).parent.parent.parent / "fixtures" / "ranking_parity"
SUMMARIES_PATH = FIXTURE_DIR / "summaries.json"
SCENARIOS_PATH = FIXTURE_DIR / "scenarios.json"
EXPECTED_PATH = FIXTURE_DIR / "expected.json"
WALLET_SEED = 20261106
WALLET_COUNT = 20


def _scenario(name: str, card_ids: list[str] | None, pooling: bool) -> dict:
    return {"name": name, "card_ids": card_ids, "pooling": pooling}


def build_summaries(summaries: list[CardSummary]) -> list[dict]:
    """Ranking inputs only, so editing a verdict never forces a regeneration."""
    dumped = [s.model_dump(mode="json", include=set(RANK_INPUT_FIELDS)) for s in summaries]
    return sorted(dumped, key=lambda s: s["id"])


def build_scenarios(summaries: list[dict]) -> list[dict]:
    ids = [s["id"] for s in summaries]
    scenarios = [_scenario("catalog_default", None, False), _scenario("catalog_pooled", None, True)]

    pools: dict[str, list[dict]] = {}
    for summary in summaries:
        if summary["points_pool_id"]:
            pools.setdefault(summary["points_pool_id"], []).append(summary)
    for pool_id in sorted(pools):
        members = pools[pool_id]
        scenarios.append(_scenario(f"pool_{pool_id}_full", [m["id"] for m in members], True))
        feeders = [m["id"] for m in members if not m["points_pool_receiver"]]
        scenarios.append(_scenario(f"pool_{pool_id}_feeders", feeders, True))

    pairs = [(s["id"], s["secured_variant_id"]) for s in summaries if s["secured_variant_id"]]
    scenarios.append(_scenario("secured_pairs", [i for pair in pairs for i in pair], True))
    scenarios.append(_scenario("secured_only", [secured for _, secured in pairs], True))

    receiver = next(s["id"] for s in summaries if s["points_pool_receiver"])
    scenarios.append(_scenario("single_receiver", [receiver], True))

    rng = random.Random(WALLET_SEED)
    for index in range(WALLET_COUNT):
        wallet = rng.sample(ids, rng.randint(2, 25))
        scenarios.append(_scenario(f"wallet_{index:02d}", sorted(wallet), True))
    return scenarios


def dump_json(value: object) -> str:
    return json.dumps(value, indent=1, ensure_ascii=False) + "\n"
