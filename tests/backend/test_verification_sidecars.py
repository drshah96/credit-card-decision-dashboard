"""Keeps backend/data/refresh honest. A date in these files is published to third parties."""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.models import Card
from backend.refresh.state import (
    REFRESH_DIR,
    VerificationState,
    degraded,
    facts_digest,
    load_all,
)

CARDS_DIR = Path(__file__).parent.parent.parent / "backend" / "data" / "cards"

# A frozen record of past events, so copying a backfilled date onto another card fails.
BACKFILL: dict[str, tuple[str, frozenset[str]]] = {
    "1de0ac5abec4103d96dcc381078ca3ee1d2c3efe": (
        "2026-09-05",
        frozenset(
            {
                "chase-freedom-flex",
                "chase-freedom-rise",
                "chase-freedom-unlimited",
                "chase-ihg-one-rewards-premier",
                "chase-ihg-one-rewards-traveler",
                "chase-marriott-bonvoy-bold",
                "chase-marriott-bonvoy-boundless",
                "chase-sapphire-preferred",
                "chase-sapphire-reserve",
                "chase-slate-edge",
                "chase-southwest-rapid-rewards-plus",
                "chase-southwest-rapid-rewards-premier",
                "chase-southwest-rapid-rewards-priority",
                "chase-united-club-infinite",
                "chase-united-explorer",
                "chase-united-quest",
                "chase-world-of-hyatt",
            }
        ),
    ),
    "54f0d72c12208c45f24898d3617a26a0296cb024": (
        "2026-09-05",
        frozenset(
            {
                "citi-aadvantage-executive",
                "citi-aadvantage-globe",
                "citi-aadvantage-mileup",
                "citi-aadvantage-platinum-select",
                "citi-diamond-preferred",
                "citi-double-cash",
                "citi-secured",
                "citi-simplicity",
                "citi-strata-elite",
                "citi-strata-premier",
                "citi-strata",
            }
        ),
    ),
    "89bc4442b6227d64c9b9c346e0b988ec2598116c": (
        "2026-09-05",
        frozenset(
            {
                "bofa-bankamericard-secured",
                "bofa-bankamericard",
                "bofa-cash-rewards-secured",
                "bofa-customized-cash-rewards",
                "bofa-premium-rewards-elite",
                "bofa-premium-rewards",
                "bofa-travel-rewards-secured",
                "bofa-travel-rewards",
                "bofa-unlimited-cash-rewards-secured",
                "bofa-unlimited-cash-rewards",
            }
        ),
    ),
    "99058a0186dd0d6c093f2a5f8d48fa51769420c8": (
        "2026-09-05",
        frozenset(
            {
                "amex-blue-cash-everyday",
                "amex-blue-cash-preferred",
                "amex-delta-skymiles-blue",
                "amex-delta-skymiles-gold",
                "amex-delta-skymiles-platinum",
                "amex-delta-skymiles-reserve",
                "amex-gold",
                "amex-green",
                "amex-hilton-honors-aspire",
                "amex-hilton-honors-surpass",
                "amex-hilton-honors",
                "amex-marriott-bonvoy-bevy",
                "amex-marriott-bonvoy-brilliant",
                "amex-platinum",
            }
        ),
    ),
    "cf1ab028b88caa89ff1bf32ca2b0564d170d2ee8": (
        "2026-09-05",
        frozenset(
            {
                "capital-one-platinum-secured",
                "capital-one-platinum",
                "capital-one-quicksilver-one",
                "capital-one-quicksilver-secured",
                "capital-one-quicksilver",
                "capital-one-savor-one",
                "capital-one-savor",
                "capital-one-venture-one",
                "capital-one-venture-x",
                "capital-one-venture",
            }
        ),
    ),
    "367edbe845e12795543058e04cf394f269bc1f23": (
        "2026-09-06",
        frozenset(
            {
                "us-bank-altitude-go",
                "us-bank-cash-plus",
                "us-bank-shield",
                "us-bank-smartly",
                "us-bank-split",
                "wells-fargo-active-cash",
                "wells-fargo-reflect",
            }
        ),
    ),
    "405c511480a05952bfbb77ab6b9ca4d8da2765c7": (
        "2026-09-06",
        frozenset(
            {
                "bilt-blue",
                "bilt-obsidian",
                "bilt-palladium",
                "discover-it-cash-back",
                "discover-it-chrome",
                "discover-it-miles",
                "discover-it-secured",
                "discover-it-student-cash-back",
                "discover-it-student-chrome",
                "us-bank-altitude-connect",
                "us-bank-altitude-go-secured",
                "us-bank-cash-plus-secured",
                "us-bank-secured",
                "wells-fargo-autograph-journey",
                "wells-fargo-autograph",
                "wells-fargo-choice-privileges-select",
                "wells-fargo-choice-privileges",
            }
        ),
    ),
}

ISSUER_PASS_CARDS = frozenset(
    {
        "bofa-unlimited-cash-rewards-secured",
        "capital-one-platinum-secured",
        "capital-one-platinum",
        "chase-freedom-flex",
        "chase-freedom-unlimited",
        "chase-sapphire-reserve",
        "chase-slate-edge",
        "citi-double-cash",
        "citi-secured",
        "citi-strata-premier",
    }
)

REGENERATE = (
    "A card's facts changed after it was verified. Record a new verification in "
    "backend/data/refresh/<id>.json with evidence, today's date and facts_sha256, or set "
    "last_verified_ok_at and verification to null. Never just update the hash."
)


def _cards() -> dict[str, dict]:
    cards = {}
    for path in CARDS_DIR.glob("**/*.json"):
        if "staging" not in path.parts:
            card = json.loads(path.read_text())
            cards[card["id"]] = card
    return cards


def _sidecars() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in REFRESH_DIR.glob("*.json")}


def test_sidecar_stems_equal_card_ids_both_ways():
    assert set(_sidecars()) == set(_cards())


@pytest.mark.parametrize("card_id", sorted(_sidecars()))
def test_every_sidecar_validates_strictly(card_id):
    state = VerificationState.model_validate(_sidecars()[card_id])
    assert state.card_id == card_id


def test_ledger_shape_matches_the_recorded_refresh():
    assert len(BACKFILL) == 7
    assert sum(len(ids) for _, ids in BACKFILL.values()) == 86
    verified = {cid for cid, s in _sidecars().items() if s["verification"]}
    assert len(verified) == 86
    assert len(_sidecars()) - len(verified) == 23


def test_a_backfilled_date_cannot_be_borrowed():
    checked = 0
    for card_id, sidecar in _sidecars().items():
        record = sidecar["verification"]
        if record and record["evidence"].removeprefix("git:") in BACKFILL:
            checked += 1
            when, ids = BACKFILL[record["evidence"].removeprefix("git:")]
            assert card_id in ids, f"{card_id} cites evidence that does not cover it"
            assert sidecar["last_verified_ok_at"] == when
    assert checked == 86, "the ledger must match the sidecars, or this test proves nothing"


def test_a_backfilled_date_is_superseded_only_by_a_later_one():
    """Null is allowed: it is the honest state after a factual edit, per the digest pin."""
    sidecars = _sidecars()
    for sha, (when, ids) in BACKFILL.items():
        for card_id in ids:
            sidecar = sidecars[card_id]
            record = sidecar["verification"]
            if record and record["evidence"] != f"git:{sha}":
                assert sidecar["last_verified_ok_at"] > when, card_id


def test_issuer_pass_labels_match_the_ledger():
    for card_id, sidecar in _sidecars().items():
        record = sidecar["verification"]
        if record and record["evidence"].removeprefix("git:") in BACKFILL:
            expected = "issuer_pass" if card_id in ISSUER_PASS_CARDS else "card"
            assert record["evidence_scope"] == expected, card_id


def test_card_facts_still_match_what_was_verified():
    cards = _cards()
    for card_id, sidecar in _sidecars().items():
        record = sidecar["verification"]
        if record:
            assert record["facts_sha256"] == facts_digest(cards[card_id]), (
                f"{card_id}: {REGENERATE}"
            )


def test_no_date_in_the_future():
    today = datetime.now(timezone.utc).date()
    for sidecar in _sidecars().values():
        when = sidecar["last_verified_ok_at"]
        assert when is None or date.fromisoformat(when) <= today


def test_no_em_dash_in_any_note():
    for sidecar in _sidecars().values():
        if sidecar["verification"]:
            assert "\u2014" not in sidecar["verification"]["note"]


def test_facts_digest_ignores_editorial_fields_only():
    card = _cards()["amex-gold"]
    base = facts_digest(card)

    edited = json.loads(json.dumps(card))
    edited["verdict"]["text"] = "Reworded"
    edited["effective_cost"] = "Reworded"
    edited["credits"][0]["tips"] = ["Reworded"]
    edited["credits"][0]["default_value"] = 1
    assert facts_digest(edited) == base

    for field, value in (("annual_fee", 1), ("variable_apr", "1%"), ("rental_note", "x")):
        changed = json.loads(json.dumps(card))
        changed[field] = value
        assert facts_digest(changed) != base, field

    changed = json.loads(json.dumps(card))
    changed["credits"][0]["max_annual"] += 1
    assert facts_digest(changed) != base


def test_digest_covers_every_card_field_not_excluded():
    excluded = {
        "verdict",
        "effective_cost",
        "accent_color",
        "timeline",
        "official_url",
        "is_affiliate_link",
        "welcome_bonus",
    }
    assert excluded <= set(Card.model_fields)


VALID_RECORD = {
    "evidence": "pr:42",
    "evidence_scope": "card",
    "facts_sha256": "a" * 64,
    "documents": [],
    "not_checked": [],
    "note": "Checked.",
}


@pytest.mark.parametrize(
    "contents",
    [
        b"",
        b'{"card_id": "x-card", "last_verified',
        b"[]",
        b'{"card_id": "x-card"}',
        json.dumps(
            {"card_id": "x-card", "last_verified_ok_at": "2999-01-01", "verification": VALID_RECORD}
        ).encode(),
        json.dumps(
            {"card_id": "x-card", "last_verified_ok_at": "2026-09-05", "verification": None}
        ).encode(),
        json.dumps(
            {"card_id": "other", "last_verified_ok_at": "2026-09-05", "verification": VALID_RECORD}
        ).encode(),
        json.dumps(
            {
                "card_id": "x-card",
                "last_verified_ok_at": "2026-09-05",
                "verification": {**VALID_RECORD, "facts_sha256": "b" * 64},
            }
        ).encode(),
        json.dumps(
            {
                "card_id": "x-card",
                "last_verified_ok_at": "2026-09-05",
                "verification": VALID_RECORD,
                "extra": 1,
            }
        ).encode(),
    ],
)
def test_hostile_files_degrade_to_a_null_date(tmp_path, contents):
    (tmp_path / "x-card.json").write_bytes(contents)
    states = load_all(["x-card"], {"x-card": "a" * 64}, directory=tmp_path)
    assert states["x-card"] == degraded("x-card")
    assert states["x-card"].last_verified_ok_at is None


def test_a_missing_file_degrades_and_a_good_one_loads(tmp_path):
    good = {"card_id": "good", "last_verified_ok_at": "2026-09-05", "verification": VALID_RECORD}
    (tmp_path / "good.json").write_text(json.dumps(good))
    states = load_all(["good", "gone"], {"good": "a" * 64, "gone": "a" * 64}, directory=tmp_path)
    assert states["good"].last_verified_ok_at == date(2026, 9, 5)
    assert states["gone"].last_verified_ok_at is None


@pytest.mark.parametrize(
    "bad",
    [
        {"evidence": "git:abc"},
        {"evidence": "pr:0"},
        {"evidence_scope": "guess"},
        {"not_checked": ["insurance", "insurance"]},
        {"not_checked": ["unknown_section"]},
        {"note": ""},
        {"documents": [{"kind": "product_page", "url": "http://insecure.example"}]},
    ],
)
def test_record_rules(bad):
    with pytest.raises(ValidationError):
        VerificationState.model_validate(
            {
                "card_id": "x-card",
                "last_verified_ok_at": "2026-09-05",
                "verification": {**VALID_RECORD, **bad},
            }
        )
