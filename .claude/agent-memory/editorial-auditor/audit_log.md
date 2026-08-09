---
name: audit-log
description: Dates of full editorial audits, what was covered, and which patterns were cleared
metadata:
  type: project
---

**2026-08-08 — first full audit.** 109 card files (staging excluded), 6,342
prose values across 34 fields. Extraction verified by hand against
chase-sapphire-reserve.json; both known-positive controls surfaced. No field
returned zero.

Findings raised: 11 catalog-scoped superlatives/counts, 17 cross-issuer
named-card comparisons + ~13 issuer-level ones, 155 same-lineup references
(raised as a class, not individually), 8 decaying claims, 1 contradiction
(us-bank-altitude-go-secured "one of the few secured cards", falsified by 5 of
6 secured/unsecured pairs in the catalog), 1 stale verdict (amex-gold).

**Cleared this run — patterns searched for and not found.** Do not re-derive
these from scratch next time; spot-check instead:
- Hedging that says nothing ("arguably", "your mileage may vary", "for the
  right person", "it depends"): zero hits catalog-wide.
- Issuer marketing language: zero real hits. Every match on
  curated/elevated/premium was a product name or a literal rate description.
- verdict/annual_fee contradictions: zero.
- Orphaned or missing issuer logos: 9 logos, 9 issuers, all imported by
  IssuersPage.tsx.

Nothing has been declined by a human yet. Nothing here is a
do-not-reflag entry.

See [[extraction-method]] for the coverage floors this run established.
