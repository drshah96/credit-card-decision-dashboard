---
name: amex-source-route
description: How to reach American Express terms, APRs and insurance limits, given that Amex product pages render client-side and fetch as empty
metadata:
  type: reference
---

**Amex product pages are client-rendered and fetch as empty.** An `official_url`
on an Amex card resolves fine and yields no offer table, no APRs, no credits.
Never report a field `unverified` on that basis; the numbers are all on the
application terms page instead.

**Finding the terms page.** Path shape:
`/us/credit-cards/card-application/apply/{prospect|member}/terms/{slug}-credit-card/{formcode}/`.
Locate it by searching the Amex site for "{card name} Terms, Conditions &
Disclosures" rather than by guessing the form code, which changes on reissue.

Both variants exist and are two independent confirmations of the same card.
They legitimately differ on the welcome offer: `prospect` carries the public
offer, `member` carries the referral one. A card file tracks the public offer,
so a mismatch there is not a discrepancy.

Cite the "Variable APRs accurate as of MM/DD/YY" line that the page carries.
It is the document's own freshness stamp. Do not cite the POID, which identifies
the offer rather than the date.

**Insurance limits are never on the terms page.** It defers to a vanity URL such
as `americanexpress.com/PPterms`, which redirects twice through `go.amex/...` and
has to be followed hop by hop. The landing page maps cards to benefit guide PDFs
by number (Purchase Protection is guide 316-401). WebFetch cannot parse those
PDFs but saves the binary and prints its path, so read it with the Read tool.
Limits sit in a table on page 2 or 3.

**`global.americanexpress.com/card-benefits/...` truncates on fetch**, both the
view-all and the benefit-terms pages, so it is not usable as a cross-check. The
two application terms pages cover the same ground.

**Amex US consumer cards carry Car Rental Loss and Damage Insurance nearly
universally, including no-fee cards.** A card file claiming no rental coverage is
likelier to be wrong than the card is to be unusual. Confirmed on
`amex-blue-cash-everyday`, whose `rental_note` said the opposite. Re-check by
looking for "Car Rental Loss and Damage Insurance is underwritten by AMEX
Assurance Company" in the card's own terms page.

**A server-rendered Amex disclosure exists for partner co-brands** and is worth
trying when the `prospect` terms page is thin. Path shape:
`/us/credit-cards/card-application/apply/partner/print/personal-card/{partner}/{slug}/{code}?print=false`.
Found on `amex-marriott-bonvoy-brilliant`. It carried the full APR and fee table
plus the welcome offer's expiry date, which the other pages did not.

**Insurance dollar limits are not publicly reachable for any Amex card.** The
per-card Guide to Benefits lives behind `global.americanexpress.com/card-benefits/*`,
which is a login-gated JS shell with no stable public URL, so it returns an empty
dashboard header under fetch. The public policy pages
(`/us/credit-cards/features-benefits/policies/*-terms.html`) do confirm structure,
such as whether car rental coverage is primary or secondary, so they settle a
primary-vs-secondary question even when they cannot settle an amount.

Report those per-card *limits* `unverified`. Do not burn a run rediscovering
that gate: it is structural, it applied to every Amex card checked on 2026-09-05,
and the fix is a human with a cardmember login, not a better fetch.

**Do not extend that to whether a card has a benefit at all.** The public
`/us/credit-cards/features-benefits/policies/{benefit}-terms.html` pages print an
eligible-card list, and several of them tier it:

- `trip-delay.html` splits the portfolio into named TD500 and TD300 tiers, where
  the tier name is the dollar limit. That settles both the limit and eligibility
  from a public page.
- `trip-cancellation-terms.html` prints a plain eligible-card list, so a card's
  **absence is a positive finding**, not an unverified field.
- `global-assist-terms.html` separates Premium Global Assist from the standard
  Global Assist Hotline only by which benefit-guide PDF the card links to
  (`PGA_Benefit_Guide` versus `GA_Benefit_Guide`). Only the Premium version covers
  emergency medical transportation at no cost.

A card name appearing on one of these pages is the test for whether it *has* the
benefit, and absence is the only way to prove it does not. This found three live
errors on 2026-09-05: a trip cancellation entry and a Premium Global Assist claim
on `amex-delta-skymiles-platinum`, neither of which that card carries, and a fully
fictional trip delay entry on `amex-delta-skymiles-gold`. An earlier version of
this note said to report all insurance `unverified`, which would have suppressed
all three.

`car-rental-loss-and-damage-insurance.html` 404s; the working path is
`car-rental-loss-and-damage-insurance-terms.html`.

**Do not trust `get-started/{card}/uncover-your-benefits` for insurance figures.**
It fetches cleanly, which makes it look authoritative, and it gave two wrong
numbers on `amex-delta-skymiles-platinum`: a $500 trip delay for a card the policy
page puts in the TD300 tier, and "Primary" rental coverage no policy page
supports. Use it for benefit structure, never for a limit or a primary/secondary
call.

**The cardmember agreement PDF is the reliable route to rates and fees**, and it
is not gated. Reach it from the agreements hub at
`/en-us/company/legal/cardmember-agreements/`. Path shape:
`/content/dam/amex/en-us/company/legal/cardmember-agreements/public-site-{YYYY}-q{N}-pdf-cmas/cps-lending/{slug}-{quarter-end}.pdf`,
with `public-site-adhoc-{date}` variants for off-cycle republications.

WebFetch cannot parse these PDFs, but it saves the binary and prints the path.
Read that path with the Read tool's `pages` argument. **Page 2 is the only place
the returned-check fee and the account-reopening fee appear**, which is why they
get missed: they are not in the page 1 rates table.

**Amex caps variable APRs at 29.99%.** An agreement stating penalty as
Prime + 26.74% computes to 33.49% at a 6.75% prime, but the same document carries
the cap, so 29.99% is the correct effective rate. Do not "correct" a stored
29.99% upward from the margin arithmetic.
