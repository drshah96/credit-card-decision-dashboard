---
name: chase-source-route
description: How to reach Chase rates and per-card benefit lists, and the generic-agreement trap that produces a wrong APR for a named card
metadata:
  type: reference
---

**The pricing-and-terms table is the authoritative rates source** and fetches as
clean HTML. It is one link off the product page, at
`sites.chase.com/services/creatives/pricingandterms.html/content/dam/pricingandterms/LGC{NNNNN}.html`.
It carries its own "Disclosure Date" and a "Prime Rate as of" line, so it stamps
its own freshness. The `LGC` code is per-offer, so record this route rather than
a URL and re-find the code from the product page.

**Do not read APRs off the Chase product page.** It interleaves the penalty rate
into the purchase APR string and renders garbage such as
"18.24% and 29.99%-27.74% and 29.99%". The pricing table is the fix.

**The generic agreement trap.** `chase.com/content/feed/public/creditcards/cma/Chase/COL00095.pdf`
fetches cleanly and looks authoritative, but it is a **generic** agreement that
names no card. On `chase-slate-edge` its cash advance APR (28.49%) contradicted
the card's own pricing table (28.99%), and citing it would have put a wrong rate
in the catalog. Always prefer the card-specific `LGC` table, and never cite a
Chase PDF that does not name the card.

**Dead ends, do not spend calls on them:** the cardmember agreement selector at
`chase.com/personal/credit-cards/cardmember-agreement` defers to sign-in and
`.../card-agreements` 404s; `chasecardbenefits.com` is an empty JS shell;
`chase.com/card-benefits/{card}/more` 301s into `secure.chase.com` login; the
rewards program agreement PDF does not parse.

**Per-card benefit lists live in the education articles**, shape
`chase.com/personal/credit-cards/education/chase-cards/chase-{family}-benefits-guide`.
These enumerate coverage per card in a family, so **absence from a row is a
positive finding**. That is how "cell phone protection: not covered" was
confirmed for `chase-freedom-unlimited` against `chase-freedom-flex`, which has it.

**Transfer partners are login-gated.** Chase publishes its Ultimate Rewards
partner list only inside the signed-in portal; the public education pages name a
subset and are not a complete list. Report those ratios unverifiable from public
sources rather than working the problem. Chase does publicly state that transfers
require a Sapphire Preferred, Sapphire Reserve or Ink Business Preferred, so a
Freedom card's empty transfer block is confirmable.

**Two catalog conventions worth knowing before reporting a Chase discrepancy:**

- `returned_check_fee: null` is correct for Chase, whose terms state "None". All
  19 Chase files store null. This is the opposite of Amex, where null is a gap
  against a published $38. Re-check with the card's own pricing table.
- `balance_transfer_fee` is stored as the go-to tier only ("$5 or 5%") in all 19
  Chase files, which **omits the intro tier** ("$5 or 3% within 60 days of account
  opening") on every card that has an intro balance transfer offer. Confirmed on
  `chase-freedom-unlimited`; suspected on `chase-freedom-flex` and any other Chase
  card with an intro BT period. Re-check with:
  `grep -l '5% of the amount of each transfer' backend/data/cards/chase/*.json`
