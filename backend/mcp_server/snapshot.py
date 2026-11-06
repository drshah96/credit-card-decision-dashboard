"""The immutable catalog every tool call reads, built once at boot. Calls make no queries."""

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from backend.mcp_server import contract
from backend.mcp_server.ranking import (
    CATEGORY_KEYS,
    RankEntry,
    RankInput,
    collation_key,
    rank_category,
)
from backend.mcp_server.schemas import Meta
from backend.models import Card, CardSummary
from backend.refresh.state import VerificationState, facts_digest, load_all
from backend.scripts.seed_catalog import is_staged
from backend.services.cards import get_card_summaries, get_cards

CARDS_DIR = Path(__file__).resolve().parent.parent / "data" / "cards"
_MARKS = re.compile("[®™℠]")


def normalize_search_text(text: str) -> str:
    return _MARKS.sub("", text).casefold()


@dataclass(frozen=True)
class CatalogSnapshot:
    cards: Mapping[str, Card]
    summaries: Mapping[str, CardSummary]
    rank_inputs: Mapping[str, RankInput]
    verification: Mapping[str, VerificationState]
    rankings: Mapping[str, tuple[RankEntry, ...]]
    search_text: Mapping[str, str]
    ids_by_name: tuple[str, ...]
    meta: Meta
    digest: str


def _read_facts_digests(cards_dir: Path = CARDS_DIR) -> dict[str, str]:
    digests = {}
    for path in cards_dir.glob("**/*.json"):
        # Relative, so a parent folder named staging cannot hide the whole catalog.
        if not is_staged(str(path.relative_to(cards_dir))):
            card = json.loads(path.read_text(encoding="utf-8"))
            digests[card["id"]] = facts_digest(card)
    return digests


def _catalog_digest(summaries, cards, verification) -> str:
    payload = {
        "summaries": [s.model_dump(mode="json") for s in summaries],
        "cards": [c.model_dump(mode="json") for c in cards],
        "verification": {k: v.model_dump(mode="json") for k, v in sorted(verification.items())},
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


def build_snapshot() -> CatalogSnapshot:
    summaries = sorted(get_card_summaries(), key=lambda s: s.id)
    cards = sorted(get_cards([s.id for s in summaries]), key=lambda c: c.id)
    ids = [s.id for s in summaries]
    verification = load_all(ids, _read_facts_digests())
    digest = _catalog_digest(summaries, cards, verification)

    inputs = {s.id: RankInput.from_summary(s) for s in summaries}
    ordered_inputs = list(inputs.values())
    return CatalogSnapshot(
        cards={c.id: c for c in cards},
        summaries={s.id: s for s in summaries},
        rank_inputs=inputs,
        verification=verification,
        rankings={key: tuple(rank_category(ordered_inputs, key)) for key in CATEGORY_KEYS},
        search_text={
            c.id: normalize_search_text(f"{c.name} {c.id} {c.issuer} {c.points_program}")
            for c in cards
        },
        ids_by_name=tuple(sorted(ids, key=lambda i: collation_key(inputs[i].name))),
        meta=Meta(
            contract_version=contract.CONTRACT_VERSION,
            catalog_digest=digest,
            catalog_card_count=len(cards),
            market=contract.MARKET,
            currency=contract.CURRENCY,
            methodology_url=contract.METHODOLOGY_URL,
            disclaimer=contract.DISCLAIMER,
        ),
        digest=digest,
    )


def review_due_on(state: VerificationState):
    if state.last_verified_ok_at is None:
        return None
    return state.last_verified_ok_at + timedelta(days=contract.REVIEW_INTERVAL_DAYS)
