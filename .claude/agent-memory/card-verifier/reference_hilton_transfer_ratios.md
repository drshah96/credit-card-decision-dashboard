---
name: hilton-transfer-ratios
description: Hilton Honors does not publish partner-by-partner transfer ratios anywhere public, so those fields are unverifiable rather than merely hard to find
metadata:
  type: reference
---

**Hilton Honors publishes no public transfer-ratio table.** The per-partner rates
are contractual between Hilton and each airline, and the only place they appear
is inside the logged-in points-exchange portal.

Routes already tried and dead as of 2026-09-05:
`hilton.com/en/hilton-honors/points-transfer/` returns 404, the legacy
`hiltonhonors3` host redirects to a page that 403s, and the help centre describes
the rates without listing them.

So on a Hilton co-brand, `transfer_partners.partners[]`, `airline_count` and
`recent_changes` are **unverifiable in principle from public sources**, not
unverified through a gap in the run. Say so in the report and move on rather than
spending tool calls on it.

Contrast with Marriott, which does publish its chart at
`marriott.com/loyalty/redeem/travel/points-to-miles.mi`. That page is fetchable and
settled several stale partners on `amex-marriott-bonvoy-brilliant`, so a Marriott
co-brand's transfer block is verifiable where a Hilton one is not. Re-check by
fetching that URL; if it still lists partners, this contrast holds.
