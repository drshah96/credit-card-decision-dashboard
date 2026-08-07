# CLAUDE.md

Project notes for Claude Code. The three READMEs (root, `backend/`, `frontend/`)
are the real documentation; this file is for behaviour that is load-bearing,
non-obvious, and not written down anywhere else.

## Non-obvious behaviour

**Points pooling is opt-in, and the default ranking never pools.**
`computeTopPicks` takes `applyPointsPooling`, which defaults to `false`.
`TopPickPage` turns it on only once the user has actually selected cards
(`selectedIds.size > 0`), because pooling a real Ultimate Rewards or ThankYou
balance requires holding both cards, which a whole-catalog ranking has no way to
know. So the default Top Picks ordering values every card on its own `best_cpp`.

Two further details are easy to get wrong when reasoning about this:

- Pooling keys on `points_pool_id`, an authored field on the card, **not** on
  `points_program`. The two agree one-for-one today, which makes them easy to
  conflate, but they are separate fields and the seam is deliberate.
- Only a card flagged `points_pool_receiver` can be the *source* of a boost.
  Two feeder cards sharing a pool id must not lift each other, since
  transfer-partner access needs an actual premium account in the mix.

All of it lives in `effectiveCppFor` in `frontend/src/utils/topPickCategories.ts`.
