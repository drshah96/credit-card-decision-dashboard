"""The published identity of the server. Changing the surface needs a new version entry."""

CONTRACT_VERSION = "1.0.0"

# Maps each published version to the SHA-256 of its canonical tools/list surface.
PUBLISHED_SURFACES: dict[str, str] = {
    "1.0.0": "1028bb6352abca51317bbbce28df3191b09515b0a01cc35e2734a8729178e58c",
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
    "after which that check should not be relied on, and not_checked, the areas that check "
    "could not confirm. partially_verified means not_checked is not empty, so values in those "
    "areas are unconfirmed. not_verified means no recorded check. Verdicts and credit tiers are "
    "editorial estimates. A credit default of 0 means no use is assumed, not that the credit "
    "is worthless, so call estimate_value with real usage before weighing credits. Rankings "
    "use the earn multiplier times the card's best realistic cents per point and never consider "
    "affiliate status. The welcome_bonus field is not served. Free text such as services and "
    "credit descriptions may still mention a sign-up offer, which may be out of date, so "
    "confirm any offer with the issuer. Lounge access has no dedicated field: read status_perks "
    "in get_card, where a note may say lounge access is absent or paid per visit, and a card "
    "with no lounge perk listed may still have access. Use find_cards to get card ids."
)
