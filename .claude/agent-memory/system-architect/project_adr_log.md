---
name: adr-log
description: Index of ADRs written for this repo, their numbers, status, and what each one settled or deliberately deferred
metadata:
  type: project
---

`docs/adr/` was created 2026-08-08 with the first ADR. Numbering is `NNNN-slug.md`,
sequential, starting at 0001.

## Accepted / proposed

- **0001 — Two-tier daily card refresh pipeline** (proposed, 2026-08-08).
  `docs/adr/0001-two-tier-card-refresh-pipeline.md`. Cheap daily hash tier over the
  whole catalog plus an expensive `card-verifier` tier gated on hash-moved OR
  staleness floor. Six sub-decisions settled:
  1. Verification state is repo JSON at `backend/data/refresh/{card_id}.json`,
     flat, outside `backend/data/cards/`. Not Postgres, not inside card files.
  2. `fetch_status` is an enum with `ok` gating hash writes, so unreachable can
     never read as unchanged. Two verification timestamps
     (`last_verified_attempt_at` / `last_verified_ok_at`). Repeat PRs prevented by
     a live GitHub PR query (authoritative) plus an `open_review` record (durable).
  3. Intervals derived at run time from `annual_fee` and `credits[].max_annual`,
     30/90/180 days. Explicitly does NOT copy or move `CLASSIFICATION`.
  4. Hash a normalised text extraction, prefer rates-and-fees PDFs, store
     `normaliser_version`. Stuck-hash detection via canary fixture pairs (including
     a positive control that must hash differently), an `empty_extraction` floor,
     the staleness floor, and a post-merge cross-check.
  5. Seeding is hash-only with the expensive tier off; `last_verified_ok_at`
     seeded **null**, never backfilled from git or from today's date; hard cap of
     **4** verifications/day, interleaved across tiers on the initial drain. A
     `normaliser_version` bump reuses the seeding path.
  6. The edit lands as a `chore/verify-{id}-{date}` PR editing the live card JSON.
     The drafts queue is unavailable by design. Ships with two mechanical
     containment guards: branch-scoped token permissions, and a CI field-scope
     check limiting the diff to fields card-verifier reported discrepant
     (reordering included, since array position is `sort_order`).

  Measured for this ADR against the real catalog: tier split is 37/42/30 cards at
  30/90/180 days, steady-state demand 1.87 verifications/day. Simulation showed a
  cap of 3 allows up to 11 days of slip past a card's nominal interval; a cap of 4
  gives zero slip and a 28-day first pass. Recompute if the catalog grows past
  roughly 200 cards.

  7. Sidecar shape enforced by a strict Pydantic model (`extra="forbid"`) in a
     **new** module `backend/refresh/state.py`, deliberately not `backend/models.py`
     (which CLAUDE.md pins as the card-content-field-names module). Validated
     strictly at the writer and in CI, tolerantly at read time so one bad file
     can't abort the run for 108 healthy cards. Malformed/missing degrades to
     "never verified" and that direction is structural: `last_verified_ok_at` has
     no default, the degrade path takes no arguments, and a test pins that even a
     fully-populated garbage input can't smuggle a date through. Enums are
     `StrEnum`s pinned by **exhaustiveness** (`set(ACTION_BY_STATUS) == set(FetchStatus)`),
     not just a frozen list; enum values are a persisted format, so renaming one
     is a 109-file migration.

  **The staleness floor, not hash movement, is the dominant trigger.** Nearly all
  of the 1.87/day are cards where the hash did not move; hash-triggered runs are
  ~0.1/day. This is the design working, not waste: verify-only-on-change means a
  silently broken fetcher stops a card being checked forever. Queue priority is
  hash-moved first, then most-overdue, with a starvation guard at 2x interval;
  measured cost of that inversion is 1-2 days of slip. If hash-triggered runs ever
  become a large share of the cap, suspect the normaliser, not the catalog.

**Why:** First ADR in the repo; establishes the format and the numbering.

**How to apply:** Check here before proposing anything that touches refresh
scheduling, verification state, or automated writes to card JSON. Build on 0001
rather than reopening it.

Related: [[repo-architectural-constraints]], [[multi-market-deferred]].
