"""The ranking cannot read affiliate status, by construction and by behaviour."""

import random

import pytest

from backend.mcp_server.ranking import CATEGORY_KEYS, RANK_INPUT_FIELDS, RankInput, rank_category
from backend.services.cards import get_card_summaries

ALLOWED = {
    "id",
    "name",
    "annual_fee",
    "categories",
    "best_cpp",
    "secured_variant_id",
    "points_pool_id",
    "points_pool_receiver",
}


def test_rank_input_is_an_exact_allowlist():
    assert RANK_INPUT_FIELDS == ALLOWED
    assert "is_affiliate_link" not in RANK_INPUT_FIELDS


def _ranking(summaries, pooling):
    inputs = [RankInput.from_summary(s) for s in summaries]
    return {key: rank_category(inputs, key, pooling=pooling) for key in CATEGORY_KEYS}


@pytest.mark.parametrize("pooling", [False, True])
def test_flipping_affiliate_flags_changes_nothing(pooling):
    base = get_card_summaries()
    baseline = _ranking(base, pooling)
    assert any(baseline.values())

    def flagged(pick):
        return [s.model_copy(update={"is_affiliate_link": pick(s)}) for s in base]

    variants = [flagged(lambda s: True), flagged(lambda s: False)]
    for seed in (1, 2, 3):
        rng = random.Random(seed)
        variants.append(flagged(lambda s: rng.random() < 0.5))
    for variant in variants:
        assert _ranking(variant, pooling) == baseline
