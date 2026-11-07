---
name: bilt-source-route
description: Bilt's card pages render benefit copy in plain HTML but hide all pricing behind a client-side footnote block, and the issuing bank is Column N.A., not Cardless
metadata:
  type: reference
---

**Card pages are at `bilt.com/card/{blue|obsidian|palladium}`** and render
benefit copy fine, but the `†` footnote block that would carry APRs, fees and
some benefit fine print is client-side and never appears to a fetch.

**Unknown bilt.com routes return HTTP 200 with an empty body.** A 200 is not
evidence a document exists; treat a blank response as a miss. Confirmed dead on
this basis: `/legal`, `/card-terms`, `/card-offer-terms`, `/card/pricing-and-terms`,
`/card/disclosures`, `/rewards/transfer-partners`, `/rewards/points`. `help.bilt.com`
and `card.bilt.com` are DNS failures; `biltrewards.zendesk.com` returns 403.

**The Bilt Rewards Terms & Conditions PDF is real and reachable**, linked from
the site footer, at `bilt.com/terms`. It carries a "Last Updated" date on page
1. It governs the points *program*, not card pricing, and it explicitly defers
card earning to a "Bilt Rewards Card Offer Terms" document whose link is
embedded in a compressed PDF stream and could not be extracted. That document,
and the Column N.A. cardholder agreement, are the two things worth hunting for
on a future run; both are likely behind the application flow.

**The issuing bank is Column N.A., Member FDIC.** Every tier page states it
directly ("issued by Column N.A."). Cardless and Wells Fargo appear nowhere on
bilt.com. Wells Fargo was the prior issuer before the Feb 2026 relaunch;
Cardless does not appear to be the current issuer of record, whatever role it
plays in servicing.

**The three tiers publish the same five protections, not a tiered set.** Blue,
Obsidian and Palladium each list: rental car coverage, trip cancellation and
interruption, trip delay reimbursement, purchase assurance, and cellular
wireless telephone protection. None of the three publishes extended warranty at
any tier. Do not assume a benefit exists at a lower tier just because a higher
tier's page does not repeat it as new, and do not assume a benefit is
tier-exclusive without checking all three pages side by side.
