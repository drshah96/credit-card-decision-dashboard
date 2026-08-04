"""SQLAlchemy ORM models — mirrors the ERD in docs/erd. One class per table.

Enums use native_enum=False everywhere: stored as VARCHAR + CHECK constraint on
every backend (Postgres and SQLite alike), instead of a Postgres-native ENUM
type. A native enum needs an `ALTER TYPE ... ADD VALUE` migration to grow and
behaves differently on SQLite; VARCHAR + CHECK is the portable, easy-to-alter
choice and is what Alembic autogenerate handles cleanly.
"""

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


def _enum(*values: str, name: str) -> Enum:
    return Enum(*values, name=name, native_enum=False, validate_strings=True)


# ─── Reference / lookup tables ─────────────────────────────────────────────


class Issuer(Base):
    __tablename__ = "issuers"

    issuer_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    slug: Mapped[str] = mapped_column(unique=True)
    logo_url: Mapped[str | None] = mapped_column(default=None)

    cards: Mapped[list["CardModel"]] = relationship(back_populates="issuer")


class Network(Base):
    __tablename__ = "networks"

    network_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)

    cards: Mapped[list["CardModel"]] = relationship(back_populates="network")


class LoyaltyProgram(Base):
    __tablename__ = "loyalty_programs"
    __table_args__ = (
        CheckConstraint(
            "program_type IN ('bank','airline','hotel','other')", name="ck_loyalty_program_type"
        ),
    )

    loyalty_program_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    program_type: Mapped[str] = mapped_column(default="bank")
    is_transferable: Mapped[bool] = mapped_column(default=True)

    cards: Mapped[list["CardModel"]] = relationship(back_populates="points_program")


class BenefitTier(Base):
    __tablename__ = "benefit_tiers"

    tier_id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(unique=True)
    label: Mapped[str]
    description: Mapped[str]
    sort_order: Mapped[int]


class CoverageType(Base):
    __tablename__ = "coverage_types"

    coverage_type_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    category: Mapped[str | None] = mapped_column(default=None)


# ─── Core entity ────────────────────────────────────────────────────────────


class CardModel(Base):
    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint(
            "verdict_status IN ('keep','situational','reconsider')", name="ck_card_verdict_status"
        ),
    )

    card_id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    issuer_id: Mapped[int] = mapped_column(ForeignKey("issuers.issuer_id"), index=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.network_id"), index=True)
    points_program_id: Mapped[int] = mapped_column(
        ForeignKey("loyalty_programs.loyalty_program_id"), index=True
    )
    accent_color: Mapped[str]
    annual_fee_cents: Mapped[int]
    effective_cost_label: Mapped[str]
    official_url: Mapped[str | None] = mapped_column(default=None)
    # See backend/models.py Card.is_affiliate_link for the full explanation.
    is_affiliate_link: Mapped[bool] = mapped_column(default=False)
    verdict_status: Mapped[str]
    verdict_text: Mapped[str]
    verdict_short_tag: Mapped[str | None] = mapped_column(default=None)
    earn_note: Mapped[str | None] = mapped_column(default=None)
    points_per_100k_label: Mapped[str] = mapped_column(default="")
    points_note: Mapped[str | None] = mapped_column(default=None)
    transfer_airline_count: Mapped[int] = mapped_column(default=0)
    transfer_hotel_count: Mapped[int] = mapped_column(default=0)
    transfer_highlight: Mapped[str | None] = mapped_column(default=None)
    transfer_recent_changes: Mapped[str | None] = mapped_column(default=None)
    protection_note: Mapped[str | None] = mapped_column(default=None)
    rental_note: Mapped[str | None] = mapped_column(default=None)
    additional_cards_title: Mapped[str | None] = mapped_column(default=None)
    additional_cards_note: Mapped[str | None] = mapped_column(default=None)
    # Slug of this card's secured counterpart when the two have identical
    # earn rates (set on the unsecured card only — see backend/models.py
    # Card.secured_variant_id for the full explanation). Deliberately a plain
    # string, not a self-referential FK: every other cross-card reference in
    # this schema is likewise unenforced (e.g. nothing FKs into `slug`), and
    # a handful of hand-authored pairs doesn't need referential-integrity
    # machinery. unique=True (nulls excepted, per standard SQL/SQLite/Postgres
    # behavior) guarantees at most one card claims a given secured sibling, so
    # the reverse lookup in services/cards.py can safely use .scalar() instead
    # of handling a hypothetical multi-row match.
    secured_variant_id: Mapped[str | None] = mapped_column(unique=True, default=None)
    # Shared, non-unique identifier for a real-world transferable points pool
    # (see backend/models.py Card.points_pool_id) — deliberately NOT unique,
    # unlike secured_variant_id: every card sharing a pool id is a peer, so
    # multiple rows carrying the same value is the whole point, not a bug.
    points_pool_id: Mapped[str | None] = mapped_column(default=None)
    # True only for the card whose OWN account is what a pooled balance gets
    # redeemed through (e.g. Sapphire Preferred/Reserve, Strata Premier/
    # Elite) — false for a "feeder" card that only reaches full value once
    # pooled with one of these (Freedom Flex/Unlimited, Double Cash, plain
    # Strata). Without this distinction, two feeders sharing a pool id could
    # incorrectly appear to boost each other even with no receiver actually
    # held — real-world transfer-partner access requires an active premium
    # account in the mix, not just any two linked cards.
    points_pool_receiver: Mapped[bool] = mapped_column(default=False)
    # See backend/models.py Card.intro_apr_purchases/intro_apr_balance_transfers/
    # foreign_transaction_fee — flattened here the same way Verdict is
    # (verdict_status/verdict_text/verdict_short_tag above), not a separate
    # table, since each is just a couple of scalar fields. NULL means not
    # yet audited for this card.
    intro_apr_purchases_rate: Mapped[str | None] = mapped_column(default=None)
    intro_apr_purchases_months: Mapped[int | None] = mapped_column(default=None)
    intro_apr_balance_transfers_rate: Mapped[str | None] = mapped_column(default=None)
    intro_apr_balance_transfers_months: Mapped[int | None] = mapped_column(default=None)
    foreign_transaction_fee: Mapped[bool | None] = mapped_column(default=None)
    # Ongoing rates/fees, quoted verbatim from the issuer's own Pricing &
    # Terms table — see backend/models.py Card.variable_apr for why these
    # stay strings rather than decomposed numbers.
    variable_apr: Mapped[str | None] = mapped_column(default=None)
    balance_transfer_apr: Mapped[str | None] = mapped_column(default=None)
    balance_transfer_fee: Mapped[str | None] = mapped_column(default=None)
    foreign_transaction_fee_rate: Mapped[str | None] = mapped_column(default=None)
    # Round-3 rates/fees — see backend/models.py Card.cash_advance_apr and
    # friends for why these stay verbatim strings, and Card.welcome_bonus
    # for why that one's flattened into three columns the same way
    # intro_apr_purchases/Verdict are above.
    cash_advance_apr: Mapped[str | None] = mapped_column(default=None)
    penalty_apr: Mapped[str | None] = mapped_column(default=None)
    penalty_apr_trigger: Mapped[str | None] = mapped_column(default=None)
    pay_over_time_fee: Mapped[str | None] = mapped_column(default=None)
    late_payment_fee: Mapped[str | None] = mapped_column(default=None)
    returned_payment_fee: Mapped[str | None] = mapped_column(default=None)
    returned_check_fee: Mapped[str | None] = mapped_column(default=None)
    welcome_bonus_bonus: Mapped[str | None] = mapped_column(default=None)
    welcome_bonus_requirement: Mapped[str | None] = mapped_column(default=None)
    welcome_bonus_estimated_value: Mapped[str | None] = mapped_column(default=None)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    issuer: Mapped[Issuer] = relationship(back_populates="cards")
    network: Mapped[Network] = relationship(back_populates="cards")
    points_program: Mapped[LoyaltyProgram] = relationship(back_populates="cards")

    earn_rates: Mapped[list["EarnRate"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="EarnRate.sort_order"
    )
    redemption_options: Mapped[list["RedemptionOption"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="RedemptionOption.sort_order"
    )
    credits: Mapped[list["CreditModel"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="CreditModel.sort_order"
    )
    insurance_benefits: Mapped[list["InsuranceBenefit"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="InsuranceBenefit.sort_order"
    )
    status_perks: Mapped[list["StatusPerk"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="StatusPerk.sort_order"
    )
    services: Mapped[list["ServiceModel"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="ServiceModel.sort_order"
    )
    additional_card_options: Mapped[list["AdditionalCardOption"]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="AdditionalCardOption.sort_order",
    )
    timeline_events: Mapped[list["TimelineEvent"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", order_by="TimelineEvent.sort_order"
    )
    transfer_partners: Mapped[list["CardTransferPartner"]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )


# ─── Per-card detail tables ─────────────────────────────────────────────────


class EarnRate(Base):
    __tablename__ = "earn_rates"

    earn_rate_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    emoji: Mapped[str | None] = mapped_column(default=None)
    multiplier_x: Mapped[float]
    multiplier_label: Mapped[str]
    category: Mapped[str]
    is_highlight: Mapped[bool] = mapped_column(default=False)
    is_base: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="earn_rates")


class RedemptionOption(Base):
    __tablename__ = "redemption_options"

    redemption_option_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    method: Mapped[str]
    cents_per_point: Mapped[float]
    is_best: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="redemption_options")


class CreditModel(Base):
    __tablename__ = "credits"
    __table_args__ = (UniqueConstraint("card_id", "slug", name="uq_credit_card_slug"),)

    credit_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str]
    name: Mapped[str]
    subtitle: Mapped[str]
    max_annual_cents: Mapped[int]
    default_value_cents: Mapped[int] = mapped_column(default=0)
    tier_id: Mapped[int] = mapped_column(ForeignKey("benefit_tiers.tier_id"), index=True)
    is_removed: Mapped[bool] = mapped_column(default=False)
    removed_on: Mapped[date | None] = mapped_column(default=None)
    description: Mapped[str]
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="credits")
    tier: Mapped[BenefitTier] = relationship()
    tips: Mapped[list["CreditTip"]] = relationship(
        back_populates="credit", cascade="all, delete-orphan", order_by="CreditTip.sort_order"
    )


class CreditTip(Base):
    __tablename__ = "credit_tips"

    credit_tip_id: Mapped[int] = mapped_column(primary_key=True)
    credit_id: Mapped[int] = mapped_column(
        ForeignKey("credits.credit_id", ondelete="CASCADE"), index=True
    )
    tip_text: Mapped[str]
    is_warning: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int]

    credit: Mapped[CreditModel] = relationship(back_populates="tips")


class InsuranceBenefit(Base):
    __tablename__ = "insurance_benefits"
    __table_args__ = (
        CheckConstraint("level IN ('strong','good','mid','none')", name="ck_insurance_level"),
    )

    insurance_benefit_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    coverage_type_id: Mapped[int] = mapped_column(
        ForeignKey("coverage_types.coverage_type_id"), index=True
    )
    detail: Mapped[str]
    level: Mapped[str]
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="insurance_benefits")
    coverage_type: Mapped[CoverageType] = relationship()


class StatusPerk(Base):
    __tablename__ = "status_perks"
    __table_args__ = (CheckConstraint("strength BETWEEN 1 AND 5", name="ck_status_perk_strength"),)

    status_perk_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    strength: Mapped[int]
    note: Mapped[str]
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="status_perks")


class ServiceModel(Base):
    __tablename__ = "services"

    service_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    detail: Mapped[str]
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="services")


class AdditionalCardOption(Base):
    __tablename__ = "additional_card_options"

    option_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    fee_cents: Mapped[int | None] = mapped_column(default=None)
    fee_label: Mapped[str]
    is_free: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="additional_card_options")
    benefits: Mapped[list["AdditionalCardBenefit"]] = relationship(
        back_populates="option",
        cascade="all, delete-orphan",
        order_by="AdditionalCardBenefit.sort_order",
    )


class AdditionalCardBenefit(Base):
    __tablename__ = "additional_card_benefits"

    benefit_id: Mapped[int] = mapped_column(primary_key=True)
    option_id: Mapped[int] = mapped_column(
        ForeignKey("additional_card_options.option_id", ondelete="CASCADE"), index=True
    )
    benefit_text: Mapped[str]
    is_included: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int]

    option: Mapped[AdditionalCardOption] = relationship(back_populates="benefits")


class TimelineEvent(Base):
    __tablename__ = "timeline_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('add','cut','neutral','future')", name="ck_timeline_event_type"
        ),
    )

    event_id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), index=True
    )
    event_date: Mapped[date | None] = mapped_column(default=None)
    date_label: Mapped[str]
    event_type: Mapped[str]
    badge: Mapped[str]
    description: Mapped[str]
    sort_order: Mapped[int]

    card: Mapped[CardModel] = relationship(back_populates="timeline_events")


# ─── Junction table ─────────────────────────────────────────────────────────


class CardTransferPartner(Base):
    """Named transfer partners (card -> loyalty_programs), with the per-relationship
    airline/hotel type stored here rather than on LoyaltyProgram.program_type:
    a loyalty_program row is shared and deduped by name across the whole catalog,
    so a program that's both a co-brand card's own currency (e.g. Delta SkyMiles,
    always "bank") AND a named transfer partner elsewhere (should be "airline")
    would have an ambiguous, order-dependent program_type if we relied on that
    field instead."""

    __tablename__ = "card_transfer_partners"
    __table_args__ = (
        CheckConstraint("partner_type IN ('airline','hotel')", name="ck_transfer_partner_type"),
    )

    card_id: Mapped[int] = mapped_column(
        ForeignKey("cards.card_id", ondelete="CASCADE"), primary_key=True
    )
    loyalty_program_id: Mapped[int] = mapped_column(
        ForeignKey("loyalty_programs.loyalty_program_id"), primary_key=True
    )
    partner_type: Mapped[str | None] = mapped_column(default=None)
    transfer_ratio: Mapped[str] = mapped_column(default="1:1")
    notes: Mapped[str | None] = mapped_column(default=None)

    card: Mapped[CardModel] = relationship(back_populates="transfer_partners")
    loyalty_program: Mapped[LoyaltyProgram] = relationship()


# ─── Ingestion review queue ─────────────────────────────────────────────────


class CardDraft(Base):
    """A fetched-and-extracted card, pending human review before it's promoted
    into the normalized tables above. Nothing here is queryable by the live API —
    `extracted_json` is the full Card-shape payload (same shape as the old
    per-card JSON files) and stays opaque until a reviewer approves it."""

    __tablename__ = "card_drafts"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_draft_status"),
    )

    draft_id: Mapped[int] = mapped_column(primary_key=True)
    card_slug: Mapped[str]
    source_url: Mapped[str]
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())
    extracted_json: Mapped[str]
    status: Mapped[str] = mapped_column(default="pending")
    reviewer_notes: Mapped[str | None] = mapped_column(default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(default=None)


# ─── Anonymous session/traffic analytics ───────────────────────────────────


class SessionModel(Base):
    """One row per anonymous browser session. `id` is deliberately a
    client-generated string (a nanoid, minted in localStorage on first page
    load), not an autoincrement int like every other PK in this file — it has
    to exist before the first server round-trip, since the frontend stamps it
    on every tracked event itself. No PII: no IP, no user-agent string, just
    a random identifier the client controls."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    # First-touch referrer host only (e.g. "google.com"), not a full URL —
    # enough for traffic-source breakdown without capturing query strings.
    referrer: Mapped[str | None] = mapped_column(default=None)

    page_views: Mapped[list["PageView"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="PageView.occurred_at"
    )


class PageView(Base):
    """One row per tracked issuer-page or card-detail-page view.

    `card_slug`/`issuer` are loose strings, not FKs into cards.card_id /
    issuers.issuer_id — same philosophy as CardModel.secured_variant_id and
    points_pool_id above: this is analytics-shaped data, not a core
    relational entity. An enforced FK would need a slug lookup before every
    insert on the tracking hot path for no real benefit, since cards are
    already addressed by slug everywhere the frontend/API touch them. Later
    aggregate/JOIN queries can still join on cards.slug (already unique),
    just without a formal constraint enforcing it.
    """

    __tablename__ = "page_views"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('issuer_view','card_view')", name="ck_page_view_event_type"
        ),
    )

    page_view_id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    event_type: Mapped[str]
    issuer: Mapped[str | None] = mapped_column(index=True, default=None)
    card_slug: Mapped[str | None] = mapped_column(index=True, default=None)

    session: Mapped[SessionModel] = relationship(back_populates="page_views")
