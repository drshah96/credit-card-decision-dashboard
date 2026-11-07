---
name: capital-one-source-route
description: Capital One's Schumer box sits behind a javascript:void(0) modal with no URL, so only the annual fee and purchase APR are fetchable
metadata:
  type: reference
---

**The "View important rates and disclosures" control is `href="javascript:void(0)"`.** It
opens a client-side modal with no crawlable URL, so the Schumer box cannot be
reached by fetch. This is the Citi problem in a milder form: the product page at
`capitalone.com/credit-cards/{slug}/` does render the **annual fee and the purchase
APR** server-side, and stops there.

So on a Capital One card, expect to confirm the annual fee, the purchase APR, the
presence or absence of an intro offer, the earn structure and the benefit list,
and to report every other fee `unverified`. The cash advance APR is the field most
worth flagging: issuers commonly price it above the purchase APR, so a stored
value identical to `variable_apr` is a plausible authoring error rather than a
confirmed match.

**The useful trick: when a card has a `secured_variant_id`, fetch both twins.**
The two product pages disclose different subsets of the same terms. On 2026-09-05
the secured Platinum page stated "No foreign transaction fees" and "No authorized
user fees" while the unsecured Platinum page stated neither. Read that as evidence
about the page you fetched, not about its sibling: it tells you where to look, and
it does not license carrying a value across.

**`capitalone.com/credit-cards/benefits/` is not an eligible-card list.** It names
cards only for lounge access. A card's absence from *that page* proves nothing.

**But `capitalone.com/credit-cards/benefits-guide/` is, and it is the richest
Capital One source there is.** It is a plain index of every Guide to Benefits by
network and card tier. Fetch the index for URLs rather than guessing, because
`ecm.capitalone.com` paths 403 when guessed. WebFetch cannot parse the PDFs but
saves the binary and prints the local path; read that path with the Read tool and
a `pages` range.

Each guide's cover **names the exact products it covers** and carries an "in effect
as of" date and a form number, so it doubles as an eligibility list and stamps its
own freshness. **Absence from the guide is a positive finding.** That is how "no
trip delay, no cell phone, no emergency medical" were confirmed on
`capital-one-savor-one`, and how nine coverages the file had wrong or missing were
established on the same card.

**Fair-credit cards are bundled with the premium ones.** The Discover guide covers
"Venture, VentureOne, Savor, SavorOne, Quicksilver and QuicksilverOne" together, so
QuicksilverOne and the $39 SavorOne get the full benefit set. Any catalog entry
written on the assumption that a fair-credit Capital One card has thin coverage is
probably wrong. Re-check with
`grep -l '"network": "DISCOVER"' backend/data/cards/capital-one/*.json` against that guide.

**The product-page template is consistent across the line, so a fact present on a
sibling page and absent here is a real absence, not silence.** On 2026-09-05 the
Savor page stated a no-FX-fee line, a 5% Capital One Travel rate, a $200 bonus and
a 0% intro APR; the SavorOne page stated none of the four.

**Dead as of 2026-09-05**, eleven paths, do not re-spend fetches on them:
`/credit-cards/{disclosures,disclosure,terms,apply}/`, four spellings of the
agreement lookup, `/credit-cards/no-foreign-transaction-fee/`,
`/credit-cards/platinum-mastercard/`, and the help-centre fee pages. The CFPB
agreement database is form-driven and its issuer path guesses 404.
