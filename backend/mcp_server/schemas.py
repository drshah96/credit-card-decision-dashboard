"""Output models for the five tools. Field names follow backend.models.Card, never the ERD."""

from datetime import date
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")


def _omit_none(value: object) -> bool:
    return value is None


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Meta(_Out):
    contract_version: str
    catalog_digest: Annotated[str, Field(description="Hash of exactly what this server serves.")]
    catalog_card_count: int
    market: str
    currency: str
    methodology_url: str
    disclaimer: str


class Fact(_Out, Generic[T]):
    """A value the catalog may not have. not_recorded never means none or zero."""

    status: Literal["recorded", "not_recorded"]
    value: T | None

    @model_validator(mode="after")
    def _status_matches_value(self) -> "Fact[T]":
        if (self.status == "recorded") != (self.value is not None):
            raise ValueError("recorded must hold exactly when value is not null")
        return self


class IntroAprValue(_Out):
    rate: str
    months: int


VerificationStatus = Annotated[
    Literal["verified", "partially_verified", "not_verified"],
    Field(
        description=(
            "verified: a recorded check with no gaps recorded, which does not prove every field "
            "was confirmed. partially_verified: not_checked lists areas that check could not "
            "confirm. not_verified: no recorded check."
        )
    ),
]


class ProvenanceRef(_Out):
    issuer_url: Annotated[
        str | None,
        Field(description="Where current terms are published. Not proof of what was verified."),
    ]
    verification_status: VerificationStatus
    verified_on: date | None
    not_checked: Annotated[
        list[str], Field(description="Areas the check could not confirm. Treat them as unverified.")
    ]
    review_due_on: Annotated[
        date | None, Field(description="Do not rely on verified_on after this date.")
    ]


class IssuerSource(_Out):
    kind: str
    url: str


class Provenance(ProvenanceRef):
    issuer_sources: Annotated[
        list[IssuerSource],
        Field(description="A product_page is where to check terms, not proof of verification."),
    ]
    note: str | None
    evidence_url: Annotated[
        str | None, Field(description="The public record of the check, a commit or pull request.")
    ]
    evidence_scope: Annotated[
        Literal["card", "issuer_pass"] | None,
        Field(
            description=(
                "issuer_pass: covered by an issuer-level pass, and the evidence may not mention "
                "this card individually."
            )
        ),
    ]
    site_url: str


class ValueTotals(_Out):
    applied_credit_value: Annotated[
        int, Field(description="Sum of each credit's applied value. Not an estimate of worth.")
    ]
    applied_net: Annotated[
        int, Field(description="Applied value minus fee. Positive: credits win.")
    ]
    advertised_credit_value: int
    best_case_net: int
    credits_at_zero: Annotated[
        int,
        Field(
            description=(
                "Credits counted at $0 because no usage was given. A high count means applied "
                "figures understate the card: pass your own usage to estimate_value."
            )
        ),
    ]


InsuranceLevel = Annotated[
    Literal["strong", "good", "mid", "none", "unconfirmed"],
    Field(description="unconfirmed: the catalog cannot say whether the card has this coverage."),
]


class FindCardsQuery(_Out):
    query: str | None
    issuer: str | None
    limit: int
    offset: int


class CardListItem(_Out):
    card_id: str
    name: str
    issuer: str
    network: str
    points_program: str
    annual_fee: int
    verdict_status: str
    is_secured_variant_of: str | None
    provenance: ProvenanceRef


class FindCardsResult(_Out):
    meta: Meta
    query: FindCardsQuery
    total_matches: int
    returned: int
    next_offset: int | None
    cards: list[CardListItem]


class Verdict(_Out):
    status: str
    text: str
    short_tag: str | None


class Editorial(_Out):
    """The Wallet Audit's own estimates and opinions, not issuer terms."""

    verdict: Verdict
    effective_cost: str


class EarnRate(_Out):
    category: str
    multiplier: str
    is_base: bool


class RedemptionOption(_Out):
    method: str
    cpp: float
    best: bool


class PointsInfo(_Out):
    currency: str
    best_cpp: float
    per_100k: str
    note: str
    redemption_options: list[RedemptionOption]


class CreditTip(_Out):
    text: str
    is_warning: bool


class CreditDetail(_Out):
    id: str
    name: str
    subtitle: str
    tier: Annotated[str, Field(description="Editorial estimate of how easy this is to use.")]
    max_annual: Annotated[int, Field(description="The issuer's advertised maximum per year.")]
    default_value: Annotated[
        int,
        Field(description="Starting figure on the site's calculator. 0 means no use is assumed."),
    ]
    description: str
    tips: list[CreditTip] | None = Field(default=None, exclude_if=_omit_none)


class RatesAndFees(_Out):
    variable_apr: Fact[str]
    intro_apr_purchases: Fact[IntroAprValue]
    balance_transfer_apr: Fact[str]
    intro_apr_balance_transfers: Fact[IntroAprValue]
    balance_transfer_fee: Fact[str]
    foreign_transaction_fee: Annotated[
        Fact[bool], Field(description="recorded false is a confirmed no fee.")
    ]
    foreign_transaction_fee_rate: Fact[str]
    cash_advance_apr: Fact[str]
    penalty_apr: Fact[str]
    penalty_apr_trigger: Fact[str]
    pay_over_time_fee: Fact[str]
    late_payment_fee: Fact[str]
    returned_payment_fee: Fact[str]
    returned_check_fee: Fact[str]


class InsuranceDetail(_Out):
    coverage: str
    level: InsuranceLevel
    detail: str


class StatusPerk(_Out):
    name: str
    strength: int
    note: str


class TransferPartnerDetail(_Out):
    name: str
    type: str
    ratio: str
    notes: str | None


class TransferPartnersInfo(_Out):
    airline_count: int
    hotel_count: int
    highlight: str
    recent_changes: str
    partners: list[TransferPartnerDetail] | None = Field(default=None, exclude_if=_omit_none)


class Related(_Out):
    secured_variant_id: str | None
    is_secured_variant_of: str | None
    points_pool_id: str | None
    points_pool_receiver: bool


class TimelineEntry(_Out):
    date: str
    type: str
    badge: str
    text: str


class ServiceEntry(_Out):
    name: str
    detail: str


class AdditionalCardBenefit(_Out):
    text: str
    included: bool


class AdditionalCardOption(_Out):
    name: str
    fee: str
    is_free: bool
    benefits: list[AdditionalCardBenefit]


class AdditionalCardsInfo(_Out):
    title: str
    options: list[AdditionalCardOption]
    note: str


class RemovedCredit(_Out):
    id: str
    name: str
    subtitle: str
    description: str


class CardDetail(_Out):
    id: str
    name: str
    issuer: str
    network: str
    points_program: str
    currency: str
    annual_fee: int
    editorial: Editorial
    earn_rates: list[EarnRate]
    earn_note: str
    points: PointsInfo
    credits: list[CreditDetail]
    value: ValueTotals
    rates_and_fees: RatesAndFees
    insurance: Annotated[
        list[InsuranceDetail],
        Field(description="Empty means no coverage is recorded, not that the card has none."),
    ]
    protection_note: str
    rental_note: str
    has_lounge_access: bool
    status_perks: list[StatusPerk]
    transfer_partners: TransferPartnersInfo
    related: Related
    is_affiliate_link: Annotated[
        bool, Field(description="A disclosure about the issuer link. Rankings never read it.")
    ]
    timeline: list[TimelineEntry] | None = Field(default=None, exclude_if=_omit_none)
    services: list[ServiceEntry] | None = Field(default=None, exclude_if=_omit_none)
    additional_cards: AdditionalCardsInfo | None = Field(default=None, exclude_if=_omit_none)
    removed_credits: list[RemovedCredit] | None = Field(default=None, exclude_if=_omit_none)


class GetCardQuery(_Out):
    card_id: str
    sections: list[str]


class WithheldField(_Out):
    field: str
    reason: str


class GetCardResult(_Out):
    meta: Meta
    query: GetCardQuery
    card: CardDetail
    provenance: Provenance
    omitted_sections: list[str]
    withheld: list[WithheldField]


class CompareQuery(_Out):
    card_ids: list[str]


class InsuranceLevelEntry(_Out):
    coverage: str
    level: InsuranceLevel


class TransferPartnerCounts(_Out):
    airline: int
    hotel: int


class CompareEntry(_Out):
    card_id: str
    name: str
    issuer: str
    annual_fee: int
    currency: str
    verdict_status: str
    short_tag: str | None
    value: ValueTotals
    best_cpp: float
    points_program: str
    earn_rates: list[EarnRate]
    has_lounge_access: bool
    foreign_transaction_fee: Fact[bool]
    intro_apr_purchases: Fact[IntroAprValue]
    intro_apr_balance_transfers: Fact[IntroAprValue]
    insurance: list[InsuranceLevelEntry]
    transfer_partner_counts: TransferPartnerCounts
    provenance: ProvenanceRef


class CompareResult(_Out):
    meta: Meta
    query: CompareQuery
    cards: list[CompareEntry]


class RankQuery(_Out):
    category: str
    card_ids: list[str] | None
    limit: int


class CategoryInfo(_Out):
    key: str
    label: str
    description: str
    group: str


class RankEntry(_Out):
    rank: int
    card_id: str
    name: str
    issuer: str
    annual_fee: int
    multiplier: str
    is_percent_rate: bool
    effective_cents_per_dollar: float
    best_cpp: float
    effective_cpp: float
    is_fallback: Annotated[
        bool, Field(description="A flat rate filling a top-3 slot, not a real category bonus.")
    ]
    is_pooled: bool
    provenance: ProvenanceRef


class RankMethod(_Out):
    formula: str
    tie_break: str
    limitations: str


class RankResult(_Out):
    meta: Meta
    query: RankQuery
    category: CategoryInfo
    mode: Literal["catalog", "wallet"]
    points_pooling_applied: bool
    total_matching: Annotated[int, Field(description="Cards with a real bonus in this category.")]
    returned: int
    hidden_as_secured_twins: list[str]
    entries: list[RankEntry]
    method: RankMethod


class CreditOverrideEcho(_Out):
    credit_id: str
    annual_value: int


class EstimateQuery(_Out):
    card_id: str
    credit_overrides: list[CreditOverrideEcho] | None


class AppliedCreditOut(_Out):
    credit_id: str
    name: str
    tier: str
    max_annual: int
    default_value: int
    applied_value: int
    source: Literal["default", "override", "override_clamped"]
    requested_value: int | None


class EstimateResult(_Out):
    meta: Meta
    query: EstimateQuery
    card_id: str
    name: str
    currency: str
    annual_fee: int
    credits: list[AppliedCreditOut]
    totals: ValueTotals
    counts: str
    excludes: list[str]
    provenance: Provenance
