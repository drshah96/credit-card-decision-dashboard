from typing import Literal

from pydantic import BaseModel


class Verdict(BaseModel):
    status: Literal["keep", "situational", "reconsider"]
    text: str


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


class TransferPartners(BaseModel):
    airline_count: int
    hotel_count: int
    highlight: str
    recent_changes: str


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
