---
name: multi-market-deferred
description: Multi-market expansion is a known future decision set, not yet an ADR; records the one correction already made to its framing
metadata:
  type: project
---

No multi-market ADR exists yet as of 2026-08-08. When one is written it should
follow 0001 in numbering and will need to settle: currency and the `_cents`
naming, `cards.slug` identity collisions, per-market pool ids, per-market
valuations, routing/`hreflang`/`routeMeta` multiplication, authoring capacity,
and the regulatory gate.

**Correction already recorded, do not re-derive wrong:** the loyalty-pooling
blast radius is narrower than it first looks. Pooling keys on `points_pool_id`,
an authored field on the card, not on `points_program`; only a card flagged
`points_pool_receiver` can be the source of a boost; and pooling is opt-in via
`applyPointsPooling`, which `TopPickPage` sets only after the user selects cards.
The whole-catalog default ranking never pools. So distinct pool ids per market
fix cross-market pooling without touching `loyalty_programs` at all, and any
`loyalty_programs` market dimension is a separate question driven by transfer
partners and valuations, not by ranking behaviour.

**Why:** An earlier framing of this treated pooling as a `points_program`-wide
problem, which overstated both the bug and the cost of the fix.

**How to apply:** Start from this framing rather than the ranking code's surface
appearance. Verify `effectiveCppFor` in
`frontend/src/utils/topPickCategories.ts` still works this way before relying on
it. Related: [[adr-log]].
