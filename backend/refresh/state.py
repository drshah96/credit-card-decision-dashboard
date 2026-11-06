"""Strict model and tolerant loader for backend/data/refresh/{card_id}.json.

A date here is a public claim, so anything doubtful degrades to "not verified".
"""

import hashlib
import json
import logging
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

REFRESH_DIR = Path(__file__).resolve().parent.parent / "data" / "refresh"
CARD_ID_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"
EVIDENCE_PATTERN = r"^(git:[0-9a-f]{40}|pr:[1-9][0-9]{0,5})$"

logger = logging.getLogger(__name__)

# Editorial or unserved: changing these does not change what was verified.
_NON_FACTUAL_CARD_FIELDS = frozenset(
    {
        "verdict",
        "effective_cost",
        "accent_color",
        "timeline",
        "official_url",
        "is_affiliate_link",
        "welcome_bonus",
    }
)
_NON_FACTUAL_CREDIT_FIELDS = frozenset({"tips", "default_value", "tier", "subtitle"})


class SectionKey(StrEnum):
    ANNUAL_FEE = "annual_fee"
    RATES_AND_FEES = "rates_and_fees"
    CREDITS = "credits"
    EARN_RATES = "earn_rates"
    REDEMPTION = "redemption"
    TRANSFER_PARTNERS = "transfer_partners"
    INSURANCE = "insurance"
    INSURANCE_LIMITS = "insurance_limits"
    PERKS = "perks"
    ADDITIONAL_CARDS = "additional_cards"


class DocumentKind(StrEnum):
    RATES_AND_FEES = "rates_and_fees"
    CARDMEMBER_AGREEMENT = "cardmember_agreement"
    GUIDE_TO_BENEFITS = "guide_to_benefits"
    APPLICATION_TERMS = "application_terms"
    BENEFIT_POLICY = "benefit_policy"
    PRODUCT_PAGE = "product_page"
    OTHER_ISSUER_DOCUMENT = "other_issuer_document"


class EvidenceScope(StrEnum):
    CARD = "card"
    ISSUER_PASS = "issuer_pass"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class IssuerDocument(_Strict):
    kind: DocumentKind
    url: Annotated[str, Field(pattern=r"^https://\S+$", max_length=2048)]


class VerificationRecord(_Strict):
    evidence: Annotated[str, Field(pattern=EVIDENCE_PATTERN)]
    evidence_scope: EvidenceScope
    facts_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    documents: Annotated[tuple[IssuerDocument, ...], Field(max_length=20)]
    not_checked: tuple[SectionKey, ...]
    note: Annotated[str, Field(min_length=1, max_length=400)]

    @model_validator(mode="after")
    def _not_checked_is_unique(self) -> "VerificationRecord":
        if len(set(self.not_checked)) != len(self.not_checked):
            raise ValueError("not_checked must not repeat a section")
        return self


class VerificationState(_Strict):
    card_id: Annotated[str, Field(pattern=CARD_ID_PATTERN, max_length=64)]
    last_verified_ok_at: date | None
    verification: VerificationRecord | None

    @model_validator(mode="after")
    def _date_and_record_travel_together(self) -> "VerificationState":
        if (self.last_verified_ok_at is None) != (self.verification is None):
            raise ValueError("last_verified_ok_at and verification must both be set or both null")
        return self


def degraded(card_id: str) -> VerificationState:
    """The all-null state, for a missing or doubtful file. No date can come from here."""
    return VerificationState.model_construct(
        card_id=card_id, last_verified_ok_at=None, verification=None
    )


def facts_digest(card_json: Mapping[str, Any]) -> str:
    """SHA-256 of a card file's factual fields, so editorial copy can change freely."""
    facts = {k: v for k, v in card_json.items() if k not in _NON_FACTUAL_CARD_FIELDS}
    facts["credits"] = [
        {k: v for k, v in credit.items() if k not in _NON_FACTUAL_CREDIT_FIELDS}
        for credit in card_json.get("credits", [])
    ]
    canonical = json.dumps(facts, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load_one(
    card_id: str, directory: Path, expected_facts: str | None, today: date
) -> VerificationState:
    state = VerificationState.model_validate_json((directory / f"{card_id}.json").read_bytes())
    if state.card_id != card_id:
        raise ValueError("card_id does not match the file name")
    if state.last_verified_ok_at is not None and state.last_verified_ok_at > today:
        raise ValueError("last_verified_ok_at is in the future")
    if state.verification is not None and state.verification.facts_sha256 != expected_facts:
        raise ValueError("card facts changed after this verification")
    return state


def load_all(
    card_ids: Iterable[str],
    facts_digests: Mapping[str, str],
    directory: Path = REFRESH_DIR,
    today: date | None = None,
) -> dict[str, VerificationState]:
    """One state per card. A bad file degrades that card alone and logs at ERROR."""
    today = today or datetime.now(timezone.utc).date()
    states: dict[str, VerificationState] = {}
    for card_id in card_ids:
        try:
            states[card_id] = _load_one(card_id, directory, facts_digests.get(card_id), today)
        except (OSError, ValueError, ValidationError) as exc:
            logger.error(
                "verification_state_degraded card_id=%s reason=%s", card_id, type(exc).__name__
            )
            states[card_id] = degraded(card_id)
    return states
