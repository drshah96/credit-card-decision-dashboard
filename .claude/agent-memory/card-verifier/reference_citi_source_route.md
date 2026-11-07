---
name: citi-source-route
description: Citi renders every rate and fee client-side, so a page fetch succeeds with the numbers blank; what is still confirmable and what is not
metadata:
  type: reference
---

**Citi fetches return HTTP 200 with every Schumer-box number blank.** The
disclosure prose arrives intact and the numerals are empty placeholders, literally
`"% Intro APR for  months on purchases"` and `"the variable APR will be % - %"`.

This is the most dangerous failure mode in the catalog because it does not look
like one. The page loads, the sentences are there, and a careless read produces a
confident wrong answer. Worse, a *summarizing* fetch will invent plausible numbers
into those blanks: one run returned "Foreign Transaction Fee: 2%" and a pre-2010
cash advance fee, both fabricated. **Always demand verbatim quotes from a Citi
page, and never score a blank as a match.**

**But the blanking is not uniform, so do not skip the attempt.** On some cards the
rates table is inlined in the product page's own HTML, inside a modal whose
trigger is `javascript:;`, and a fetch gets it because it is already in the DOM.
That is how `citi-strata-premier` had its annual fee, all four APRs, the penalty
trigger, the balance transfer and cash advance fees, the FX fee and the Flex Plan
fee all confirmed on 2026-09-05, while `citi-simplicity`, `citi-double-cash`,
`citi-diamond-preferred`, `citi-strata` and `citi-secured` got nothing numeric at
all.

So: **fetch the product page and prompt specifically for the APR and fee rows.**
If they come back with digits, they are real. If they come back as `% - %`, report
those fields unverified. Appending a junk query string (`?terms=true`) returns the
same page and dodges the fetch cache when you need a second, narrower prompt.

Two things are blank on every Citi card regardless: **welcome offer numbers**
(they render as "Earn bonus points after spending $ in the first months", and one
page emitted "in the first 920 months", which is the giveaway) and **insurance
limits**. The inline table also carries **no late or returned payment fee row and
no disclosure date**, so a Citi rate cannot be freshness-stamped the way a Chase
`LGC` table can.

**What the prose still confirms**, and these are real matches rather than
assumptions: zero annual fee, whether a penalty APR exists at all, whether late
fees exist, whether the card earns rewards, and the two-tier shape of the balance
transfer fee (an intro tier for a first-N-months window, then a go-to tier, each
with a dollar minimum). On `citi-simplicity` that was 12 qualitative matches
against 13 unverified numerics.

Route: `citi.com/credit-cards/{full-marketing-slug}` with the `#pricing-and-terms`
anchor, plus `citi.com/credit-cards/compare/balance-transfer-credit-cards`, which
is the page that separates the purchase intro period from the balance transfer
one when a card has both.

**Dead ends, each checked on 2026-09-05, not worth retrying:** `/pricing-and-terms`
and `/terms` under the card slug soft-404 to the card list; `citibank.com/cardagreements/`
404s; `citi.com/credit-cards/credit-card-agreements` 404s;
`online.citi.com/US/JRS/pands/detail.do?ID={card}` 404s, the old pricing route is
gone; `citicards.com/.../emailterms.action` 503s;
`online.citi.com/US/ag/products-services/credit-cards/{card}` is an empty shell.

**Untried leads, in order of promise.** The CFPB publishes a quarterly bulk ZIP of
every cardmember agreement, which is a genuine primary source and would settle
Citi outright; its web search is a JS form, so the bulk file is the way in, not a
deep link. Failing that, a browser that renders JavaScript reads these pages fine.

**Cross-card consistency is a usable lead, not a source.** Citi's cash advance
APR is normally uniform across its consumer cards, so a card whose stored value
differs from its siblings is worth re-checking first. On 2026-09-05
`citi-simplicity` stored 29.74% against `citi-diamond-preferred`'s 29.99%. Treat
that as where to look, never as what to write.
