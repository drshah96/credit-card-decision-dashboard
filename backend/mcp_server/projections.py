"""Turns stored cards into the published shapes. This is where honesty rules live."""

import re

from backend.mcp_server import contract, schemas
from backend.mcp_server.snapshot import review_due_on
from backend.mcp_server.values import ValueTotals, credit_values
from backend.models import Card
from backend.refresh.state import SectionKey, VerificationState

# These details say the card's documents are silent, not that the coverage is absent.
_SILENT_DETAIL = re.compile(
    r"^not (publicly documented|published|confirmed|listed|advertised|disclosed)\b", re.IGNORECASE
)

RATE_FIELDS = (
    "variable_apr",
    "balance_transfer_apr",
    "balance_transfer_fee",
    "foreign_transaction_fee_rate",
    "cash_advance_apr",
    "penalty_apr",
    "penalty_apr_trigger",
    "pay_over_time_fee",
    "late_payment_fee",
    "returned_payment_fee",
    "returned_check_fee",
)
WITHHELD_REASON = (
    "Sign-up offers change faster than this catalog is re-verified, so this field is not served. "
    "Free text such as services may still mention an offer, which may be out of date: confirm it "
    "with the issuer."
)
SECTIONS = (
    "credit_tips",
    "timeline",
    "transfer_partner_list",
    "services",
    "additional_cards",
    "removed_credits",
)
_WARNING_PREFIX = "warn::"


def fact(value):
    return schemas.Fact(status="not_recorded" if value is None else "recorded", value=value)


def _intro(value):
    return fact(
        None if value is None else schemas.IntroAprValue(rate=value.rate, months=value.months)
    )


def verification_status(state: VerificationState) -> str:
    if state.verification is None:
        return "not_verified"
    return "partially_verified" if state.verification.not_checked else "verified"


def _not_checked(state: VerificationState) -> list[str]:
    return [s.value for s in state.verification.not_checked] if state.verification else []


def provenance_ref(card: Card, state: VerificationState) -> schemas.ProvenanceRef:
    return schemas.ProvenanceRef(
        issuer_url=card.official_url,
        verification_status=verification_status(state),
        verified_on=state.last_verified_ok_at,
        not_checked=_not_checked(state),
        review_due_on=review_due_on(state),
    )


def _evidence_url(evidence: str) -> str:
    kind, _, ref = evidence.partition(":")
    return f"{contract.REPO_URL}/{'commit' if kind == 'git' else 'pull'}/{ref}"


def full_provenance(card: Card, state: VerificationState) -> schemas.Provenance:
    record = state.verification
    sources = []
    if card.official_url:
        sources.append(schemas.IssuerSource(kind="product_page", url=card.official_url))
    if record:
        sources += [schemas.IssuerSource(kind=d.kind.value, url=d.url) for d in record.documents]
    return schemas.Provenance(
        **provenance_ref(card, state).model_dump(),
        issuer_sources=sources,
        note=record.note if record else None,
        evidence_url=_evidence_url(record.evidence) if record else None,
        evidence_scope=record.evidence_scope.value if record else None,
        site_url=f"{contract.SITE_URL}/cards/{card.id}",
    )


def served_insurance_level(level: str, detail: str, state: VerificationState) -> str:
    """A stored none is served as none only when both its wording and the check back it."""
    if level != "none":
        return level
    record = state.verification
    checked = record is not None and SectionKey.INSURANCE not in record.not_checked
    return "none" if checked and not _SILENT_DETAIL.match(detail.strip()) else "unconfirmed"


def served_lounge_access(level: str | None, state: VerificationState) -> str:
    """A stored none is served as none only when a check covered perks."""
    if level is None:
        return "unconfirmed"
    if level != "none":
        return level
    record = state.verification
    return (
        "none"
        if record is not None and SectionKey.PERKS not in record.not_checked
        else "unconfirmed"
    )


def totals_out(totals: ValueTotals) -> schemas.ValueTotals:
    return schemas.ValueTotals(
        applied_credit_value=totals.applied_credit_value,
        applied_net=totals.applied_net,
        advertised_credit_value=totals.advertised_credit_value,
        best_case_net=totals.best_case_net,
        credits_at_zero=totals.credits_at_zero,
    )


def _tip(raw: str) -> schemas.CreditTip:
    is_warning = raw.startswith(_WARNING_PREFIX)
    return schemas.CreditTip(
        text=raw.removeprefix(_WARNING_PREFIX) if is_warning else raw, is_warning=is_warning
    )


def card_detail(
    card: Card, best_cpp: float, state: VerificationState, sections: set[str]
) -> schemas.CardDetail:
    _, totals = credit_values(card)
    rates = {name: fact(getattr(card, name)) for name in RATE_FIELDS}
    return schemas.CardDetail(
        id=card.id,
        name=card.name,
        issuer=card.issuer,
        network=card.network,
        points_program=card.points_program,
        currency=contract.CURRENCY,
        annual_fee=card.annual_fee,
        editorial=schemas.Editorial(
            verdict=schemas.Verdict(
                status=card.verdict.status,
                text=card.verdict.text,
                short_tag=card.verdict.short_tag,
            ),
            effective_cost=card.effective_cost,
        ),
        earn_rates=[earn_rate(r) for r in card.earn_rates],
        earn_note=card.earn_note,
        points=schemas.PointsInfo(
            currency=card.points.currency,
            best_cpp=best_cpp,
            per_100k=card.points.per_100k,
            note=card.points.note,
            redemption_options=[
                schemas.RedemptionOption(method=o.method, cpp=o.cpp, best=o.best)
                for o in card.points.redemption_options
            ],
        ),
        credits=[
            schemas.CreditDetail(
                id=c.id,
                name=c.name,
                subtitle=c.subtitle,
                tier=c.tier,
                max_annual=c.max_annual,
                default_value=c.default_value,
                description=c.description,
                tips=[_tip(t) for t in c.tips] if "credit_tips" in sections else None,
            )
            for c in card.credits
            if not c.removed
        ],
        value=totals_out(totals),
        rates_and_fees=schemas.RatesAndFees(
            **rates,
            intro_apr_purchases=_intro(card.intro_apr_purchases),
            intro_apr_balance_transfers=_intro(card.intro_apr_balance_transfers),
            foreign_transaction_fee=fact(card.foreign_transaction_fee),
        ),
        insurance=[
            schemas.InsuranceDetail(
                coverage=i.coverage,
                level=served_insurance_level(i.level, i.detail, state),
                detail=i.detail,
            )
            for i in card.insurance
        ],
        protection_note=card.protection_note,
        rental_note=card.rental_note,
        lounge_access=served_lounge_access(card.lounge_access, state),
        status_perks=[
            schemas.StatusPerk(name=p.name, strength=p.strength, note=p.note)
            for p in card.status_perks
        ],
        transfer_partners=schemas.TransferPartnersInfo(
            airline_count=card.transfer_partners.airline_count,
            hotel_count=card.transfer_partners.hotel_count,
            highlight=card.transfer_partners.highlight,
            recent_changes=card.transfer_partners.recent_changes,
            partners=[
                schemas.TransferPartnerDetail(
                    name=p.name, type=p.type, ratio=p.ratio, notes=p.notes
                )
                for p in card.transfer_partners.partners
            ]
            if "transfer_partner_list" in sections
            else None,
        ),
        related=schemas.Related(
            secured_variant_id=card.secured_variant_id,
            is_secured_variant_of=card.is_secured_variant_of,
            points_pool_id=card.points_pool_id,
            points_pool_receiver=card.points_pool_receiver,
        ),
        is_affiliate_link=card.is_affiliate_link,
        timeline=[
            schemas.TimelineEntry(date=e.date, type=e.type, badge=e.badge, text=e.text)
            for e in card.timeline
        ]
        if "timeline" in sections
        else None,
        services=[schemas.ServiceEntry(name=s.name, detail=s.detail) for s in card.services]
        if "services" in sections
        else None,
        additional_cards=schemas.AdditionalCardsInfo(
            title=card.additional_cards.title,
            options=[
                schemas.AdditionalCardOption(
                    name=o.name,
                    fee=o.fee,
                    is_free=o.is_free,
                    benefits=[
                        schemas.AdditionalCardBenefit(text=b.text, included=b.included)
                        for b in o.benefits
                    ],
                )
                for o in card.additional_cards.options
            ],
            note=card.additional_cards.note,
        )
        if "additional_cards" in sections
        else None,
        removed_credits=[
            schemas.RemovedCredit(
                id=c.id, name=c.name, subtitle=c.subtitle, description=c.description
            )
            for c in card.credits
            if c.removed
        ]
        if "removed_credits" in sections
        else None,
    )


def earn_rate(rate) -> schemas.EarnRate:
    return schemas.EarnRate(
        category=rate.category, multiplier=rate.multiplier, is_base=rate.is_base
    )


def compare_entry(
    card: Card, best_cpp: float, verdict_tag: str | None, state: VerificationState
) -> schemas.CompareEntry:
    _, totals = credit_values(card)
    return schemas.CompareEntry(
        card_id=card.id,
        name=card.name,
        issuer=card.issuer,
        annual_fee=card.annual_fee,
        currency=contract.CURRENCY,
        verdict_status=card.verdict.status,
        short_tag=verdict_tag,
        value=totals_out(totals),
        best_cpp=best_cpp,
        points_program=card.points_program,
        earn_rates=[earn_rate(r) for r in card.earn_rates],
        lounge_access=served_lounge_access(card.lounge_access, state),
        foreign_transaction_fee=fact(card.foreign_transaction_fee),
        intro_apr_purchases=_intro(card.intro_apr_purchases),
        intro_apr_balance_transfers=_intro(card.intro_apr_balance_transfers),
        insurance=[
            schemas.InsuranceLevelEntry(
                coverage=i.coverage, level=served_insurance_level(i.level, i.detail, state)
            )
            for i in card.insurance
        ],
        transfer_partner_counts=schemas.TransferPartnerCounts(
            airline=card.transfer_partners.airline_count, hotel=card.transfer_partners.hotel_count
        ),
        provenance=provenance_ref(card, state),
    )
