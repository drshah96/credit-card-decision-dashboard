---
name: us-bank-source-route
description: U.S. Bank's real terms document is hidden in page markup rather than visible copy, and it is unusually rich once found
metadata:
  type: reference
---

**The terms document is not linked in visible product-page copy.** Fetch the
product page and ask it to **list every hyperlink**. The link is in the markup,
labelled "Pricing and Terms", pointing at
`applications.usbank.com/oad/termsSimpleApply.controller`. A prompt asking the
product page for rates directly comes back empty, which makes the page look
silent when it is not.

The `offerId` in that URL is **per-card**, so it is never reusable. Re-derive it
from the product page rather than editing one by hand.

**That document is the richest U.S. Bank source there is** and renders to a plain
fetch with no JavaScript: the full APR table, minimum interest charge, the
ExtendPay fee, and the complete rewards terms including tier thresholds, caps,
category exclusions, redemption rates, expiry, and joint-account and
authorized-user rules. One fetch cannot pull it all. Ask narrow questions across
several fetches against the same URL, or the summariser drops whole sections and
reports them absent.

Its date is an "accurate as of MM/YYYY" string rather than a version id.

**Absence cannot be proven for U.S. Bank.** There is no reachable Guide to
Benefits and no eligible-card list, so an `insurance[]` entry at `level: "none"`
stays unverified rather than confirmed. This is the opposite of Capital One, whose
per-network PDFs do prove absence, and of Amex and Chase, whose per-benefit pages
do. Dead as of 2026-09-05: `credit-card-agreements.html`,
`credit-card-benefits.html`, `visa-signature-benefits.html` and
`{slug}-pricing.html` all 404, and the agreement catalog at
`applications.usbank.com/oad/catalog/cmas.controller` loads but names no
individual card.

**To check whether a card is still open**, `usbank.com/credit-cards.html` lists
every open card with a live Apply now link into `onboarding.usbank.com`.

**Route corrections found 2026-09-05, after the note above was written.** Some
product pages (Split, for one) link `applications.usbank.com/pdap/terms` instead,
which is a JavaScript shell and yields nothing. The `termsSimpleApply.controller`
endpoint still works and accepts those cards' offerIds, so the route survives even
where the on-page link does not: take the offerId from the broken link and rebuild
the working URL.

A Guide to Benefits route **does** now exist at `mycardgtb.com/{slug}`, linked from
some product pages. It is JS-rendered and still returns only a table-of-contents
stub to a plain fetch, so absence remains unprovable for U.S. Bank. Do not treat
the link's existence as coverage confirmed.

**A portfolio-wide authoring error worth knowing:** all the U.S. Bank files stored
`cash_advance_apr` as a range, `29.49%-30.49%`. U.S. Bank prints a **single**
Prime-based rate, 30.49%. Corrected on Smartly, Altitude Go, Cash+ and Shield in
Sep 2026; the two secured twins still carry the range and need their own read.
