"""Credit value arithmetic, matching the figures the site's card and compare pages show."""

from collections.abc import Mapping
from dataclasses import dataclass

from backend.models import Card


@dataclass(frozen=True)
class AppliedCredit:
    credit_id: str
    name: str
    tier: str
    max_annual: int
    default_value: int
    applied_value: int
    source: str
    requested_value: int | None


@dataclass(frozen=True)
class ValueTotals:
    applied_credit_value: int
    applied_net: int
    advertised_credit_value: int
    best_case_net: int
    credits_at_zero: int


def _apply(credit, overrides: Mapping[str, int]) -> AppliedCredit:
    requested = overrides.get(credit.id)
    if requested is None:
        applied, source = credit.default_value, "default"
    else:
        applied = min(max(requested, 0), credit.max_annual)
        source = "override" if applied == requested else "override_clamped"
    return AppliedCredit(
        credit_id=credit.id,
        name=credit.name,
        tier=credit.tier,
        max_annual=credit.max_annual,
        default_value=credit.default_value,
        applied_value=applied,
        source=source,
        requested_value=requested,
    )


def credit_values(
    card: Card, overrides: Mapping[str, int] | None = None
) -> tuple[list[AppliedCredit], ValueTotals]:
    """Non-removed credits only. Net is credits minus fee, so positive means credits win."""
    active = [c for c in card.credits if not c.removed]
    applied = [_apply(c, overrides or {}) for c in active]
    used = sum(a.applied_value for a in applied)
    advertised = sum(c.max_annual for c in active)
    return applied, ValueTotals(
        applied_credit_value=used,
        applied_net=used - card.annual_fee,
        advertised_credit_value=advertised,
        best_case_net=advertised - card.annual_fee,
        credits_at_zero=sum(a.applied_value == 0 and a.source == "default" for a in applied),
    )
