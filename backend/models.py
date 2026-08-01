from typing import Literal

from pydantic import BaseModel


class Verdict(BaseModel):
    status: Literal["keep", "situational", "reconsider"]
    text: str
    short_tag: str | None = None


class EarnRate(BaseModel):
    emoji: str
    multiplier: str
    category: str
    highlight: bool
    is_base: bool = False


class RedemptionOption(BaseModel):
    method: str
    cpp: float
    best: bool


class Points(BaseModel):
    currency: str
    redemption_options: list[RedemptionOption]
    per_100k: str
    note: str


class TransferPartner(BaseModel):
    name: str
    type: Literal["airline", "hotel"]
    ratio: str
    notes: str | None = None


class TransferPartners(BaseModel):
    airline_count: int
    hotel_count: int
    highlight: str
    recent_changes: str
    partners: list[TransferPartner] = []


class Credit(BaseModel):
    id: str
    name: str
    subtitle: str
    max_annual: int
    default_value: int
    tier: Literal["easy", "plan", "niche"]
    removed: bool = False
    description: str
    tips: list[str]


class Insurance(BaseModel):
    coverage: str
    detail: str
    level: Literal["strong", "good", "mid", "none"]


class StatusPerk(BaseModel):
    name: str
    strength: int  # 1–5
    note: str


class Service(BaseModel):
    name: str
    detail: str


class AdditionalCardBenefit(BaseModel):
    text: str
    included: bool


class AdditionalCardOption(BaseModel):
    name: str
    fee: str
    is_free: bool
    benefits: list[AdditionalCardBenefit]


class AdditionalCards(BaseModel):
    title: str
    options: list[AdditionalCardOption]
    note: str


class TimelineEvent(BaseModel):
    date: str
    type: Literal["add", "cut", "neutral", "future"]
    badge: str
    text: str


class Card(BaseModel):
    id: str
    name: str
    issuer: str
    network: str
    points_program: str
    accent_color: str
    annual_fee: int
    effective_cost: str
    official_url: str | None = None
    # Whether official_url carries affiliate tracking (commission-earning).
    # False for every card today — the catalog has no affiliate program yet.
    # Drives frontend/src/pages/CardDetailPage.tsx's AffiliateDisclosure,
    # which only renders when this is true, so the disclosure is never shown
    # for a link that isn't actually monetized (and can't go stale/misleading
    # if a card is flagged without the UI catching up, since the two are
    # the same read). Also duplicated on CardSummary below — that's what
    # makes the ranking-integrity regression test in
    # frontend/tests/utils/topPickCategories.test.ts possible: it proves
    # computeTopPicks ignores this field entirely, not just that nothing
    # currently reads it.
    is_affiliate_link: bool = False
    verdict: Verdict
    earn_rates: list[EarnRate]
    earn_note: str
    points: Points
    transfer_partners: TransferPartners
    credits: list[Credit]
    insurance: list[Insurance]
    protection_note: str
    rental_note: str
    status_perks: list[StatusPerk]
    services: list[Service]
    additional_cards: AdditionalCards
    timeline: list[TimelineEvent]
    # Set on an unsecured card whose secured counterpart has identical earn
    # rates (e.g. bofa-customized-cash-rewards -> bofa-cash-rewards-secured) —
    # the secured card is hidden from catalog listings in favor of this one,
    # surfaced instead as a "secured version also available" link.
    secured_variant_id: str | None = None
    # The inverse: set on the secured card itself, computed server-side by
    # reverse-lookup (never stored in that card's own JSON) so its detail
    # page can point back to the primary listing it's hidden in favor of.
    is_secured_variant_of: str | None = None
    # Set on every card that shares a real-world transferable points balance
    # with other cards on the same id (e.g. Chase Freedom Flex/Unlimited pool
    # into a Sapphire Preferred/Reserve account and inherit its redemption
    # value) — unlike secured_variant_id this is symmetric, not primary/
    # secondary: every card sharing an id is a peer, not a hidden duplicate.
    # Only set where a card's own data explicitly documents the pooling
    # relationship (verified against the catalog, not inferred from points
    # program name alone — e.g. Freedom Rise and Amazon Prime Visa are also
    # technically Ultimate Rewards but explicitly can't pool).
    points_pool_id: str | None = None
    # True only for the card whose own account a pooled balance actually
    # redeems through (Sapphire Preferred/Reserve, Strata Premier/Elite) —
    # false for a feeder card that only reaches full value once pooled with
    # one of these. A feeder should never be valued off another feeder in
    # the same pool with no receiver present, since real-world transfer-
    # partner access requires an active premium account in the mix.
    points_pool_receiver: bool = False


class EarnCategorySummary(BaseModel):
    """Just enough of an EarnRate to derive and rank spend-category filter
    chips (Dining, Gas, ...) without the full object's emoji/highlight.
    Keeps is_base — unlike free-text category matching, it's the only
    reliable way to identify a card's flat "everything else" rate (see the
    Top Pick page's Catch-All category)."""

    category: str
    multiplier: str
    is_base: bool = False


class CardSummary(BaseModel):
    """Lightweight card info returned by GET /api/cards."""

    id: str
    name: str
    issuer: str
    network: str
    points_program: str
    accent_color: str
    annual_fee: int
    effective_cost: str
    verdict: Verdict
    total_easy_credits: int
    total_max_credits: int
    # Category + multiplier pairs (not the full EarnRate objects) — enough for
    # the frontend to derive spend-category filter chips AND rank matches by
    # multiplier across the whole catalog, without an N+1 fetch of every
    # card's full detail.
    categories: list[EarnCategorySummary] = []
    # The best (highest) cents-per-point value across this card's redemption
    # options — e.g. 2.0 for a transferable-points card whose best transfer
    # partner redemption is worth 2¢/point, or 1.0 for a flat cash-back card.
    # Lets the Top Pick page rank cards by *effective* earn rate
    # (multiplier × best_cpp) instead of comparing raw multipliers across
    # incompatible currencies (6x Hilton points at 0.5¢ each isn't worth
    # more than 3x Chase points at 2¢ each) — without fetching every card's
    # full detail just to read its redemption_options.
    best_cpp: float = 0.0
    # See Card.secured_variant_id / Card.is_secured_variant_of — same meaning,
    # duplicated here so catalog-listing surfaces (issuer pages, Compare's
    # card picker, Top Pick) can hide a secured card in favor of its unsecured
    # twin from the summary list alone, without fetching full Card detail.
    secured_variant_id: str | None = None
    is_secured_variant_of: str | None = None
    # See Card.points_pool_id — same meaning, duplicated here so the Top
    # Pick page's "My Cards" ranking can compute pool-boosted effective
    # value from the summary list alone, without fetching full Card detail
    # for every selected card.
    points_pool_id: str | None = None
    # See Card.points_pool_receiver — same meaning, duplicated here for the
    # same reason as points_pool_id above.
    points_pool_receiver: bool = False
    # See Card.is_affiliate_link — same meaning, duplicated here so
    # computeTopPicks (which only ever sees CardSummary, never full Card
    # detail) can be proven to ignore monetization status entirely, rather
    # than that guarantee only holding for surfaces that happen to fetch
    # full detail.
    is_affiliate_link: bool = False
