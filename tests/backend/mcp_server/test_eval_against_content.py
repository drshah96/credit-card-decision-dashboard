"""An independent check: raw card files against tool output, computed here from scratch.

May not import the server's value, ranking, schema or projection code. That would make the
eval the code checking itself. The ast test below enforces it.
"""

import ast
import json
import re
from pathlib import Path

from .conftest import connect, structured

ROOT = Path(__file__).parent.parent.parent.parent
CARDS_DIR = ROOT / "backend" / "data" / "cards"
REFRESH_DIR = ROOT / "backend" / "data" / "refresh"
EXPECTED = json.loads(
    (ROOT / "tests" / "fixtures" / "ranking_parity" / "expected.json").read_text()
)
SCENARIOS = json.loads(
    (ROOT / "tests" / "fixtures" / "ranking_parity" / "scenarios.json").read_text()
)
FACT_FIELDS = [
    "variable_apr",
    "balance_transfer_apr",
    "balance_transfer_fee",
    "foreign_transaction_fee",
    "foreign_transaction_fee_rate",
    "cash_advance_apr",
    "penalty_apr",
    "penalty_apr_trigger",
    "pay_over_time_fee",
    "late_payment_fee",
    "returned_payment_fee",
    "returned_check_fee",
    "intro_apr_purchases",
    "intro_apr_balance_transfers",
]
SILENT = re.compile(
    r"^not (publicly documented|published|confirmed|listed|advertised|disclosed)\b", re.I
)


def _raw_cards() -> dict[str, dict]:
    cards = {}
    for path in CARDS_DIR.glob("**/*.json"):
        if "staging" not in path.parts:
            card = json.loads(path.read_text())
            cards[card["id"]] = card
    return cards


def _raw_sidecar(card_id: str) -> dict:
    return json.loads((REFRESH_DIR / f"{card_id}.json").read_text())


def _active(card: dict) -> list[dict]:
    return [c for c in card["credits"] if not c.get("removed", False)]


def _expected_lounge_access(raw: dict, sidecar: dict) -> str:
    level = raw.get("lounge_access")
    if level is None:
        return "unconfirmed"
    record = sidecar["verification"]
    if level == "none" and (record is None or "perks" in record["not_checked"]):
        return "unconfirmed"
    return level


def _expected_status(sidecar: dict) -> str:
    if sidecar["verification"] is None:
        return "not_verified"
    return "partially_verified" if sidecar["verification"]["not_checked"] else "verified"


def _expected_level(row: dict, sidecar: dict) -> str:
    if row["level"] != "none":
        return row["level"]
    record = sidecar["verification"]
    if record is None or "insurance" in record["not_checked"] or SILENT.match(row["detail"]):
        return "unconfirmed"
    return "none"


def test_this_file_cannot_import_the_code_it_checks():
    allowed = {"json", "re", "ast", "pathlib", "conftest"}
    for node in ast.walk(ast.parse(Path(__file__).read_text())):
        if isinstance(node, ast.Import):
            assert {a.name.split(".")[0] for a in node.names} <= allowed
        elif isinstance(node, ast.ImportFrom):
            assert (node.module or "").split(".")[0] in allowed


async def test_get_card_equals_every_raw_file(snapshot):
    cards = _raw_cards()
    assert len(cards) == 109
    async with connect(snapshot) as client:
        for card_id, raw in cards.items():
            data = structured(await client.call_tool("get_card", {"card_id": card_id}))
            served = data["card"]
            sidecar = _raw_sidecar(card_id)
            assert (served["name"], served["issuer"], served["network"]) == (
                raw["name"],
                raw["issuer"],
                raw["network"],
            )
            assert served["annual_fee"] == raw["annual_fee"]
            assert served["editorial"]["verdict"]["text"] == raw["verdict"]["text"]
            assert [
                (c["id"], c["max_annual"], c["default_value"], c["tier"]) for c in served["credits"]
            ] == [(c["id"], c["max_annual"], c["default_value"], c["tier"]) for c in _active(raw)]
            assert [(r["category"], r["multiplier"]) for r in served["earn_rates"]] == [
                (r["category"], r["multiplier"]) for r in raw["earn_rates"]
            ]
            for field in FACT_FIELDS:
                value = raw.get(field)
                fact = served["rates_and_fees"][field]
                assert fact["status"] == ("not_recorded" if value is None else "recorded"), field
                assert fact["value"] == value, field
            assert "welcome_bonus" not in json.dumps(served)
            sources = data["provenance"]["issuer_sources"]
            if raw.get("official_url"):
                assert sources[0] == {"kind": "product_page", "url": raw["official_url"]}
            else:
                assert sources == []
            assert served["lounge_access"] == _expected_lounge_access(raw, sidecar)
            assert data["provenance"]["verified_on"] == sidecar["last_verified_ok_at"]
            assert data["provenance"]["verification_status"] == _expected_status(sidecar)
            assert [i["level"] for i in served["insurance"]] == [
                _expected_level(i, sidecar) for i in raw["insurance"]
            ]


async def test_no_silent_detail_is_ever_served_as_none(snapshot):
    served_none = silent = 0
    async with connect(snapshot) as client:
        for card_id in _raw_cards():
            data = structured(await client.call_tool("get_card", {"card_id": card_id}))
            for row in data["card"]["insurance"]:
                if row["level"] == "none":
                    served_none += 1
                    assert not SILENT.match(row["detail"]), (card_id, row)
                elif row["level"] == "unconfirmed":
                    silent += 1
    assert served_none and silent, "both outcomes must occur, or this test proves nothing"


async def test_estimate_value_totals_equal_sums_computed_here(snapshot):
    async with connect(snapshot) as client:
        for card_id, raw in _raw_cards().items():
            data = structured(await client.call_tool("estimate_value", {"card_id": card_id}))
            active = _active(raw)
            used = sum(c["default_value"] for c in active)
            advertised = sum(c["max_annual"] for c in active)
            assert data["totals"] == {
                "applied_credit_value": used,
                "applied_net": used - raw["annual_fee"],
                "advertised_credit_value": advertised,
                "best_case_net": advertised - raw["annual_fee"],
                "credits_at_zero": sum(c["default_value"] == 0 for c in active),
            }


async def test_one_clamped_override_per_credit_bearing_card(snapshot):
    async with connect(snapshot) as client:
        for card_id, raw in _raw_cards().items():
            active = _active(raw)
            if not active:
                continue
            target = active[0]
            data = structured(
                await client.call_tool(
                    "estimate_value",
                    {
                        "card_id": card_id,
                        "credit_overrides": [
                            {"credit_id": target["id"], "annual_value": target["max_annual"] + 1}
                        ],
                    },
                )
            )
            assert data["credits"][0]["applied_value"] == target["max_annual"]
            assert data["credits"][0]["source"] == "override_clamped"


async def test_catalog_and_scenario_rankings_equal_the_typescript_computation(snapshot):
    raw = _raw_cards()
    best_cpp = {
        card_id: max(
            (o["cpp"] for o in card["points"]["redemption_options"] if o["best"]), default=0.0
        )
        for card_id, card in raw.items()
    }
    async with connect(snapshot) as client:
        for scenario in SCENARIOS:
            ids = scenario["card_ids"]
            if ids is not None and not 1 <= len(ids) <= 25:
                continue
            if ids is None and scenario["pooling"]:
                continue  # catalog mode never pools; that scenario pins the ranking engine only
            for key, row in EXPECTED["scenarios"][scenario["name"]].items():
                args = {"category": key, "limit": 10}
                if ids is not None:
                    args["card_ids"] = ids
                data = structured(await client.call_tool("rank_by_category", args))
                assert [e["card_id"] for e in data["entries"]] == [t[0] for t in row["top"]]
                assert [e["is_fallback"] for e in data["entries"]] == [t[3] for t in row["top"]]
                assert [e["is_pooled"] for e in data["entries"]] == [t[4] for t in row["top"]]
                assert data["total_matching"] == row["real"]
                for entry, top in zip(data["entries"], row["top"]):
                    assert entry["best_cpp"] == best_cpp[entry["card_id"]]
                    assert abs(entry["effective_cents_per_dollar"] - top[1]) < 0.00006


async def test_compare_equals_raw_over_every_card(snapshot):
    raw = _raw_cards()
    ids = sorted(raw)
    async with connect(snapshot) as client:
        for start in range(0, len(ids) - 1, 4):
            chunk = ids[start : start + 4]
            if len(chunk) < 2:
                continue
            data = structured(await client.call_tool("compare_cards", {"card_ids": chunk}))
            assert [c["card_id"] for c in data["cards"]] == chunk
            for entry in data["cards"]:
                card = raw[entry["card_id"]]
                assert entry["annual_fee"] == card["annual_fee"]
                assert entry["value"]["advertised_credit_value"] == sum(
                    c["max_annual"] for c in _active(card)
                )
                fee = card.get("foreign_transaction_fee")
                assert entry["foreign_transaction_fee"]["value"] == fee
                sidecar = _raw_sidecar(entry["card_id"])
                assert entry["lounge_access"] == _expected_lounge_access(card, sidecar)


async def test_find_cards_finds_every_card_and_enumerates_every_issuer(snapshot):
    raw = _raw_cards()
    by_issuer: dict[str, set[str]] = {}
    for card_id, card in raw.items():
        by_issuer.setdefault(card["issuer"], set()).add(card_id)
    async with connect(snapshot) as client:
        for card_id, card in raw.items():
            data = structured(await client.call_tool("find_cards", {"query": card["name"][:64]}))
            assert card_id in {c["card_id"] for c in data["cards"]}, card_id
        for issuer, expected in by_issuer.items():
            seen, offset = set(), 0
            while offset is not None:
                data = structured(
                    await client.call_tool(
                        "find_cards", {"issuer": issuer, "limit": 20, "offset": offset}
                    )
                )
                seen |= {c["card_id"] for c in data["cards"]}
                offset = data["next_offset"]
            assert seen == expected
