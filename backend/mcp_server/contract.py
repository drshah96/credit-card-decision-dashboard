"""The published identity of the server. Changing the surface needs a new version entry."""

CONTRACT_VERSION = "1.2.0"

# Maps each published version to the SHA-256 of its canonical tools/list surface.
PUBLISHED_SURFACES: dict[str, str] = {
    "1.0.0": "398e7c443579925550100c028c6bfc6bb1aae4f889e1a2f508b53f007eec8ff0",
    # Adds review_overdue. Rankings skip rates most purchases don't earn, and review_due_on
    # stops at a card's first end or change date (ADR 0003 A27).
    "1.1.0": "0635081d4250116db0624f4c9419f6907e38f160a9bdf7ff67984a2041ab3aa5",
    # Adds the phone-internet category, narrows utilities and home-improvement, and keeps
    # store-only, closed-card and rotating rates out of whole-catalog rankings (ADR 0003 A28).
    "1.2.0": "1bcb14b408b1d64313c85ef04316d59633fdeb5d70197cab17c85e38b0c4ed5e",
}

SERVER_NAME = "thewalletaudit"
SERVER_TITLE = "The Wallet Audit"
SITE_URL = "https://thewalletaudit.com"
METHODOLOGY_URL = f"{SITE_URL}/methodology"
REPO_URL = "https://github.com/drshah96/credit-card-decision-dashboard"
MARKET = "US"
CURRENCY = "USD"
REVIEW_INTERVAL_DAYS = 180

DISCLAIMER = (
    "Informational data, not financial advice. Confirm current terms with the issuer before "
    "applying."
)

INSTRUCTIONS = (
    "Data on US consumer credit cards, hand-sourced from issuer terms by The Wallet Audit. "
    "Money is whole US dollars. A field with status not_recorded has no value in the catalog: "
    "that does not mean the card lacks the feature. An insurance level of unconfirmed means "
    "the same, and so does an empty insurance list. Every card carries provenance: the issuer "
    "page, the date the card was last checked against issuer documents, a review_due_on date "
    "after which that check should not be relied on, review_overdue once that date has passed, "
    "and not_checked, the areas that check "
    "could not confirm. partially_verified means not_checked is not empty, so values in those "
    "areas are unconfirmed. not_verified means no recorded check. Verdicts and credit tiers are "
    "editorial estimates. A credit default of 0 means no use is assumed, not that the credit "
    "is worthless, so call estimate_value with real usage before weighing credits. Rankings "
    "use the earn multiplier times the card's best realistic cents per point and never consider "
    "affiliate status. The welcome_bonus field is not served. A lounge_access of unconfirmed "
    "means the catalog cannot say whether the card has access. Use find_cards to get card ids."
)
