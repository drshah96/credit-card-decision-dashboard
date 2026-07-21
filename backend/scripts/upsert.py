"""Shared upsert logic: a Card-shape dict -> normalized rows across all tables.

Used by both the draft-promotion CLI (drafts.py) and any future direct
re-sync. Lookup rows (issuers, networks, loyalty programs, coverage types)
are get-or-created by name so re-running this never creates duplicates —
"American Express" resolves to the same issuer row every time, even across
unrelated cards.

Child collections (credits, earn_rates, timeline, ...) are fully replaced on
each upsert rather than diffed field-by-field: the source of truth is always
"what does the latest approved draft say", and delete-and-reinsert keeps
sort_order trivially correct instead of hand-reconciling list positions.
"""

import re
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db_models import (
    AdditionalCardBenefit,
    AdditionalCardOption,
    BenefitTier,
    CardModel,
    CardTransferPartner,
    CoverageType,
    CreditModel,
    CreditTip,
    EarnRate,
    InsuranceBenefit,
    Issuer,
    LoyaltyProgram,
    Network,
    RedemptionOption,
    ServiceModel,
    StatusPerk,
    TimelineEvent,
)

BENEFIT_TIERS = [
    ("easy", "Effortless", "auto or unavoidable", 0),
    ("plan", "Plan a little", "timed — partial use likely", 1),
    ("niche", "Niche", "only if it fits your life", 2),
]

_DATE_FORMATS = ["%b %d, %Y", "%B %d, %Y", "%b %Y", "%B %Y", "%Y"]


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_multiplier(raw: str) -> float:
    match = re.search(r"[\d.]+", raw)
    return float(match.group()) if match else 0.0


def _parse_event_date(raw: str) -> date | None:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _get_or_create(session: Session, model, defaults: dict | None = None, **lookup):
    instance = session.query(model).filter_by(**lookup).one_or_none()
    if instance is not None:
        return instance
    try:
        # A SAVEPOINT, not the outer transaction: if another connection
        # commits the same lookup row between our SELECT above and this
        # INSERT, only this insert attempt rolls back — everything else
        # upsert_card has already flushed in this transaction survives.
        with session.begin_nested():
            instance = model(**lookup, **(defaults or {}))
            session.add(instance)
            session.flush()
    except IntegrityError:
        instance = session.query(model).filter_by(**lookup).one()
    return instance


def ensure_benefit_tiers(session: Session) -> dict[str, BenefitTier]:
    tiers = {}
    for code, label, description, sort_order in BENEFIT_TIERS:
        tiers[code] = _get_or_create(
            session,
            BenefitTier,
            code=code,
            defaults={"label": label, "description": description, "sort_order": sort_order},
        )
    return tiers


def upsert_card(session: Session, data: dict) -> CardModel:
    tiers = ensure_benefit_tiers(session)

    issuer = _get_or_create(
        session, Issuer, name=data["issuer"], defaults={"slug": _slugify(data["issuer"])}
    )
    network = _get_or_create(session, Network, name=data["network"])
    points_program = _get_or_create(
        session,
        LoyaltyProgram,
        name=data["points"]["currency"],
        defaults={
            "program_type": "bank",
            "is_transferable": bool(
                data["transfer_partners"]["airline_count"]
                or data["transfer_partners"]["hotel_count"]
            ),
        },
    )

    card = session.query(CardModel).filter_by(slug=data["id"]).one_or_none()
    if card is None:
        card = CardModel(slug=data["id"])
        session.add(card)
    else:
        # Clear and flush child collections before reassigning them below.
        # Reassigning `card.credits = [...]` directly relies on the delete-orphan
        # cascade to remove the old rows, but SQLAlchemy's unit of work doesn't
        # guarantee those DELETEs are flushed before the new rows' INSERTs in the
        # same flush — so re-promoting an existing card hits the UNIQUE(card_id,
        # slug) constraint against its own not-yet-deleted old rows. Flushing an
        # empty collection first forces the deletes to actually happen first.
        card.earn_rates = []
        card.redemption_options = []
        card.credits = []
        card.insurance_benefits = []
        card.status_perks = []
        card.services = []
        card.additional_card_options = []
        card.timeline_events = []
        card.transfer_partners = []
        session.flush()

    card.name = data["name"]
    card.issuer = issuer
    card.network = network
    card.points_program = points_program
    card.accent_color = data["accent_color"]
    card.annual_fee_cents = round(data["annual_fee"] * 100)
    card.effective_cost_label = data["effective_cost"]
    card.verdict_status = data["verdict"]["status"]
    card.verdict_text = data["verdict"]["text"]
    card.verdict_short_tag = data["verdict"].get("short_tag")
    card.earn_note = data.get("earn_note")
    card.points_per_100k_label = data["points"]["per_100k"]
    card.points_note = data["points"].get("note")
    card.transfer_airline_count = data["transfer_partners"]["airline_count"]
    card.transfer_hotel_count = data["transfer_partners"]["hotel_count"]
    card.transfer_highlight = data["transfer_partners"].get("highlight")
    card.transfer_recent_changes = data["transfer_partners"].get("recent_changes")
    card.protection_note = data.get("protection_note")
    card.rental_note = data.get("rental_note")
    card.additional_cards_title = data.get("additional_cards", {}).get("title")
    card.additional_cards_note = data.get("additional_cards", {}).get("note")
    card.is_active = True

    card.earn_rates = [
        EarnRate(
            emoji=r.get("emoji"),
            multiplier_x=_parse_multiplier(r["multiplier"]),
            category=r["category"],
            is_highlight=r.get("highlight", False),
            is_base=r.get("is_base", False),
            sort_order=i,
        )
        for i, r in enumerate(data["earn_rates"])
    ]

    card.redemption_options = [
        RedemptionOption(
            method=r["method"], cents_per_point=r["cpp"], is_best=r.get("best", False), sort_order=i
        )
        for i, r in enumerate(data["points"]["redemption_options"])
    ]

    card.credits = [
        CreditModel(
            slug=c["id"],
            name=c["name"],
            subtitle=c.get("subtitle", ""),
            max_annual_cents=round(c["max_annual"] * 100),
            default_value_cents=round(c.get("default_value", 0) * 100),
            tier=tiers[c["tier"]],
            is_removed=c.get("removed", False),
            description=c.get("description", ""),
            sort_order=i,
            tips=[
                CreditTip(
                    tip_text=t[6:] if t.startswith("warn::") else t,
                    is_warning=t.startswith("warn::"),
                    sort_order=j,
                )
                for j, t in enumerate(c.get("tips", []))
            ],
        )
        for i, c in enumerate(data["credits"])
    ]

    card.insurance_benefits = [
        InsuranceBenefit(
            coverage_type=_get_or_create(session, CoverageType, name=item["coverage"]),
            detail=item["detail"],
            level=item["level"],
            sort_order=i,
        )
        for i, item in enumerate(data["insurance"])
    ]

    card.status_perks = [
        StatusPerk(name=p["name"], strength=p["strength"], note=p["note"], sort_order=i)
        for i, p in enumerate(data.get("status_perks", []))
    ]

    card.services = [
        ServiceModel(name=s["name"], detail=s["detail"], sort_order=i)
        for i, s in enumerate(data.get("services", []))
    ]

    card.additional_card_options = [
        AdditionalCardOption(
            name=opt["name"],
            fee_label=opt["fee"],
            is_free=opt.get("is_free", False),
            sort_order=i,
            benefits=[
                AdditionalCardBenefit(
                    benefit_text=b["text"], is_included=b.get("included", True), sort_order=j
                )
                for j, b in enumerate(opt.get("benefits", []))
            ],
        )
        for i, opt in enumerate(data.get("additional_cards", {}).get("options", []))
    ]

    card.transfer_partners = [
        CardTransferPartner(
            loyalty_program=_get_or_create(
                session,
                LoyaltyProgram,
                name=p["name"],
                defaults={"program_type": p["type"], "is_transferable": True},
            ),
            transfer_ratio=p["ratio"],
            notes=p.get("notes"),
        )
        for p in data["transfer_partners"].get("partners", [])
    ]

    card.timeline_events = [
        TimelineEvent(
            event_date=_parse_event_date(e["date"]),
            date_label=e["date"],
            event_type=e["type"],
            badge=e["badge"],
            description=e["text"],
            sort_order=i,
        )
        for i, e in enumerate(data.get("timeline", []))
    ]

    session.flush()
    return card
