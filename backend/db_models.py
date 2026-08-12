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
    String,
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
    on every tracked event itself. No PII: no IP, no raw User-Agent string
    (device_type below stores only a derived category, never the header
    itself), just a random identifier the client controls."""

    __tablename__ = "sessions"

    # Convention, not a constraint: an id starting with "test-" is non-real
    # traffic — either an automated test (see tests/backend/test_events_api.py
    # _unique_session_id) or manual/ad-hoc verification (e.g. checking a prod
    # cutover actually wrote rows) — so it can be filtered out of analytics
    # queries with a single `WHERE id NOT LIKE 'test-%'`. Not enforced by a
    # CHECK constraint: real ids come from crypto.randomUUID() on the
    # frontend and will never collide with this prefix, so there's nothing
    # for a constraint to actually guard against.
    id: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    # First-touch referrer host only (e.g. "google.com"), not a full URL —
    # enough for traffic-source breakdown without capturing query strings.
    referrer: Mapped[str | None] = mapped_column(default=None)
    # Two-letter ISO country code, read server-side off Cloudflare's
    # CF-IPCountry request header (see backend/main.py track_event) — never
    # the visitor's IP itself, keeping the "no PII" guarantee above intact.
    # First-touch only, like referrer.
    country: Mapped[str | None] = mapped_column(default=None)
    # Coarse device category ("mobile"/"tablet"/"desktop"), derived
    # server-side from the User-Agent request header via _device_type() in
    # backend/main.py — the raw header itself is never stored, keeping the
    # "no PII" guarantee above intact. User-Agent sniffing is inherently
    # approximate (e.g. modern iPadOS Safari can report as desktop), fine
    # for a rough web vs. mobile vs. tablet usage breakdown, not something
    # meant to identify individual visitors. First-touch only, like referrer
    # and country.
    device_type: Mapped[str | None] = mapped_column(default=None)

    page_views: Mapped[list["PageView"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="PageView.occurred_at"
    )


class PageView(Base):
    """One row per tracked page view or selection action.

    `card_slug`/`issuer` are loose strings, not FKs into cards.card_id /
    issuers.issuer_id — same philosophy as CardModel.secured_variant_id and
    points_pool_id above: this is analytics-shaped data, not a core
    relational entity. An enforced FK would need a slug lookup before every
    insert on the tracking hot path for no real benefit, since cards are
    already addressed by slug everywhere the frontend/API touch them. Later
    aggregate/JOIN queries can still join on cards.slug (already unique),
    just without a formal constraint enforcing it.

    event_type breakdown:
    - issuer_view, card_view: original page views (issuer.name / card_slug
      set respectively).
    - home_view, top_pick_view, compare_view, methodology_view: page views
      for the four routes that previously had no tracking at all. No
      issuer/card_slug — the route itself is the event.
    - top_pick_card_selected, compare_card_selected: a card in the
      "My Cards"/comparison set on the Top Pick or Compare page,
      card_slug set. Multi-card selections (comparing 3 cards at once)
      insert one row per card rather than adding a separate list-shaped
      column — keeps every row atomic and reuses the existing singular
      card_slug field exactly like card_view already does.
    - credit_slider_set, credit_tier_moved, card_tab_viewed,
      issuer_link_clicked: preference signals from the card detail page.
      These are the ones worth having for a future recommendation system:
      dragging a card's Dining credit to its maximum, or promoting its Lyft
      credit out of "Niche", is a visitor telling us directly how they
      spend, which is a far stronger signal than any inferred demographic.
      All four set card_slug, plus detail/value below.

    detail/value are a deliberately generic pair rather than one column per
    event type, since each new signal would otherwise need its own
    migration. Both are nullable and only the four events above populate
    them:
    - credit_slider_set:   detail = credit id ("dining"), value = dollars ("150")
    - credit_tier_moved:   detail = credit id,            value = new tier ("niche")
    - card_tab_viewed:     detail = tab id ("insurance"), value = None
    - issuer_link_clicked: detail = None,                 value = None

    value is text, not an integer, because it carries a dollar amount for
    one event and a tier name for another. Cast at query time; storing two
    mostly-null typed columns to avoid one cast isn't worth it.
    """

    __tablename__ = "page_views"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('issuer_view','card_view','home_view','top_pick_view',"
            "'compare_view','methodology_view','top_pick_card_selected',"
            "'compare_card_selected','credit_slider_set','credit_tier_moved',"
            "'card_tab_viewed','issuer_link_clicked')",
            name="ck_page_view_event_type",
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
    # See the class docstring for what these carry per event type. Indexed
    # because the recommendation queries these exist for group by it, e.g.
    # "average slider value per credit across sessions".
    detail: Mapped[str | None] = mapped_column(index=True, default=None)
    value: Mapped[str | None] = mapped_column(default=None)

    session: Mapped[SessionModel] = relationship(back_populates="page_views")


class ClientError(Base):
    """One row per JavaScript error reported by the frontend — the
    first-party answer to "a crash on a card page is invisible unless the
    visitor emails us" (issue #149). Deliberately a table in our own
    database rather than a third-party service: errors sit next to
    page_views in the same Neon console the analytics already get read
    from, nothing about a visitor leaves our infrastructure, and the same
    no-PII guarantee applies — no IP, no raw User-Agent, only the derived
    device category.

    `session_id` is the same client-minted id the sessions table keys on,
    but stored loose (no FK): an error can fire before the first
    /api/events round-trip has created the session row, and error capture
    must never depend on analytics having succeeded first. Join on
    sessions.id when correlating; expect the occasional orphan.

    Volume is bounded at both ends: the frontend deduplicates repeated
    errors and stops after a handful per page load, and the endpoint sits
    behind the same per-client rate limiter as /api/events. Every string
    is length-capped at the API layer (see ClientErrorIn in models.py)."""

    __tablename__ = "client_errors"

    error_id: Mapped[int] = mapped_column(primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    session_id: Mapped[str | None] = mapped_column(index=True, default=None)
    # The SPA route (pathname only, never query strings — they could carry
    # who-knows-what from inbound links) where the error fired.
    path: Mapped[str | None] = mapped_column(default=None)
    # "TypeError: x is undefined" — name and message folded into one field,
    # which is also the natural GROUP BY for "what's breaking most".
    message: Mapped[str]
    # Minified production stack. Not symbolicated — with the repo checked
    # out, `npm run build` reproduces the same chunk names locally when a
    # trace needs decoding, and message + path + component_stack identifies
    # most issues on a site this size without it.
    stack: Mapped[str | None] = mapped_column(default=None)
    # React component stack from ErrorBoundary.componentDidCatch — names
    # component boundaries, so it stays readable even when `stack` is
    # minified noise.
    component_stack: Mapped[str | None] = mapped_column(default=None)
    # Same derived "mobile"/"tablet"/"desktop" as sessions.device_type,
    # computed by the same helper — a mobile-only crash looks identical to
    # a working page from desktop-only testing, so this is the first filter
    # worth having.
    device_type: Mapped[str | None] = mapped_column(default=None)


class CardFeedback(Base):
    """One row per visitor telling us how a card is actually working out for
    them: a rating, whether they manage to capture the card's value, roughly
    how long they have held it, whether they would keep it, and an optional
    short comment.

    This is the first table on the site that stores something a person wrote
    rather than something they did, and that difference drives most of the
    decisions below.

    `card_slug` is a loose string rather than a FK into cards.card_id, for
    PageView's reason and only that one: the public insert path must not
    depend on a catalog lookup or on catalog state. It is *not* because a FK
    would cascade — this schema never deletes cards, it flips `is_active` —
    and it is not because a slug survives a rename, which is backwards, since
    a FK survives a rename transparently and a stored slug orphans on one.
    The write path validates the slug against the catalog instead, so junk
    slugs never reach the table and cannot split a real card's average.

    `session_id` is loose for a different and better reason: a first-time
    visitor can submit before their first /api/events round-trip has created
    the session row, exactly like ClientError, and sessions cascade-delete,
    so someone's written opinion should not vanish as a side effect of an
    analytics cleanup. Join on sessions.id when correlating; expect orphans.

    Still no PII. Nothing asks who the visitor is, and there is no email,
    name or account. The only free text is `comment`, bounded here as well as
    at the API layer, and nothing is shown to anyone until `review_status`
    says so.
    """

    __tablename__ = "card_feedback"
    __table_args__ = (
        # One opinion per session per card. A double click, a retried fetch or
        # thirty seconds of curl otherwise produce N rows for one view, and
        # per-card averages are the entire point of this table.
        #
        # Two things this is not. NULL session_ids are mutually distinct on
        # both Postgres and SQLite, so this constrains only sessioned
        # submissions. And session_id is client-minted, so this is a duplicate
        # guard, never an abuse control — that job belongs to the rate limiter.
        UniqueConstraint("session_id", "card_slug", name="uq_card_feedback_session_card"),
        CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_card_feedback_rating_range"
        ),
        CheckConstraint(
            "respondent_type IN ('holder','interested')",
            name="ck_card_feedback_respondent_type",
        ),
        # The two branches are mutually exclusive, enforced here rather than
        # trusted from the endpoint. Someone who does not hold the card cannot
        # rate it, say how long they have held it, or say whether they would
        # keep it — and someone who does hold it is answering from experience
        # rather than naming the feature that caught their eye.
        CheckConstraint(
            "respondent_type <> 'holder' OR rating IS NOT NULL",
            name="ck_card_feedback_holder_has_rating",
        ),
        CheckConstraint(
            "respondent_type <> 'interested' OR ("
            "rating IS NULL AND held_for IS NULL AND would_keep IS NULL "
            "AND maximizes_value IS NULL)",
            name="ck_card_feedback_interested_has_no_holder_fields",
        ),
        CheckConstraint(
            "maximizes_value IS NULL OR maximizes_value IN ('yes','partly','no')",
            name="ck_card_feedback_maximizes_value",
        ),
        CheckConstraint(
            "held_for IS NULL OR held_for IN ('under_6m','6_to_12m','1_to_2y','2_to_5y','over_5y')",
            name="ck_card_feedback_held_for",
        ),
        CheckConstraint(
            "review_status IN ('pending','published','rejected')",
            name="ck_card_feedback_review_status",
        ),
        CheckConstraint("length(comment) <= 1000", name="ck_card_feedback_comment_length"),
    )

    feedback_id: Mapped[int] = mapped_column(primary_key=True)
    submitted_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    # Indexed because every question worth asking starts with "for this card":
    # average rating, and what share of holders capture the value.
    card_slug: Mapped[str] = mapped_column(index=True)
    # Which question set this row answers. Defaults to 'holder' because every
    # row that existed before this column did was one.
    respondent_type: Mapped[str] = mapped_column(server_default="holder", default="holder")
    # Required of holders and forbidden of everyone else, per the conditional
    # constraints above. Nullable at the column level because a person who does
    # not hold the card is not withholding a rating, they have nothing to rate.
    rating: Mapped[int | None] = mapped_column(default=None)
    # The question this feature exists to answer: does the holder actually
    # capture what the card advertises? "partly" is a real answer, not a
    # fence-sitter, and is expected to be the common one.
    maximizes_value: Mapped[str | None] = mapped_column(default=None)
    # A bucket, not a month count, because the form asks for a bucket. Storing
    # an int would fabricate precision nobody supplied and would throw away
    # the one thing actually collected, which is which bucket they chose.
    held_for: Mapped[str | None] = mapped_column(default=None)
    would_keep: Mapped[bool | None] = mapped_column(default=None)
    # Bounded here as well as in CardFeedbackIn. The API cap is the first line
    # and this is the last: it is the one field where a bypass costs unbounded
    # storage rather than one bad value.
    comment: Mapped[str | None] = mapped_column(String(1000), default=None)
    session_id: Mapped[str | None] = mapped_column(index=True, default=None)
    # Same derived "mobile"/"tablet"/"desktop" as sessions.device_type.
    device_type: Mapped[str | None] = mapped_column(default=None)
    # Three states, not a published boolean. A boolean collapses "nobody has
    # looked at this yet" with "looked at and rejected", so the moderation
    # queue re-serves every spam row already dismissed, forever. CardDraft
    # solves the same problem one class up with pending/approved/rejected.
    review_status: Mapped[str] = mapped_column(server_default="pending", default="pending")
    reviewed_at: Mapped[datetime | None] = mapped_column(default=None)


# The nine features a card can be liked for. Declared once here and pinned
# against the Pydantic Literal, the TypeScript union and the form's labels by
# tests/backend/test_liked_feature_options.py — the list previously existed in
# five places with nothing comparing them.
LIKED_FEATURES = (
    "earn_rates",
    "insurance",
    "no_annual_fee",
    "credits",
    "intro_apr_purchases",
    "redemption_rate",
    "intro_apr_balance_transfer",
    "transfer_partners",
    "lounge_access",
)


class CardFeedbackFeature(Base):
    """Which feature of a card a respondent picked out.

    Zero to `MAX_FEATURES` rows per submission, one per feature named.

    This table shipped at a cardinality of one, while the question was still
    single-choice, precisely so that widening it later would be cheap. It was:
    going to three picks changed one number in the validator and the form's
    input type, with no migration, no payload change and no edit to this class.
    A column on the parent would have made the same change a rebuild of the
    whole table.

    The cap is three rather than unlimited because with a mean of four options
    offered per card, ticking every one mostly reproduces the availability
    distribution, which is already in the card JSON.

    It also keeps the option enum off `card_feedback`, which carries eight CHECK
    constraints across thirteen columns. Holding the enum there would mean a
    fourteenth column and two more constraints, and every change to the option
    set would then be a full `copy_from` rebuild of all of it; here it is a
    small, legible rebuild of three columns and one CHECK. The option set is the
    part of this feature most likely to change.

    Deliberately absent:

    - `sort_order`. Nothing is ranked. `credits` and `insurance` carry one
      because their array position is meaningful; a set of picks has no order.
    - `card_slug`. It is on the parent. A second copy is a drift surface for
      nothing.
    - A standalone index on `feedback_id`. The composite unique constraint
      leads with it and serves the join on both backends. There is a migration
      in this repo that adds indexes to foreign key columns, so this is the
      kind of omission someone reflexively 'fixes'.

    `ON DELETE CASCADE` is a safety net rather than a mechanism: nothing
    deletes feedback rows, since rejecting sets `review_status`. Note it does
    not fire during SQLite migrations, because alembic/env.py builds its own
    engine and never sees backend/db.py's `PRAGMA foreign_keys=ON` listener, so
    a migration that removes parents must remove children itself.
    """

    __tablename__ = "card_feedback_features"
    __table_args__ = (
        UniqueConstraint("feedback_id", "feature", name="uq_card_feedback_features_row"),
        CheckConstraint(
            "feature IN (" + ",".join(f"'{f}'" for f in LIKED_FEATURES) + ")",
            name="ck_card_feedback_features_feature",
        ),
    )

    feedback_feature_id: Mapped[int] = mapped_column(primary_key=True)
    feedback_id: Mapped[int] = mapped_column(
        ForeignKey("card_feedback.feedback_id", ondelete="CASCADE")
    )
    feature: Mapped[str]
