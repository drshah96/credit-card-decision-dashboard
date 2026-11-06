"""Exhaustive over the catalog, fixed per deploy. A breach fails the build, not an agent."""

import json

from .conftest import connect, structured

SECTIONS = [
    "credit_tips",
    "timeline",
    "transfer_partner_list",
    "services",
    "additional_cards",
    "removed_credits",
]
BUDGET_FIND = 12_288
BUDGET_GET_DEFAULT = 12_288
BUDGET_GET_FULL = 20_480
BUDGET_COMPARE = 12_288
BUDGET_RANK = 8_192
BUDGET_ESTIMATE = 4_096


def _bytes(result) -> int:
    return len(json.dumps(structured(result), separators=(",", ":"), ensure_ascii=False).encode())


async def test_every_budget_holds_for_the_largest_real_responses(snapshot):
    ids = list(snapshot.cards)
    async with connect(snapshot) as client:
        default_sizes = {}
        for card_id in ids:
            default_sizes[card_id] = _bytes(
                await client.call_tool("get_card", {"card_id": card_id})
            )
            full = _bytes(
                await client.call_tool("get_card", {"card_id": card_id, "sections": SECTIONS})
            )
            assert full <= BUDGET_GET_FULL, (card_id, full)
            estimate = _bytes(await client.call_tool("estimate_value", {"card_id": card_id}))
            assert estimate <= BUDGET_ESTIMATE, (card_id, estimate)
        assert max(default_sizes.values()) <= BUDGET_GET_DEFAULT

        largest = sorted(default_sizes, key=default_sizes.get, reverse=True)[:4]
        compare = _bytes(await client.call_tool("compare_cards", {"card_ids": largest}))
        assert compare <= BUDGET_COMPARE, compare

        find = _bytes(await client.call_tool("find_cards", {"limit": 20}))
        assert find <= BUDGET_FIND, find
        for query in ("citi", "chase", "capital", "american express"):
            size = _bytes(await client.call_tool("find_cards", {"query": query, "limit": 20}))
            assert size <= BUDGET_FIND, (query, size)

        for key in snapshot.rankings:
            size = _bytes(
                await client.call_tool("rank_by_category", {"category": key, "limit": 10})
            )
            assert size <= BUDGET_RANK, (key, size)
