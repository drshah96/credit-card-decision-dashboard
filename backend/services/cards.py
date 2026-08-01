from sqlalchemy.orm import Session, joinedload, selectinload

from backend.db import session_scope
from backend.db_models import AdditionalCardOption as DbAdditionalCardOption
from backend.db_models import CardModel, CardTransferPartner, CreditModel, InsuranceBenefit
from backend.models import (
    AdditionalCardBenefit,
    AdditionalCardOption,
    AdditionalCards,
    Card,
    CardSummary,
    Credit,
    EarnCategorySummary,
    EarnRate,
    Insurance,
    Points,
    RedemptionOption,
    Service,
    StatusPerk,
    TimelineEvent,
    TransferPartner,
    TransferPartners,
    Verdict,
)

# Full detail load — every relationship the Card response needs, in as few
# round trips as possible. selectinload for one-to-many (separate IN query per
# collection, no row-multiplication), joinedload for the many-to-one lookups
# (single extra join, always present). Chained loader options take the target
# class's attribute, not a string, so a rename shows up as a type error here
# instead of a silent runtime miss.
_DETAIL_OPTIONS = (
    joinedload(CardModel.issuer),
    joinedload(CardModel.network),
    joinedload(CardModel.points_program),
    selectinload(CardModel.earn_rates),
    selectinload(CardModel.redemption_options),
    selectinload(CardModel.credits).selectinload(CreditModel.tier),
    selectinload(CardModel.credits).selectinload(CreditModel.tips),
    selectinload(CardModel.insurance_benefits).joinedload(InsuranceBenefit.coverage_type),
    selectinload(CardModel.status_perks),
    selectinload(CardModel.services),
    selectinload(CardModel.additional_card_options).selectinload(DbAdditionalCardOption.benefits),
    selectinload(CardModel.timeline_events),
    selectinload(CardModel.transfer_partners).joinedload(CardTransferPartner.loyalty_program),
)

# Summary load — only what CardSummary actually needs: the scalar card fields,
# the three lookup names, credits (to total up easy/max credit values),
# earn_rates (category labels only, for spend-category filter chips), and
# redemption_options (cents-per-point only, for best_cpp). Deliberately skips
# insurance/timeline/etc. so GET /api/cards doesn't drag in relationships it
# never reads.
_SUMMARY_OPTIONS = (
    joinedload(CardModel.issuer),
    joinedload(CardModel.network),
    joinedload(CardModel.points_program),
    selectinload(CardModel.credits).selectinload(CreditModel.tier),
    selectinload(CardModel.earn_rates),
    selectinload(CardModel.redemption_options),
)


def _to_card(c: CardModel, is_secured_variant_of: str | None = None) -> Card:
    return Card(
        id=c.slug,
        name=c.name,
        issuer=c.issuer.name,
        network=c.network.name,
        points_program=c.points_program.name,
        accent_color=c.accent_color,
        annual_fee=c.annual_fee_cents // 100,
        effective_cost=c.effective_cost_label,
        official_url=c.official_url,
        verdict=Verdict(
            status=c.verdict_status, text=c.verdict_text, short_tag=c.verdict_short_tag
        ),
        earn_rates=[
            EarnRate(
                emoji=r.emoji or "",
                multiplier=r.multiplier_label,
                category=r.category,
                highlight=r.is_highlight,
                is_base=r.is_base,
            )
            for r in c.earn_rates
        ],
        earn_note=c.earn_note or "",
        points=Points(
            currency=c.points_program.name,
            redemption_options=[
                RedemptionOption(method=o.method, cpp=o.cents_per_point, best=o.is_best)
                for o in c.redemption_options
            ],
            per_100k=c.points_per_100k_label,
            note=c.points_note or "",
        ),
        transfer_partners=TransferPartners(
            airline_count=c.transfer_airline_count,
            hotel_count=c.transfer_hotel_count,
            highlight=c.transfer_highlight or "",
            recent_changes=c.transfer_recent_changes or "",
            partners=[
                TransferPartner(
                    name=p.loyalty_program.name,
                    type=p.partner_type,
                    ratio=p.transfer_ratio,
                    notes=p.notes,
                )
                for p in c.transfer_partners
            ],
        ),
        credits=[
            Credit(
                id=cr.slug,
                name=cr.name,
                subtitle=cr.subtitle,
                max_annual=cr.max_annual_cents // 100,
                default_value=cr.default_value_cents // 100,
                tier=cr.tier.code,
                removed=cr.is_removed,
                description=cr.description,
                tips=[t.tip_text if not t.is_warning else f"warn::{t.tip_text}" for t in cr.tips],
            )
            for cr in c.credits
        ],
        insurance=[
            Insurance(coverage=i.coverage_type.name, detail=i.detail, level=i.level)
            for i in c.insurance_benefits
        ],
        protection_note=c.protection_note or "",
        rental_note=c.rental_note or "",
        status_perks=[
            StatusPerk(name=p.name, strength=p.strength, note=p.note) for p in c.status_perks
        ],
        services=[Service(name=s.name, detail=s.detail) for s in c.services],
        additional_cards=AdditionalCards(
            title=c.additional_cards_title or "",
            options=[
                AdditionalCardOption(
                    name=o.name,
                    fee=o.fee_label,
                    is_free=o.is_free,
                    benefits=[
                        AdditionalCardBenefit(text=b.benefit_text, included=b.is_included)
                        for b in o.benefits
                    ],
                )
                for o in c.additional_card_options
            ],
            note=c.additional_cards_note or "",
        ),
        timeline=[
            TimelineEvent(date=e.date_label, type=e.event_type, badge=e.badge, text=e.description)
            for e in c.timeline_events
        ],
        secured_variant_id=c.secured_variant_id,
        is_secured_variant_of=is_secured_variant_of,
        points_pool_id=c.points_pool_id,
        points_pool_receiver=c.points_pool_receiver,
    )


def _to_card_summary(c: CardModel, is_secured_variant_of: str | None = None) -> CardSummary:
    active_credits = [cr for cr in c.credits if not cr.is_removed]
    easy_total = sum(
        cr.default_value_cents // 100 for cr in active_credits if cr.tier.code == "easy"
    )
    max_total = sum(cr.max_annual_cents // 100 for cr in active_credits)
    return CardSummary(
        id=c.slug,
        name=c.name,
        issuer=c.issuer.name,
        network=c.network.name,
        points_program=c.points_program.name,
        accent_color=c.accent_color,
        annual_fee=c.annual_fee_cents // 100,
        effective_cost=c.effective_cost_label,
        verdict=Verdict(
            status=c.verdict_status, text=c.verdict_text, short_tag=c.verdict_short_tag
        ),
        total_easy_credits=easy_total,
        total_max_credits=max_total,
        categories=[
            EarnCategorySummary(
                category=r.category, multiplier=r.multiplier_label, is_base=r.is_base
            )
            for r in c.earn_rates
        ],
        best_cpp=max((o.cents_per_point for o in c.redemption_options), default=0.0),
        secured_variant_id=c.secured_variant_id,
        is_secured_variant_of=is_secured_variant_of,
        points_pool_id=c.points_pool_id,
        points_pool_receiver=c.points_pool_receiver,
    )


def _query(session: Session, *options):
    return (
        session.query(CardModel)
        .filter(CardModel.is_active.is_(True))
        .options(*options)
        .order_by(CardModel.card_id)
    )


def get_card(card_id: str) -> Card | None:
    with session_scope() as session:
        card = (
            session.query(CardModel)
            .filter(CardModel.slug == card_id, CardModel.is_active.is_(True))
            .options(*_DETAIL_OPTIONS)
            .one_or_none()
        )
        if not card:
            return None
        # Reverse lookup: is this card itself hidden in favor of it, i.e. is
        # some other card's secured_variant_id pointing at this one? Only
        # ever matches for a secured card, never stored on its own row.
        primary = (
            session.query(CardModel.slug)
            .filter(CardModel.secured_variant_id == card_id, CardModel.is_active.is_(True))
            .scalar()
        )
        return _to_card(card, is_secured_variant_of=primary)


def get_card_summaries() -> list[CardSummary]:
    with session_scope() as session:
        cards = _query(session, *_SUMMARY_OPTIONS).all()
        # Same reverse lookup as get_card, but computed once for the whole
        # catalog instead of a per-card query, since this path already loads
        # every card in one pass.
        reverse = {c.secured_variant_id: c.slug for c in cards if c.secured_variant_id}
        return [_to_card_summary(c, is_secured_variant_of=reverse.get(c.slug)) for c in cards]
