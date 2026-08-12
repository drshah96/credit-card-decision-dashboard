from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Verdict(BaseModel):
    status: Literal["keep", "situational", "reconsider"]
    text: str
    short_tag: str | None = None


class IntroApr(BaseModel):
    """A promotional intro-APR period, on purchases or balance transfers.
    `rate` is almost always "0%" but kept as a string rather than hardcoded,
    since a small number of real-world promos use a non-zero teaser rate."""

    rate: str
    months: int


class WelcomeBonus(BaseModel):
    """The current sign-up offer, quoted verbatim from the issuer's own
    current terms rather than decomposed into numbers — offers change
    frequently and are structured differently across issuers (points vs.
    cash, single vs. tiered spend thresholds), so `bonus`/`requirement` stay
    free text like `effective_cost`/`variable_apr` elsewhere in this schema.
    `estimated_value` is this card's own best redemption cpp applied to the
    bonus, when the bonus is a points/miles amount — omitted for cash offers,
    where the bonus amount already is the value."""

    bonus: str
    requirement: str
    estimated_value: str | None = None


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
    # Sourced from the issuer's own current terms, not guessed from
    # incidental mentions elsewhere in a card's data — None means this card
    # hasn't been audited yet (distinct from confirmed-absent), during the
    # incremental per-issuer rollout of this data. See the frontend's "0%
    # Intro APR" / "Balance Transfer" Category chips, which read these
    # directly: a promotional balance-transfer offer IS an intro-APR period
    # applied to balance transfers, so there's no separate "has balance
    # transfer" flag that could drift out of sync with this.
    intro_apr_purchases: IntroApr | None = None
    intro_apr_balance_transfers: IntroApr | None = None
    # True = card charges a foreign transaction fee. None = not yet audited.
    foreign_transaction_fee: bool | None = None
    # Derived from status_perks (any perk whose name/note mentions "lounge")
    # rather than stored directly — unlike the three fields above, this one
    # doesn't need per-card research, so there's no "not yet audited" state.
    # Also duplicated on CardSummary below for the same reason as those three.
    has_lounge_access: bool = False
    # The ongoing (post-intro, or from day one if there's no intro offer)
    # rate ranges and fees, quoted verbatim from the issuer's own Pricing &
    # Terms table rather than decomposed into numbers — real ranges are tied
    # to creditworthiness ("19.24%-29.99% Variable") and nothing in this app
    # computes with them, it only displays them, same treatment as
    # effective_cost/multiplier elsewhere in this schema. Detail-only (not on
    # CardSummary) — purely informational, not a Compare-tab filter driver
    # like the intro-offer fields above. None = not yet audited.
    variable_apr: str | None = None
    balance_transfer_apr: str | None = None
    balance_transfer_fee: str | None = None
    # The actual rate when foreign_transaction_fee is True (e.g. "3%") — the
    # boolean above still drives the "No Foreign Transaction Fee" chip
    # unchanged, this is just the detail-page-level specific number.
    foreign_transaction_fee_rate: str | None = None
    # Round-3 rates/fees (see backlog #12) — same treatment as variable_apr
    # above: verbatim strings from the issuer's own Pricing & Terms table,
    # detail-only, None = not yet audited. pay_over_time_fee only applies to
    # issuers that offer a "pay a purchase off over time for a fixed fee
    # instead of interest" feature (Amex's Pay Over Time on charge cards,
    # Chase Pay Over Time on revolving cards) — None for cards with no such
    # feature at all, not just unaudited ones.
    cash_advance_apr: str | None = None
    penalty_apr: str | None = None
    # When the penalty APR kicks in (e.g. "after a payment more than 60 days
    # late") — kept separate from the rate itself since issuers phrase the
    # trigger very differently and it isn't always present even when the
    # rate is.
    penalty_apr_trigger: str | None = None
    pay_over_time_fee: str | None = None
    late_payment_fee: str | None = None
    returned_payment_fee: str | None = None
    returned_check_fee: str | None = None
    # The current sign-up offer — see WelcomeBonus. Detail-only, same as the
    # round-3 fields above; None = not yet audited.
    welcome_bonus: WelcomeBonus | None = None


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
    # See Card.intro_apr_purchases/intro_apr_balance_transfers/
    # foreign_transaction_fee — same meaning, duplicated here so the
    # Compare tab's Category chips (0% Intro APR, Balance Transfer, No
    # Foreign Transaction Fee) can filter the whole catalog from the
    # summary list alone, without fetching full Card detail per card.
    intro_apr_purchases: IntroApr | None = None
    intro_apr_balance_transfers: IntroApr | None = None
    foreign_transaction_fee: bool | None = None
    has_lounge_access: bool = False


# ─── Anonymous session/traffic analytics ───────────────────────────────────


class EventIn(BaseModel):
    """A single tracked page view or selection action, posted by the
    frontend. `session_id` is a client-generated identifier (see
    backend/db_models.py SessionModel for why); `card_id` matches the
    frontend's own naming for a card (its slug, e.g. "citi-strata-premier")
    even though it's stored as `card_slug` on the PageView row, to stay
    unambiguous next to CardModel's own integer `card_id` primary key in
    the DB layer.

    See backend/db_models.py PageView's own docstring for what each
    event_type means and which of issuer/card_id it carries, if any."""

    # Every string here is length-capped. /api/events is public, unauthenticated
    # and writes straight to the database, so an uncapped field is an invitation
    # to fill the table with megabyte rows: a storage and cost problem rather
    # than a data-exposure one, but a real one. detail/value were capped from
    # the start; these four were not, and a 100 KB session_id was demonstrably
    # accepted and stored at full length before this. The limits are generous
    # multiples of the real values (a session id is a 36-char UUID, slugs are
    # tens of characters) so nothing legitimate is ever rejected.
    session_id: str = Field(max_length=64)
    event_type: Literal[
        "issuer_view",
        "card_view",
        "home_view",
        "top_pick_view",
        "compare_view",
        "methodology_view",
        "top_pick_card_selected",
        "compare_card_selected",
        "credit_slider_set",
        "credit_tier_moved",
        "card_tab_viewed",
        "issuer_link_clicked",
    ]
    issuer: str | None = Field(default=None, max_length=64)
    card_id: str | None = Field(default=None, max_length=64)
    # Only the four preference-signal events populate these; see
    # backend/db_models.py PageView for what each carries.
    detail: str | None = Field(default=None, max_length=64)
    value: str | None = Field(default=None, max_length=32)
    # The full referring URL (e.g. "https://www.google.com/search?q=..."),
    # straight from the frontend's own document.referrer — main.py extracts
    # just the host before it reaches record_page_view/SessionModel.referrer.
    # Capped at 2048, the practical URL length ceiling browsers and proxies
    # settle on, since a real referrer can carry a long query string.
    referrer: str | None = Field(default=None, max_length=2048)


class ClientErrorIn(BaseModel):
    """A single JavaScript error reported by the frontend's error reporter
    (frontend/src/utils/errorReporting.ts). Same posture as EventIn above:
    public, unauthenticated, writes a row — so every string is length-capped
    here, before anything touches the database. The generous stack caps are
    still hard ceilings: a minified stack frame line runs ~100-200 chars, so
    4000 keeps the useful top of the trace and discards the tail, which is
    exactly the part that stops being informative anyway.

    `message` is the only required field: an error with no message is not
    worth a row, and everything else degrades gracefully to NULL."""

    message: str = Field(min_length=1, max_length=500)
    session_id: str | None = Field(default=None, max_length=64)
    # pathname only by contract with the reporter — never a full URL, so
    # inbound-link query strings can't smuggle junk (or worse) into the table.
    path: str | None = Field(default=None, max_length=512)
    stack: str | None = Field(default=None, max_length=4000)
    component_stack: str | None = Field(default=None, max_length=4000)


# How many features one submission may name. Three rather than unlimited: with
# a mean of four options offered per card, letting someone tick every one turns
# the answer into "what does this card have", which is already in the card JSON.
# A cap forces a priority call while still letting a premium card's credits,
# lounge and insurance all count.
#
# Both branches share it deliberately. Holders and interested respondents answer
# the same option set so the two distributions can be compared directly, and
# different caps would make them different measurements: a share-of-picks
# comparison would silently weight whichever branch was allowed more.
#
# Mirrored by MAX_FEATURES in frontend/src/api/feedback.ts and pinned against it
# by tests/backend/test_liked_feature_options.py. A frontend that let someone
# pick more than the API accepts would be a 422 at submit time.
MAX_FEATURES = 3


class CardFeedbackIn(BaseModel):
    """One visitor's experience of a card they hold, posted from the card
    detail page. Same posture as EventIn and ClientErrorIn above: public,
    unauthenticated, writes a row, so every field is bounded here before
    anything reaches the database.

    Only `card_id` and `rating` are required. Every other answer is optional
    because each required field costs submissions, and a rating on its own is
    already a usable signal. `card_id` is the frontend's slug
    ("chase-sapphire-reserve"), stored as `card_slug` on the row, matching
    EventIn's naming above.

    `comment` is the one free-text field and the only place a person writes
    prose on this site. 1000 characters is a few paragraphs: long enough for a
    real account of living with a card, short enough that the table cannot be
    filled with megabyte rows. It is stored exactly as typed and escaped at
    render time, never interpolated into HTML here."""

    card_id: str = Field(min_length=1, max_length=64)
    # Which branch of the form this is. Defaults to "holder" so a browser
    # still running the previous bundle during a deploy keeps working: every
    # submission that existed before this field was a holder's.
    respondent_type: Literal["holder", "interested"] = "holder"
    # Required of holders, forbidden of everyone else. See the validator below;
    # the same rule is a CHECK constraint on the table, because this endpoint
    # is public and Pydantic is only the first of the two lines.
    rating: int | None = Field(default=None, ge=1, le=5)
    # The features that caught their eye, or that they rate most highly. Capped
    # at MAX_FEATURES above, and deduped before the cap is applied. Always a
    # list, never a scalar: it was a list while the question was still
    # single-choice, so widening it to three needed no payload change and no
    # deploy-window break, which is the failure respondent_type's default also
    # exists to avoid.
    features: (
        list[
            Literal[
                "earn_rates",
                "insurance",
                "no_annual_fee",
                "credits",
                "intro_apr_purchases",
                "redemption_rate",
                "intro_apr_balance_transfer",
                "transfer_partners",
                "lounge_access",
                "status_perks",
            ]
        ]
        | None
    ) = None
    maximizes_value: Literal["yes", "partly", "no"] | None = None
    # A bucket, matching the form. An integer month count would invent
    # precision the visitor never gave and discard which bucket they picked.
    held_for: Literal["under_6m", "6_to_12m", "1_to_2y", "2_to_5y", "over_5y"] | None = None
    would_keep: bool | None = None
    comment: str | None = Field(default=None, max_length=1000)
    session_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _branches_are_exclusive(self) -> "CardFeedbackIn":
        """A holder rates the card; someone interested names what drew them to
        it. Neither can answer the other's questions.

        Rejected here rather than quietly dropped, because a submission that
        answers the wrong branch means the client and this model disagree about
        the form, and silently discarding half of it would hide that.
        """
        holder_only = {
            "rating": self.rating,
            "held_for": self.held_for,
            "would_keep": self.would_keep,
            "maximizes_value": self.maximizes_value,
        }
        if self.features:
            # Deduped before the cap is applied, not after. A client sending the
            # same pick twice means the same thing once, and the child table's
            # unique constraint would otherwise turn it into a 500. Pydantic's
            # own max_length would have rejected it before this ran, which is
            # why the cap lives here.
            self.features = list(dict.fromkeys(self.features))
            if len(self.features) > MAX_FEATURES:
                noun = "feature" if MAX_FEATURES == 1 else "features"
                raise ValueError(
                    f"at most {MAX_FEATURES} {noun} may be chosen, got {len(self.features)}"
                )

        if self.respondent_type == "holder":
            if self.rating is None:
                raise ValueError("rating is required when respondent_type is 'holder'")
        else:
            answered = sorted(k for k, v in holder_only.items() if v is not None)
            if answered:
                verb = "applies" if len(answered) == 1 else "apply"
                raise ValueError(
                    f"{', '.join(answered)} {verb} only to holders, "
                    "but respondent_type is 'interested'"
                )
            # Every card offers at least one option under the current gates, so
            # requiring at least one costs no real submission. Holders may skip
            # it: they are answering four other questions already.
            if not self.features:
                raise ValueError("features is required when respondent_type is 'interested'")
        return self
