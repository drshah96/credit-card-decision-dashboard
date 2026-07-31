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
