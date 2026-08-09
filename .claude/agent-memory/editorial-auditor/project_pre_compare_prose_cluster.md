---
name: project-pre-compare-prose-cluster
description: Cross-card comparison and catalog-count prose clusters in cards seeded 2026-07-11..21, before the /compare page existed
metadata:
  type: project
---

The catalog's comparison prose is not spread evenly. It clusters by authoring
date, in cards written before `/compare` existed.

**Why:** the catalog launched 2026-07-11 (commit bce593f, PR #3) with exactly
four cards: Amex Platinum, Chase Sapphire Reserve, Capital One Venture X, Delta
SkyMiles Platinum. With four cards and no compare surface, a detail page was
the only place to position a card against another, so the prose did it inline.
`/compare` shipped 2026-07-21 (commit 9cf9040). Every "of the four", every
catalog-scoped "here", and nearly all named cross-issuer comparison dates from
the 2026-07-11..21 window. Cards seeded after that (8 Wells Fargo on 07-28,
6 Discover on 08-06) carry essentially none of it.

**How to apply:** when a new comparison or superlative finding appears, check
its first-appearance date with `git log -S "<phrase>" --reverse`. Pre-07-21 is
the legacy cluster. Post-07-21 is new drift and matters more, because it means
the convention did not take. Also check a finding's neighbours in the same
file: stale text clusters within a card, not just within a date range.

The word "here" is the highest-yield search in the whole catalog: it meant
"these four cards" when written and now silently means "these 109".

See [[voice-conventions]].
