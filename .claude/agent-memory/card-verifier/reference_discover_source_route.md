---
name: discover-source-route
description: Discover no longer publishes its own cardmember agreement; Capital One publishes one agreement for the line and one for Secured, and category pages print each card's rates
metadata:
  type: reference
---

**As of the June 30, 2026 revision, Discover has no card-specific pricing
document.** Neither product page carries a Rates/Fees/Pricing link anymore. The
one remaining route: the product page footer links "Cardmember Agreement",
which now points at `capitalone.com/credit-cards/lp/credit-card-agreements/`.
On that index the entry is named "Discover by Capital One, N.A." and is a
**single generic agreement covering every Discover-branded card**, at
`ecm.capitalone.com/WCM/card/credit-card-agreements-q2-2026/credit-card-agreement-for-discover-by-capital-one-n.a.pdf`.

WebFetch cannot parse it but saves the binary and prints the path; read that
with the Read tool. It settles annual fee, penalty APR (none, no row exists),
foreign transaction fee (none), late and returned payment fees, and proves
every Discover card has no benefit terms of any kind (no insurance section
exists in the document, at all).

**It gives line-wide ranges, not card-specific values.** Purchases and transfers
16.49% to 28.99%, cash advances 28.49% to 28.99%. A card's own product page,
where it still states a narrower range, wins over this document. Do not read
the wide range as confirming a card's stored APR; it only bounds it.

**Two consumer-facing features were renamed and narrowed in the migration.**
"Freeze It" is now "Card Lock", app-only (the old copy said "app or website").
The FICO-score-plus-SSN-alerts bundle is now branded "CreditWise", and
CreditWise is open to non-cardholders, so a claim that only the primary
cardmember can sign up is no longer accurate. Both changes are undated by
Discover; do not invent a date for them.

**The 5% rotating-category quarterly cap has disappeared from Discover's own
product pages.** Current wording is "up to the quarterly maximum". Capital One's
migration FAQ (`capitalone.com/updates/discover/card-faqs/`) gives $1,500 a
quarter, but names only Discover it Cash Back and Discover More. Do not carry it
to the student or secured cards.

**it Miles redemption is narrower than the rest of the line.** Discover's Miles
page lists only cash, travel-statement-credit and PayPal. Capital One says Miles
cardholders can also redeem for gift cards once the account moves, so keep that
as a note rather than a redemption option.

Dead ends: `discover.com/credit-cards/rates-terms/` (404),
`.../resources/cardmember-agreements/` (500), the CFPB per-issuer path (404,
the database is JS-dropdown only), `.../cash-back/calendar.html` (404, no
calendar exists anywhere).

**Updates from 2026-11-07:**
- Per-card rates are printed on category pages under "Rates And Fees Information",
  such as `discover.com/credit-cards/no-annual-fee-credit-cards/`, including Secured.
- The agreement index now has two Discover entries, general and Secured. The
  quarter token in the URL changes each quarter (`q3-2026` at this check).
- `capitalone.com/updates/discover/` pages are the best source for migration and
  redemption changes.
- `discover.com/credit-cards/member-benefits/` is live but legacy copy. It still
  says "Freeze" and limits SSN alerts to primary cardmembers, which contradicts
  every current card page.
- There is no first-late-fee waiver in the current agreements. It appears only in
  legacy Discover Bank agreements.
