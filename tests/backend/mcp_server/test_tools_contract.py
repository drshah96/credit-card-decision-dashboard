"""Each tool's published promises: schema validity, errors, echoes and honesty rules."""

import json

import jsonschema
import pytest

from backend.mcp_server import projections
from backend.refresh.state import VerificationState

from .conftest import connect, structured, text_of

CALLS = [
    ("find_cards", {"query": "sapphire"}),
    ("find_cards", {"issuer": "Discover", "limit": 2}),
    ("get_card", {"card_id": "amex-gold"}),
    (
        "get_card",
        {
            "card_id": "amex-platinum",
            "sections": [
                "credit_tips",
                "timeline",
                "transfer_partner_list",
                "services",
                "additional_cards",
                "removed_credits",
            ],
        },
    ),
    ("compare_cards", {"card_ids": ["amex-gold", "citi-strata"]}),
    ("rank_by_category", {"category": "dining"}),
    ("rank_by_category", {"category": "dining", "card_ids": ["chase-freedom-flex"], "limit": 5}),
    ("estimate_value", {"card_id": "amex-gold"}),
]


@pytest.mark.parametrize(("tool", "args"), CALLS)
async def test_output_validates_against_its_published_schema(snapshot, tool, args):
    async with connect(snapshot) as client:
        published = {t.name: t for t in (await client.list_tools()).tools}
        result = await client.call_tool(tool, args)
    data = structured(result)
    jsonschema.validate(data, published[tool].output_schema)
    assert text_of(result) == json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    assert data["meta"]["contract_version"] == "1.0.0"
    assert data["meta"]["catalog_digest"] == snapshot.digest
    assert data["meta"]["disclaimer"]


async def test_unknown_card_gets_suggestions_and_no_structured_content(snapshot):
    async with connect(snapshot) as client:
        result = await client.call_tool("get_card", {"card_id": "amex-goldd"})
    assert result.is_error is True
    assert result.structured_content is None
    text = text_of(result)
    assert text.startswith("[unknown_card_id]")
    assert "amex-gold" in text and "find_cards" in text
    assert len(text) <= 400


async def test_one_unknown_id_refuses_the_whole_comparison(snapshot):
    async with connect(snapshot) as client:
        result = await client.call_tool(
            "compare_cards", {"card_ids": ["amex-gold", "no-such-card"]}
        )
    assert result.is_error is True
    assert "no-such-card" in text_of(result)


@pytest.mark.parametrize(
    ("tool", "args", "code"),
    [
        ("compare_cards", {"card_ids": ["amex-gold", "amex-gold"]}, "duplicate_card_ids"),
        (
            "rank_by_category",
            {"category": "dining", "card_ids": ["amex-gold", "amex-gold"]},
            "duplicate_card_ids",
        ),
        (
            "estimate_value",
            {
                "card_id": "amex-gold",
                "credit_overrides": [{"credit_id": "nope", "annual_value": 1}],
            },
            "unknown_credit_id",
        ),
        (
            "estimate_value",
            {
                "card_id": "amex-platinum",
                "credit_overrides": [{"credit_id": "saks", "annual_value": 1}],
            },
            "unknown_credit_id",
        ),
        (
            "estimate_value",
            {
                "card_id": "amex-gold",
                "credit_overrides": [
                    {"credit_id": "dining", "annual_value": 1},
                    {"credit_id": "dining", "annual_value": 2},
                ],
            },
            "duplicate_credit_ids",
        ),
    ],
)
async def test_error_codes(snapshot, tool, args, code):
    async with connect(snapshot) as client:
        result = await client.call_tool(tool, args)
    assert result.is_error is True
    assert text_of(result).startswith(f"[{code}]")


@pytest.mark.parametrize(
    ("tool", "args", "field"),
    [
        ("rank_by_category", {"category": "nope"}, "category"),
        ("compare_cards", {"card_ids": ["amex-gold"]}, "card_ids"),
        ("find_cards", {"limit": 500}, "limit"),
        ("get_card", {"card_id": "Not A Valid Id"}, "card_id"),
    ],
)
async def test_schema_violations_name_the_field(snapshot, tool, args, field):
    async with connect(snapshot) as client:
        result = await client.call_tool(tool, args)
    assert result.is_error is True
    assert field in text_of(result)


async def test_query_echo_shows_which_arguments_applied(snapshot):
    # The SDK silently ignores unknown argument names, so the echo is how an agent notices.
    async with connect(snapshot) as client:
        data = structured(await client.call_tool("find_cards", {"query": "gold", "limitt": 1}))
    assert data["query"] == {"query": "gold", "issuer": None, "limit": 10, "offset": 0}


async def test_get_card_reports_omitted_sections_and_withholds_the_bonus(snapshot):
    async with connect(snapshot) as client:
        result = await client.call_tool("get_card", {"card_id": "amex-gold"})
        full = await client.call_tool(
            "get_card", {"card_id": "amex-gold", "sections": ["timeline", "timeline"]}
        )
    data = structured(result)
    assert "timeline" not in data["card"]
    assert "timeline" in data["omitted_sections"]
    assert data["withheld"][0]["field"] == "welcome_bonus"
    assert "Free text" in data["withheld"][0]["reason"]
    assert "welcome_bonus" not in data["card"]
    expanded = structured(full)
    assert expanded["query"]["sections"] == ["timeline"]
    assert expanded["card"]["timeline"]
    assert "timeline" not in expanded["omitted_sections"]


async def test_credit_tips_carry_warnings_without_the_internal_marker(snapshot):
    async with connect(snapshot) as client:
        data = structured(
            await client.call_tool(
                "get_card", {"card_id": "amex-platinum", "sections": ["credit_tips"]}
            )
        )
    tips = [tip for credit in data["card"]["credits"] for tip in credit["tips"]]
    assert tips
    assert not any(tip["text"].startswith("warn::") for tip in tips)


async def test_not_recorded_never_carries_a_value(snapshot):
    async with connect(snapshot) as client:
        for card_id in snapshot.cards:
            data = structured(await client.call_tool("get_card", {"card_id": card_id}))
            for fact in data["card"]["rates_and_fees"].values():
                assert (fact["status"] == "recorded") == (fact["value"] is not None)


async def test_list_tools_expose_the_gaps_that_a_status_alone_would_hide(snapshot):
    async with connect(snapshot) as client:
        found = structured(await client.call_tool("find_cards", {"query": "citi double cash"}))
        compared = structured(
            await client.call_tool("compare_cards", {"card_ids": ["citi-double-cash", "amex-gold"]})
        )
        ranked = structured(
            await client.call_tool(
                "rank_by_category", {"category": "catch-all", "card_ids": ["citi-double-cash"]}
            )
        )
    for provenance in (
        found["cards"][0]["provenance"],
        compared["cards"][0]["provenance"],
        ranked["entries"][0]["provenance"],
    ):
        assert provenance["verification_status"] == "partially_verified"
        assert provenance["not_checked"] == ["rates_and_fees"]
        assert provenance["review_due_on"] == "2027-03-04"


async def test_a_card_with_no_recorded_check_is_not_verified(snapshot):
    async with connect(snapshot) as client:
        data = structured(
            await client.call_tool("get_card", {"card_id": "citi-costco-anywhere-visa"})
        )
    provenance = data["provenance"]
    assert provenance["verification_status"] == "not_verified"
    assert provenance["verified_on"] is None
    assert provenance["review_due_on"] is None
    assert provenance["evidence_url"] is None


async def test_issuer_pass_evidence_is_labelled(snapshot):
    async with connect(snapshot) as client:
        data = structured(await client.call_tool("get_card", {"card_id": "chase-freedom-flex"}))
    assert data["provenance"]["evidence_scope"] == "issuer_pass"
    assert data["provenance"]["evidence_url"].startswith(
        "https://github.com/drshah96/credit-card-decision-dashboard/commit/"
    )


async def test_overrides_are_clamped_and_reported(snapshot):
    async with connect(snapshot) as client:
        data = structured(
            await client.call_tool(
                "estimate_value",
                {
                    "card_id": "amex-gold",
                    "credit_overrides": [
                        {"credit_id": "dining", "annual_value": 5000},
                        {"credit_id": "uber", "annual_value": 60},
                    ],
                },
            )
        )
    by_id = {c["credit_id"]: c for c in data["credits"]}
    assert by_id["dining"]["applied_value"] == by_id["dining"]["max_annual"]
    assert by_id["dining"]["source"] == "override_clamped"
    assert by_id["dining"]["requested_value"] == 5000
    assert by_id["uber"]["source"] == "override"
    assert by_id["resy"]["source"] == "default"
    assert data["totals"]["applied_credit_value"] == by_id["dining"]["max_annual"] + 60
    assert data["totals"]["credits_at_zero"] == 3


async def test_find_cards_pages_and_reports_when_there_are_more(snapshot):
    async with connect(snapshot) as client:
        first = structured(await client.call_tool("find_cards", {"issuer": "Chase", "limit": 5}))
        last = structured(
            await client.call_tool("find_cards", {"issuer": "Chase", "limit": 5, "offset": 15})
        )
    assert first["returned"] == 5 and first["next_offset"] == 5
    assert first["total_matches"] == 19
    assert last["returned"] == 4 and last["next_offset"] is None


async def test_search_ignores_trademark_marks_and_case(snapshot):
    async with connect(snapshot) as client:
        marked = structured(await client.call_tool("find_cards", {"query": "SAPPHIRE® reserve"}))
    assert [c["card_id"] for c in marked["cards"]] == ["chase-sapphire-reserve"]


@pytest.mark.parametrize("query", ["   ", "\u00ae", "\u2122 \u2120"])
async def test_a_search_with_nothing_to_look_for_matches_no_cards(snapshot, query):
    async with connect(snapshot) as client:
        found = structured(
            await client.call_tool("find_cards", {"query": query, "issuer": "Chase"})
        )
    assert found["total_matches"] == 0
    assert found["cards"] == []
    assert found["next_offset"] is None
    assert found["query"]["query"] == query


async def test_wallet_mode_pools_and_hides_twins(snapshot):
    async with connect(snapshot) as client:
        wallet = structured(
            await client.call_tool(
                "rank_by_category",
                {
                    "category": "drugstores",
                    "card_ids": ["chase-freedom-flex", "chase-sapphire-reserve"],
                },
            )
        )
        catalog = structured(await client.call_tool("rank_by_category", {"category": "drugstores"}))
    assert wallet["mode"] == "wallet" and wallet["points_pooling_applied"] is True
    assert catalog["mode"] == "catalog" and catalog["points_pooling_applied"] is False
    assert catalog["hidden_as_secured_twins"]
    pooled = [e for e in wallet["entries"] if e["is_pooled"]]
    assert pooled and all(e["effective_cpp"] > e["best_cpp"] for e in pooled)


async def test_rank_entries_carry_no_affiliate_field(snapshot):
    async with connect(snapshot) as client:
        data = structured(await client.call_tool("rank_by_category", {"category": "dining"}))
    assert "is_affiliate_link" not in json.dumps(data)


@pytest.mark.parametrize(
    ("stored", "not_checked", "served"),
    [
        ("included", ["perks"], "included"),
        ("passes", [], "passes"),
        ("paid", [], "paid"),
        ("none", [], "none"),
        ("none", ["perks"], "unconfirmed"),
        (None, [], "unconfirmed"),
    ],
)
def test_lounge_access_never_serves_a_none_nobody_checked(stored, not_checked, served):
    record = {
        "evidence": "git:" + "0" * 40,
        "evidence_scope": "card",
        "facts_sha256": "0" * 64,
        "documents": [],
        "not_checked": not_checked,
        "note": "test",
    }
    state = VerificationState(card_id="x", last_verified_ok_at="2026-09-05", verification=record)
    assert projections.served_lounge_access(stored, state) == served


def test_lounge_access_none_on_a_card_with_no_check_is_unconfirmed():
    state = VerificationState(card_id="x", last_verified_ok_at=None, verification=None)
    assert projections.served_lounge_access("none", state) == "unconfirmed"
    assert projections.served_lounge_access("included", state) == "included"
