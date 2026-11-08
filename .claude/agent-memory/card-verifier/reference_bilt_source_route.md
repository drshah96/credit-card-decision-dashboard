---
name: bilt-source-route
description: Bilt's pricing, offer terms and Guides to Benefits are all public PDFs linked from the card page footer; the tiers carry different protections, and the Guide outranks the page FAQ
metadata:
  type: reference
---

Corrected 2026-11-07. An earlier version of this note said pricing and Guide
limits were not public and that all tiers shared five protections. All three
claims are wrong.

**Start from the PDFs in the footer of `bilt.com/card/{blue|obsidian|palladium}`.**
Ask the fetch tool for the page's links. WebFetch cannot parse these PDFs but
saves them, so read the saved copy with `pdftotext -layout` or the Read tool.

- Pricing, all three tiers: `legal.cardless.com/schumer/bilt/rates_and_fees.pdf`.
  It states the Prime Rate date and the margins, so APRs can be checked exactly.
- Agreements: `legal.cardless.com/cardholder_agreement/bilt_{blue,obsidian,palladium}/cardholder_agreement.pdf`.
- Offer terms: `bilt.com/terms/bilt-card-offer-terms`, with a "Last Updated" date.
- Bilt Cash: `bilt.com/terms/bilt-cash`. Earning: `bilt.com/terms/earn`.
- Guides: `bilt.com/terms/{blue,obsidian,palladium}-card-guide-to-benefits`.
- Partner news with exact dates: `newsroom.biltrewards.com`.

**The tiers carry different protections.** Blue has rental, purchase and cell
phone only. Obsidian adds trip cancellation, trip delay, extended warranty and
lost luggage. Palladium adds baggage delay and price drop. Check all three
Guides side by side.

**The Guide outranks the page FAQ.** Obsidian's FAQ says "primary MasterRental",
but all three Guides make it secondary unless you have no other insurance or
yours does not cover you abroad.

**Offer terms outrank the Palladium page on Bilt Cash timing.** The page FAQ says
January 1. The offer terms say account opening and each card anniversary.

**Partner data is the weak spot.** `support.biltrewards.com` returns 403, so its
partner list is only visible through search extracts. Bilt's own partner counts
conflict across pages (25, 27, 28), so 19 airlines and 7 hotels is a best reading.
Bilt publishes no fixed rate for statement credits or rent.

**Unknown bilt.com routes return HTTP 200 with an empty body.** A 200 is not
evidence a document exists. `help.bilt.com` and `card.bilt.com` are DNS failures.

**Column N.A. is the issuer and Cardless is the servicer.** Wells Fargo issued the
original card before the Feb 2026 relaunch.
