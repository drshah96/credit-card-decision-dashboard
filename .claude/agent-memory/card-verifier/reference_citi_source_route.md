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

**Citi's own filed pricing tables, learned 2026-11-13.** Citi files every card's
agreement and pricing addendum with the CFPB. The issuer listing at
`consumerfinance.gov/credit-cards/agreements/issuer/citibank-na/?page=N` (3 pages)
is plain HTML with direct links under
`files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q{N}{YYYY}/CITIBANK_N.A./`.
Store cards use short names (`HD_Addendum_49_0226`, `TSC_Visa_Card_Addendum_103_0326`,
`XOM_PL_Addendum_33_0126`); co-brands file a `Pricing_and_Information_Table`. The
PDFs are AES-256 encrypted, so WebFetch sees binary and r.jina.ai returns 422, but
`pdftotext -layout` decrypts them locally (empty user password). This agent has no
shell, so name the files and let the caller read them. Some cards also have a
readable copy at `citi.com/CRD/PDF/CMA/pricingTables/Addendum_{N}{letter}.pdf` or
`.../cardAgreement/{name}.pdf`, found by search; file names do not track the
version, so read the version code in the footer.

The tables print the APR at the Prime Rate on their "as of" date plus a **margin**.
When Prime has moved since, the current rate is margin plus today's Prime (Federal
Reserve H.15, `federalreserve.gov/releases/h15/`). Say in the report that it was
computed. **Citi store-card tables have no penalty APR row**, so a stored
"Up to 29.99%" on a store card is a copy-paste error. Their late and returned
payment rows read "Up to $41" (Goodyear and Exxon Mobil: late "Up to $40").

**Retailer sites print the digits citi.com blanks**, in plain HTML or through
r.jina.ai, and count as the co-brand partner's own disclosure: macys.com
`/p/credit-service/exclusions-and-details/`, the bestbuy.com Credit Cards page
footnotes, `costcotravel.com/Info/Credit-Card` (with a Prime as-of date), the
bloomingdales.com Loyallist Program Terms article, the Dillard's rewards terms PDF
at `dimg.dillards.com/is/content/DillardsZoom/rewardsprogrampdf`, and the Wayfair
Rewards terms (rewards section past character 200,000; read with an offset).
`citi.com/credit-cards/retail-guide/{brand}-credit-card-rewards-and-benefits`
articles are dated and carry the full footnoted rewards terms. Citigroup press
releases carry dated rate fine print. llbean.com, homedepot.com, tractorsupply.com
and bjs.com/bjsone block automated fetches. Search also returns Citi test hosts
(uat0x, qa3.aem, test02); never use them.

**Cross-card consistency is a usable lead, not a source.** Citi's cash advance
APR is normally uniform across its consumer cards, so a card whose stored value
differs from its siblings is worth re-checking first. On 2026-09-05
`citi-simplicity` stored 29.74% against `citi-diamond-preferred`'s 29.99%. Treat
that as where to look, never as what to write.

**Third-party renderers, learned 2026-11-07:** a read through `r.jina.ai` counts only
when a Citi or AA document backs it. One such read claimed "No late fee ever" on Citi
Diamond Preferred, and screenshots of Citi's own page disproved it. Screenshots from
a person reading `online.citi.com` do count.
