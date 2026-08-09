# 0001 — Two-tier daily card refresh pipeline
Status: proposed
Date: 2026-08-08

## Context

The catalog is 109 hand-authored cards across 9 issuers, each sourced from the
issuer's own terms. Every one of them decays. Fees move, credits get restructured
or discontinued, APR ranges reprice, welcome bonuses rotate. Today the only thing
standing between the catalog and a stale number is somebody remembering to run
`card-verifier` on a card, and nothing in the repo records when that last
happened for any given card. Staleness is therefore invisible: a card verified
three days ago and a card verified never look identical from the outside.

The proposal is two tiers:

- **Cheap tier**, daily, whole catalog. Fetch each card's issuer terms source,
  normalise it, hash it, compare to the stored hash. No model call.
- **Expensive tier**, `card-verifier`. Fires when the hash moved, *or* when the
  card is past its staleness interval.

The staleness floor is not redundancy. A hash that never moves is
indistinguishable from a fetcher that has been quietly returning the same error
page since March. The floor is the only thing that bounds how long a broken
cheap tier can hide.

What breaks if we defer: nothing visibly, which is the problem. The failure mode
of doing nothing is a catalog that reads as authoritative and is wrong in places
nobody can point at. The product's claim is hand-sourced accuracy, and accuracy
without a freshness mechanism is a claim about the past.

There are also decisions here that get expensive once state accumulates. A year
of hash history in the wrong place, or a `changed`/`unchanged` binary that lost
the `unreachable` case, cannot be reconstructed after the fact.

### What I verified in the code

Read for this ADR: root `README.md`, `backend/README.md`, `frontend/README.md`,
`CLAUDE.md`, `backend/models.py`, `backend/scripts/drafts.py`,
`backend/scripts/seed_catalog.py`, the head of `backend/scripts/upsert.py`,
`tests/backend/test_catalog_schema.py`, `tests/backend/test_catalog_files.py`,
`frontend/tests/utils/routeMeta.test.ts`,
`frontend/src/utils/cardTaxonomy.ts`, `render.yaml`, `pyproject.toml`,
`.claude/settings.json`, `.claude/agents/card-verifier.md`,
`.claude/agents/card-author.md`, and the workflows under `.github/workflows/`.

- **Content and storage are different shapes.** Card JSON is shaped by `Card` in
  `backend/models.py`; the database is `backend/db_models.py`; `upsert_card()`
  maps between them. `TimelineEvent` is exactly `date` / `type` / `badge` /
  `text`, with `type` constrained to `add | cut | neutral | future`. Money in
  JSON is whole dollars (`annual_fee`, `max_annual`, `default_value`). No card
  JSON carries a `_cents` key.
- **`drafts promote` and `reject` refuse to run when stdin is not a tty**
  (`_require_interactive` in `backend/scripts/drafts.py`), and
  `.claude/settings.json` carries a `PreToolUse` hook denying both commands for
  every session. An automated pipeline cannot promote a draft. This is stated
  again under Decision 6 because it kills an obvious design.
- **`seed_catalog` runs on every API boot.** `render.yaml` chains
  `alembic upgrade head && seed_catalog && uvicorn`, and `seed_catalog` calls
  `sys.exit()` on the first file that fails `Card(**data)`. A malformed card JSON
  does not degrade the API, it stops the service booting.
- **`seed_catalog`'s default glob is `backend/data/cards/**/*.json`, recursive.**
  I confirmed it currently matches exactly 109 files. Any `.json` file placed
  anywhere under `backend/data/cards/` is fed to `Card(**data)` at boot. This is
  a hard constraint on where pipeline state may live. Since PR #192 it also
  excludes any path with a `staging` segment via `is_staged()`, and selection
  lives in a named `select_files()` function so tests can drive it directly.
- **`tests/backend/test_catalog_schema.py`** validates every card file against
  `Card` and walks for keys the model would silently drop.
  **`tests/backend/test_catalog_files.py`** pins filename to `id` and the
  `cardImages.ts` art glob chain, including no orphaned art. Both now glob
  `**/*.json` with a `"staging" not in p.parts` filter (PR #192; they previously
  globbed one level with a parent-name filter).
  **`tests/backend/test_seed_catalog_boundary.py`** pins, in both directions,
  that the set CI validates equals the set `seed_catalog` seeds, by calling
  `select_files` rather than rebuilding the glob.
- **108 of 109 cards have `official_url`.** The exception is
  `backend/data/cards/amex/amex-green.json`. Host spread: citi.com 23,
  creditcards.chase.com 19, capitalone.com 16, americanexpress.com 13,
  bankofamerica.com 10, usbank.com 9, creditcards.wellsfargo.com 8,
  discover.com 6, bilt.com 3, rei.com 1.
- **`CLASSIFICATION` lives in `frontend/src/utils/cardTaxonomy.ts`**, keyed by
  card id, and `frontend/tests/utils/cardTaxonomy.test.ts` pins it both ways
  against the real catalog (no missing id, no stale id).
- **The `SEO_ISSUERS` / `ISSUERS` drift pin exists** in
  `frontend/tests/utils/routeMeta.test.ts` as a whole-array equality assertion,
  deliberately bidirectional so it catches an addition, a removal, a label edit
  and a reorder.
- **GitHub Actions runner traffic gets bot-challenged.** `keep-warm.yml`
  documents that this project's own Cloudflare zone challenges Actions runners
  with a JS challenge a bare curl cannot pass, which is why it pings the raw
  origin. Issuer WAFs will do the same to us.
- **No HTTP client ships in production dependencies.** `pyproject.toml` lists
  alembic, fastapi, psycopg, pydantic, sqlalchemy, uvicorn. `httpx2` is in the
  `dev` group only, and Render builds with `uv sync --frozen --no-group dev`.
  `pyproject.toml` sets no `tool.uv.default-groups`, so it defaults to `["dev"]`
  and a new non-default group would not be installed.
- **`--frozen` does not check that the lockfile is current.** Confirmed against
  uv 0.11.28, the version CI pins: `--locked` asserts `uv.lock` will remain
  unchanged, `--frozen` syncs *without updating* it. Both `render.yaml` and
  `ci.yml` use `--frozen`, so a stale `uv.lock` is currently invisible to both.
  `uv lock --check` is the check that catches it, and it passes today.
- **`card-verifier` is read-only by construction** (`disallowedTools: Write,
  Edit, NotebookEdit`) and keeps `matches` / `discrepancy` / `unverified`
  distinct, with confidence reported as counts. **Corrected after testing: the
  read-only property is advisory, not mechanical.** `card-verifier` is granted
  unrestricted `Bash`, so `disallowedTools: Write, Edit, NotebookEdit` blocks
  three tool names but not `echo > file`. `.claude/settings.local.json` has 251
  `allow` entries and no `deny`/`ask` rules, and is gitignored so it does not
  exist on a runner; the only committed mechanical gate is the one `PreToolUse`
  hook matching `drafts (promote|reject)`. Five other agents share the shape.
  See Decision 6.
- **Branch convention**: only `feat/`, `fix/`, `chore/`. `enforce-main-source.yml`
  constrains PRs into `main` to come from `development` or `fixes`, and places no
  constraint on PRs into `development`.

### What I am assuming, and what each assumption gates

1. ~~**That `card-verifier` can be invoked headlessly from CI at all.**~~
   **Resolved: it can.** Tested empirically on claude 2.1.226.
   `claude -p --agent card-verifier --output-format json "<prompt>"` works, three
   runs, all exit 0 with `is_error: false`, returning parseable JSON carrying
   `result`, `num_turns`, `total_cost_usd`, `usage` and `session_id`. Answers were
   checked against ground truth rather than merely parsed. Project agents in
   `.claude/agents/` are discovered without registration.

   **What remains unproven is narrower, and is the part that actually threatens
   the expensive tier.** Three things, in the order I would weight them:

   1a. **Network reachability from a runner.** Weight this highest. The expensive
   tier's entire job is fetching issuer terms, and `keep-warm.yml` already
   documents Cloudflare JS-challenging GitHub Actions runners against this
   project's *own* domain. Issuer WAFs will be no gentler. This does not just risk
   the pipeline being slow; it means the `blocked` status from Decision 2 should
   be treated as the **expected steady state for some issuers**, not a defensive
   branch that rarely fires. The design already handles it correctly, and that is
   now load-bearing rather than cautious.

   1b. **Authentication on a runner.** No `ANTHROPIC_API_KEY` or
   `CLAUDE_CODE_OAUTH_TOKEN` is set locally and there is no credentials file, so
   local auth is a subscription login that does not travel to CI. A runner needs
   an explicit secret. That is a decision and a secret rather than a technical
   blocker, but it is untested.

   1c. **Permission mode on a clean runner.** The successful runs inherited an
   interactive session's context. A clean runner needs explicit `--allowedTools`
   and `--permission-mode`, untried.

2. **That per-card cost of a verification run is small but nonzero.** Now has a
   floor rather than nothing: measured $0.05 to $0.19 and 5 to 15 seconds for
   trivial prompts. A real verification with document fetches will be materially
   more, so treat those as a lower bound, not an estimate. The design still bounds
   cost by the daily cap rather than by knowing the number.
3. **That most issuers publish a stable-URL rates-and-fees or pricing-and-terms
   document.** I verified only the `official_url` hosts, not the existence of
   terms documents behind them.
4. **That a new non-default `uv` dependency group is not installed by
   `uv sync --frozen --no-group dev`.** This is how uv is documented to behave,
   but it should be confirmed with a dry run before the fetcher's dependencies
   are added, because getting it wrong puts a scraping stack into the production
   image.

---

## Decision

Build the two-tier pipeline as described, with the six sub-decisions below.

### 1. Verification state lives in the repo as JSON, outside `backend/data/cards/`

**Decision.** One sidecar file per card at
`backend/data/refresh/{card_id}.json`, flat, no issuer subdirectories, the stem
equal to the card id. Nothing about verification state goes into Postgres, and
nothing goes inside the card files themselves.

**Why not Postgres.** Two reasons, and the second is the one that decides it.
The weaker reason is credentials: a GitHub Actions job writing verification
state needs production database credentials in CI, for a job whose only output
is a PR. The stronger reason is that it breaks the property the whole content
pipeline rests on. The database is a derived read model, rebuildable from JSON
by `seed_catalog` on every boot. A `card_verifications` table would survive
`seed_catalog` (it touches only the tables `upsert_card` writes), so the naive
objection "resync destroys it" is not literally true and I will not argue it that
way. What is true is that such a table would be the one thing in the system that
*cannot* be rebuilt from the repo. Today, "drop the database and restart the
service" is a safe operation. The moment verification history lives only in
Postgres, it stops being safe, and a Neon project migration (this repo has
already done one, per the comments in `render.yaml`) silently resets every card's
freshness clock to zero. A rebuildable-database property that has one exception
is not a rebuildable-database property.

**Why not inside the card JSON.** This is the genuinely close call, and it is
worth stating what it would buy: no new file layout, no new pin test, and
verification metadata visible in the API response for free. Three things decide
against it.

The first is blast radius, and this is no longer an inference from reading the
code. It has been demonstrated. `seed_catalog` runs before `uvicorn` in the start
command and exits on the first invalid file, so a card JSON that fails to parse
is a production outage, not a bad row. Every daily automated write would land in
the exact files whose parse failure takes the site down.

The demonstration came from an unrelated bug found the day after this ADR was
drafted: `seed_catalog` had no `staging/` exclusion at all, and planting a
work-in-progress draft confirmed the pre-fix path exits non-zero on validation,
breaking `render.yaml`'s `&&` chain before uvicorn ever starts. Fixed in PR #192
(`c584fa4`), now on `main`.

Two distinct failure modes existed there, and both are worth recording because
together they bound the blast radius this decision is arguing about:

- A **valid** draft in `staging/` was silently upserted into the live catalog on
  the next API restart, with no promotion and no review. Writing a file was
  enough to publish it.
- An **incomplete** draft took the API down on boot.

That is the range for a machine writing files under `backend/data/cards/`:
silently publishing unreviewed content at one end, refusing to boot at the other.
Both were reachable by writing a file to the wrong directory. Keeping automated
writes out of that tree entirely is worth considerably more than a small amount
of layout awkwardness, and the evidence for that is now a merged fix rather than
a paragraph of reasoning.

The second is that it puts a daily-churning field next to hand-authored prose.
`git log` on a card file is currently a readable history of editorial decisions.
Interleaving it with hash updates destroys that, and `git log --follow` on a
sidecar is a poor substitute for the thing it destroyed.

The third is that adding fields to `Card` puts them in the API response shape,
because `Card` is the response model. Verification metadata in `/api/cards/{id}`
is a product decision, and it should be made deliberately by adding a
`last_verified` field derived from the sidecars at seed time, if we ever want it,
not acquired as a side effect of picking a storage location.

**Why outside `backend/data/cards/`.** Verified: `seed_catalog`'s glob is
`backend/data/cards/**/*.json`, recursive. A sidecar under that tree would be
handed to `Card(**data)` at boot, fail validation, and stop the API from
starting. It would also be picked up by `test_catalog_schema.py`'s
`*/*.json` glob. `backend/data/refresh/` is outside both.

**Pin.** A test asserting the set of sidecar stems equals the set of card ids,
in both directions, in the same style as the `SEO_ISSUERS` / `ISSUERS` equality
assertion. A card with no sidecar is a card silently outside the pipeline, and
that is precisely the failure this whole ADR exists to prevent.

**Reversibility: expensive.** The *shape* of the file is cheap to change while
the history is short. The *location* is expensive after a year, because moving
repo state into a database means backfilling from git history, and moving
database state into the repo means exporting something no migration knows how to
regenerate. Choose once.

### 2. State fields, with `unreachable` structurally separate from `unchanged`

**Decision.** Each sidecar carries:

```json
{
  "card_id": "chase-sapphire-reserve",
  "sources": [
    {
      "url": "https://.../pricing-and-terms.pdf",
      "kind": "rates_and_fees",
      "content_hash": "sha256:9f2c...",
      "normalised_chars": 18422,
      "normaliser_version": 1,
      "last_fetch_at": "2026-08-08T06:11:02Z",
      "fetch_status": "ok",
      "fetch_detail": null,
      "status_since": "2026-05-02T06:10:41Z",
      "consecutive_failures": 0,
      "last_change_at": "2026-05-02T06:10:41Z"
    }
  ],
  "last_verified_attempt_at": "2026-07-14",
  "last_verified_ok_at": "2026-07-14",
  "last_verified_outcome": "matches",
  "open_review": null
}
```

`fetch_status` is an enum, not a boolean, and it is what the scheduler reads.
`ok` is the only value that permits writing `content_hash`. The failure values
are `http_error`, `network_error`, `blocked`, `not_found`, `empty_extraction`,
`no_source`. On any of them the previous hash is left untouched, which means the
hash literally cannot be used to claim "nothing changed" after a failed fetch,
because the comparison is gated on the status first. That gate is the mechanism.
The trichotomy the scheduler works in is `changed` / `unchanged` / `unreachable`,
mirroring `card-verifier`'s `discrepancy` / `matches` / `unverified` for exactly
the same reason: the third case is not the first, and code that collapses them
reports confidence it does not have.

`empty_extraction` is the local form of the auditors' zero-extraction rule. If
normalised text comes back under a floor, or drops by more than 40% against
`normalised_chars` from the last `ok` fetch, the outcome is `empty_extraction`,
not `unchanged`. An issuer serving a 300-byte "we'll be right back" page hashes
perfectly consistently, and that is the shape of the failure this catches.

`status_since` and `consecutive_failures` exist so that a rotting source is
visible as itself. Rules: `consecutive_failures >= 3` puts the card on the report;
`>= 7` opens a GitHub issue labelled `refresh-source-broken`, because a week of
failed fetches means that card is unmonitored and somebody has to re-source the
URL. Note that `blocked` will be common. Verified in `keep-warm.yml`: Actions
runner traffic gets JS-challenged by this project's own Cloudflare zone. Issuer
WAFs are at least as aggressive, so a meaningful fraction of the catalog may sit
permanently in `blocked`. That is honest information and the design surfaces it
rather than letting it read as a quiet daily "no changes."

Deliberately not stored: a per-run "we fetched today" timestamp for the
no-change case. `last_fetch_at` updates only when something else about the source
entry also changes. Committing a fresh timestamp for 109 files every day would
produce 109 file diffs a day and drown the signal. Liveness evidence is the
workflow run history, plus the fact that a failure would have flipped
`fetch_status`.

**Two verification timestamps, not one.** `last_verified_attempt_at` records
that the expensive tier ran. `last_verified_ok_at` advances only when the outcome
was `matches` or `discrepancy`, that is, only when the verifier actually read an
issuer document. A verification that came back `unverified` does not satisfy the
staleness floor. Collapsing these two into one field would let a card that has
been unreachable for a year look freshly verified, which is the same class of
error as collapsing `unreachable` into `unchanged`, one layer up.

**Preventing repeat PRs.** Two mechanisms, and the authoritative one is not the
stored field.

- *Authoritative guard*: before opening a verification PR for a card, the job
  queries the GitHub API for open PRs with the label `card-refresh` and head
  branch prefix `chore/verify-{card_id}-`. If one exists, no second PR is opened;
  the job posts a comment on the existing PR only if the source hash has moved
  *again* since that PR was opened. This is a live check against the real world,
  so it cannot desync from stored state.
- *Durable record*: `open_review` stores `{pr, opened_at, trigger, source_hash}`
  so a report can say "this card has had a proposal open for 24 days," and so
  the expensive tier does not burn a slot re-verifying a card whose answer is
  already sitting in review. If `open_review.opened_at` exceeds 30 days, the job
  escalates by commenting on the PR rather than doing nothing forever.

Both, not one, because the stored field alone fails exactly when its own commit
fails to land, and the live query alone loses the age information that makes an
unreviewed PR visible.

**Reversibility: adding a field is cheap, collapsing one is one-way.** Adding
fields to the sidecar later is a mechanical migration over 109 small files.
Merging `unreachable` into `unchanged`, or the two verification timestamps into
one, discards history that cannot be reconstructed, and it does so silently.
Treat the trichotomy as a fixed point of the design.

### 3. Fixed intervals derived from card content, not from a copied taxonomy

**Decision.** The interval is a pure function of fields already in the card's own
JSON, computed at run time. Nothing is stored, and no table is copied.

| Interval | Condition |
|---|---|
| 30 days | `annual_fee >= 250`, or any non-removed credit with `max_annual >= 100` |
| 90 days | any annual fee, any credits, or any `intro_apr_*` set |
| 180 days | everything else |

Plus two overrides: a card whose source is in a failing state for 14 days or more
drops to 30 days regardless (no automated change signal means the human check is
the only signal), and a card with no source at all gets 30 days for the same
reason (see `amex-green` in Decision 5).

**Computed every run, never stored.** No `interval_days` field exists in the
sidecar, and this is load-bearing rather than incidental. The scheduler reads the
card JSON and evaluates the rules fresh on each run, so the interval self-corrects
the moment the card's own data changes: when a merged refresh PR raises an annual
fee from $95 to $325, that card moves from the 90-day tier to the 30-day tier on
the very next run, with no migration, no backfill, and nothing to remember. A
stored interval would have to be recomputed by something, and that something would
be the drift.

Applying these rules to the catalog as it stands today gives **37 cards at 30
days, 42 at 90, and 30 at 180**. That distribution is an output of the rules, not
an input to them, so it will move on its own as the catalog changes. Decision 5
uses these counts for the cap arithmetic, and that arithmetic should be recomputed
rather than trusted whenever the catalog grows substantially.

**Why this and not `CLASSIFICATION`.** Verified: `CLASSIFICATION` is in
`frontend/src/utils/cardTaxonomy.ts`, a 551-line frontend module keyed by card id
and pinned both ways against the catalog by
`frontend/tests/utils/cardTaxonomy.test.ts`. A Python job cannot read it. That
leaves three options: duplicate it backend-side, move it backend-side, or do not
need it. Duplicating it is the `SEO_ISSUERS` / `ISSUERS` situation again, and
this repo has just spent a PR pinning that one with a bidirectional whole-array
equality test precisely because a hand-kept copy drifts silently. If we were
going to copy it, the pin would be a test asserting the two tables are equal key
for key and value for value, in that same style, and it would have to run in
whichever CI job can see both languages. Moving it backend-side is worse: it
would make a frontend rendering concern depend on the backend, for the benefit of
a batch job.

The right answer is to not need it. What actually goes stale is fees, credits,
and rate terms, and the cards where that churns are the premium credit-laden ones.
`annual_fee` and `credits[].max_annual` are already in the card JSON, already
validated, and already the thing being predicted. **A derived interval cannot
drift; a copied table can.** That is the whole argument.

**Why not adaptive intervals from observed change history.** With 109 cards and
plausibly a few dozen real changes a year, there will not be enough per-card
history to fit anything for two years or more. Worse, an adaptive rule lengthens
the interval on cards that appear quiet, and "appears quiet" is exactly what a
silently broken fetcher produces. Adaptive intervals fight the staleness floor
instead of complementing it. Revisit condition: after 24 months of observed
change history, if per-card change frequency turns out to be clearly bimodal and
the split does not track fee and credit structure.

**Reversibility: cheap.** The interval is computed, not stored. Changing the
table changes tomorrow's schedule and nothing else. This is a direct benefit of
deriving rather than storing, and it is worth some accuracy to keep.

### 4. Hash a normalised text extraction, prefer the rates-and-fees document

**Decision.** Never hash raw bytes. Hash a normalised text extraction of a
human-chosen source, with a preference order per card:

1. `rates_and_fees` (the pricing-and-terms or rates-and-fees PDF)
2. `terms_html` (the terms page, when no PDF exists)
3. `marketing_html` (`official_url`, last resort, highest noise)

The `sources[]` array is authored by a human when the card is added, not
auto-discovered. `card-verifier`'s own procedure already says the marketing page
is not the source; this encodes that.

Normalisation, HTML: parse, drop `script` / `style` / `noscript` / `svg` /
`iframe` and comments, take text nodes only and discard all attributes, collapse
whitespace, lowercase, then remove a small deny-list of volatile tokens: long hex
or base64 runs that look like CSRF tokens and nonces, ISO-8601 timestamps, and
cache-busting query fragments. Normalisation, PDF: extract text, collapse
whitespace, drop trailing page-footer date lines. Then SHA-256.

Every hash is stored with the `normaliser_version` that produced it. A hash whose
version does not match the current normaliser is treated as absent, which routes
it through the seeding path in Decision 5 rather than through "changed."

**How a normalisation bug that makes the hash never change gets detected.** This
is the failure that is silent and permanent, so vigilance is not an answer.
Four mechanisms, of which the fourth is the one that catches a subtle
over-normalisation:

1. **Canary fixtures in CI.** Committed under `tests/backend/fixtures/refresh/`,
   two pairs per source kind. Pair A differs only in volatile noise (rotating
   banner, fresh CSRF token, new build timestamp) and must hash *equal*. Pair B
   differs by exactly one fee number and must hash *differently*. Pair B is the
   positive control: an over-aggressive rule that strips digits, or a bug that
   returns a constant, fails it immediately. Without pair B the test suite would
   happily certify a normaliser that returns the empty string for everything.
2. **The `empty_extraction` floor from Decision 2**, which catches the degenerate
   case at run time rather than at test time.
3. **The staleness floor itself.** Even a permanently stuck hash still gets every
   card verified at its interval, so the ceiling on undetected staleness is 180
   days, not infinity. This is the reason the floor is not optional, and removing
   it later would be the single most dangerous edit anyone could make to this
   pipeline. Say so in the workflow file, not just here.
4. **A post-merge cross-check.** When a human merges a verification PR that
   changed a factual field, the job asserts that the card's source hash moved at
   some point in the preceding interval. A real factual change whose hash never
   moved is a normalisation-bug alarm, reported as an issue. This is the only one
   of the four that detects a rule which is subtly too aggressive on real issuer
   documents rather than on fixtures.

**Reversibility: expensive, and it repeats.** Every change to the normalisation
rule invalidates every stored hash. `normaliser_version` makes that recoverable
rather than catastrophic, but the recovery always costs a full re-seed, and a
re-seed is the stampede from Decision 5. Budget for it: expect to bump the
version a few times in the first months and roughly never afterwards.

### 5. Seeding is a hash-only pass with the expensive tier disabled

**Decision.** Three parts.

**Part one, the seeding run.** A `workflow_dispatch` run with `--seed`. It
fetches all 109 sources, writes hashes and statuses, opens one state PR, and
fires zero verifications. The same path runs automatically for any source whose
`normaliser_version` is stale, which is what stops a normaliser bump from
becoming a 109-card stampede. This is the recurring form of the first-run
problem, and it is the reason to build the seeding path as a normal code path
rather than as a one-off script.

**Part two, seed `last_verified_ok_at` as `null`.** Every card starts unverified
and the floor pulls the whole catalog in on merit, oldest first.

An earlier draft of this ADR backfilled the field from
`git log -1 --format=%cI` on the card file. That is wrong and the reasoning was
sloppy. Last-commit date means "when someone last edited this JSON," which
includes typo fixes, formatting passes, and schema migrations that touched all
109 files at once. A card edited last week for a one-word change would seed as
freshly verified and wait a full interval before its first real check, and the
`"seeded_from_git"` marker would not help, because the marker is invisible at
exactly the moment the scheduler consults the date. It claims a verification that
never happened.

`null` never makes that claim. The cost is convergence speed, and it is smaller
than it looks: the cap means a first pass takes about a month regardless of how
the field is seeded, so the git backfill was buying a slightly smoother queue at
the price of the field's meaning. `last_verified_ok_at` is also the field most
likely to be surfaced to users eventually ("last checked against issuer terms on
..."), and a field that will one day be a public claim should never have been
seeded with a proxy.

Seeding order for the initial drain is deliberate. All 109 are equally overdue at
day zero, so the tie-break decides which cards cluster, and clustering matters:
cards sharing an interval that get verified on the same day come due again on the
same day, and that synchronisation persists. Simulating the real catalog, a
shortest-interval-first tie-break front-loads all 37 premium cards into the first
two weeks and leaves a permanent resonant wave in the queue. Interleave instead:
round-robin across the three tiers so same-interval cards are spread across the
whole drain.

**Part three, a hard daily cap of 4 cards.** The cap is absolute: it applies to
hash-triggered and staleness-triggered verifications together, and a hash move
does not jump the queue past the cap, it just sorts to the front of tomorrow's.

**What the cap covers, stated explicitly because it is easy to read the wrong
way.** The expensive tier is *not* only firing when something changed. It fires
on either trigger, and in steady state the staleness floor is the dominant one by
a wide margin. Of the 1.87 verifications a day computed below, essentially all of
them are cards where **the hash did not move and nothing appears to have
changed**. Hash-triggered verifications sit on top of that and are rare, on the
order of 0.1 a day if the normaliser is behaving, since real issuer changes across
109 cards run to a few dozen a year.

That ratio is the design working as intended rather than waste. If the pipeline
only verified on hash movement, then a fetcher that silently returns the same
error page every day would mean a card is never checked again, and the system
would report a clean daily "no changes" forever. The floor is what converts that
from permanent invisible failure into a bounded delay. Paying about 1.9
verifications a day to check cards that probably have not changed *is* the
insurance premium, and it is most of the cost of the expensive tier.

A useful consequence for reading the reports: if hash-triggered verifications
ever become a large fraction of the daily cap, the correct first hypothesis is
that the normaliser has regressed, not that the catalog suddenly started
changing.

**Queue priority: hash-moved first, then most-overdue.** A moved hash is positive
evidence that a specific document changed; being overdue is only the absence of
recent evidence. Sorting purely by overdue-ness, as an earlier draft of this ADR
did, would let a card two days past its 180-day floor delay a card whose terms
document demonstrably changed this morning, which inverts the value of the two
signals. With hash moves running near 0.1 a day against 2.1 a day of headroom,
promoting them costs the floor almost nothing.

Two guards keep that from starving anything: a card overdue by more than twice
its interval outranks everything including hash moves, and the cap is never
exceeded for any reason. Both guards exist because "urgent work preempts
scheduled work" is the standard way a scheduled queue quietly stops running.

Simulated with hash moves injected on top of the floor, at cap 4 with the
priority and guards above:

| Hash-move rate | Worst slip past nominal interval | Throughput |
|---|---|---|
| none (floor only) | 0 days | 1.86/day |
| ~30 real changes/year | 1 day | 1.90/day |
| ~200/year (noisy normaliser) | 2 days | 2.15/day |

So the priority inversion costs at most a day or two of slip even when the
normaliser is misbehaving badly enough to be a bug worth fixing on its own. The
floor holds under both triggers, which is the property the cap of 4 was chosen
for.

The arithmetic, computed against the real catalog rather than estimated. Applying
Decision 3's rules to all 109 card files today gives **37 cards at 30 days, 42 at
90 days, and 30 at 180 days**. Steady-state demand from the floor alone is
therefore 37/30 + 42/90 + 30/180 = **1.87 verifications a day**, or about 13 a
week.

That closes against a cap of 4 with headroom, but the margin is not the whole
story, because demand is bursty rather than smooth: same-interval cards
synchronise, so the due-queue oscillates. Simulated over 1200 days with the real
tier counts:

| Cap | Worst slip past a card's nominal interval | First pass complete |
|---|---|---|
| 3/day | 11 days | day 37 |
| 4/day | 0 days | day 28 |
| 5/day | 0 days | day 22 |

A cap of 3 does not produce unbounded backlog growth, but it does mean a premium
card can sit up to 11 days past its 30-day floor during a peak, which makes the
floor a target with slip rather than the guarantee it is described as everywhere
else in this document. A cap of 4 absorbs the bursts completely at a steady-state
utilisation of about 47%. Take the cap of 4.

**The alarm that says the floor has gone aspirational.** Headroom is a property
of today's catalog, and the catalog grows. Emit the due-queue depth as a metric
on every run, and open an issue when its 30-day trailing mean increases for three
consecutive months, which is the signature of demand exceeding the cap rather
than of normal oscillation. The response is to raise the cap if review capacity
allows and lengthen the intervals if it does not. What must not happen is the
queue growing quietly while the ADR still claims a 180-day maximum, because at
that point the floor is a comment rather than a bound. As a rule of thumb, adding
cards keeps the current cap honest up to roughly 200 cards at today's tier mix.

**Cost and rate limiting, concretely.** The cheap tier is 109 HTTP fetches a day,
which is nothing in absolute terms but is 23 requests to one host. Run it
serially with a delay between requests to the same host, a real descriptive
User-Agent, and a per-run wall-clock budget after which the remainder is deferred
to the next day rather than retried harder. Expect `blocked` from some issuers
regardless: verified in `keep-warm.yml` that Actions runners get JS-challenged by
this project's own Cloudflare zone, and issuer WAFs are not friendlier. The
expensive tier is 4 runs a day, sequential, never parallel, each making on the
order of 10 to 20 web fetches. The point of the cap is not that 109 would be
unaffordable; it is that a design which can fire 109 has an unbounded worst case
the day a normaliser bug or an issuer-wide template change makes every hash move
at once. The cap converts that from an incident into a 28-day queue.

`amex-green` has no `official_url`, verified as the only such card of 109. Its
sidecar gets `sources: []` and `fetch_status: "no_source"`. It is excluded from
the cheap tier and placed on the *shortest* interval, not the longest: with no
automated change signal, the periodic human check is the only signal there is.
Backing that with a test: every card must either have at least one source or
appear in an explicit `NO_SOURCE` mapping with a written reason. A card falling
out of monitoring by accident should be impossible, and per this repo's habit,
an invariant that matters gets a test or it becomes folklore.

**Reversibility: cheap for the run, one-way for the seeded value.** Re-seeding
hashes is always available and is already a supported path because of the
`normaliser_version` case. Seeding `last_verified_ok_at` is different: once a
date is written there, nothing downstream can tell whether it came from a real
verification or from a backfill, so the choice of what to write is effectively
one-way. That asymmetry is the argument for `null`. `null` is the only value that
cannot be mistaken for evidence.

### 6. The JSON edit happens in a PR against the live card file, not through the drafts queue

**Decision.** The expensive tier produces a pull request that edits
`backend/data/cards/{issuer}/{id}.json` directly, with `card-verifier`'s report
in the PR body as evidence.

**The drafts queue is not available, and should not be.** Verified:
`_require_interactive()` in `backend/scripts/drafts.py` exits unless
`sys.stdin.isatty()`, and `.claude/settings.json` carries a `PreToolUse` hook
denying `drafts promote` and `drafts reject` for every session. Any design that
routes a refresh through `drafts promote` is dead on arrival. It is worth being
clear that this is not an obstacle being worked around: the drafts queue is for
introducing a genuinely new card, as `seed_catalog`'s own docstring and the root
README both say. Updates to live cards have always been reviewed as git diffs.
The pipeline uses the review gate that already governs the thing it is changing.

**Say plainly what this crosses, and be accurate about what is already guarding
it.** An earlier revision of this section listed "`card-verifier` cannot write at
all" alongside the tty gate as an existing capability control. **That was wrong,
and the correction matters more than the original point.**

Verified in the current repo: `card-verifier`'s frontmatter is
`tools: Read, Grep, Glob, Bash, WebFetch, WebSearch` with
`disallowedTools: Write, Edit, NotebookEdit`. Denying the `Write` tool while
granting unrestricted `Bash` denies nothing, because `echo > file`, `sed -i` and
`python -c` are all Bash calls. The only mechanical Bash gate anywhere in the repo
is the single `PreToolUse` hook in `.claude/settings.json` matching
`drafts (promote|reject)`. `.claude/settings.local.json` contains a `permissions`
block with 251 `allow` entries and **no `deny` and no `ask` rules at all**, and it
is gitignored, so on a runner it does not exist and the only committed permission
config is that one hook. The same shape applies to `editorial-auditor`,
`tier-auditor`, `frontend-reviewer`, `schema-reviewer` and `migration-reviewer`:
all granted `Bash`, all `disallowedTools: Write, Edit`, all described as
read-only.

Asked to write a file, `card-verifier` declines and describes its own position
accurately: the read-only behaviour is advisory, not mechanical. Declining by
judgment is precisely what a capability control is supposed to make unnecessary.

So the honest statement of what exists today is: **one real capability control
(the tty gate on `drafts promote`/`reject`, which I verified in code and which was
proven this week), and a set of agents whose read-only property is a property of
their prompts rather than of their capabilities.** A writer stage that trusts
`card-verifier` not to touch the working tree is trusting judgment, not
containment.

That does not change the decision, but it changes which parts of it are
load-bearing. The containment story must rest only on controls that exist, which
means the guards below are not belt-and-braces on top of agent-level isolation.
They are the whole of it.

This pipeline is still the first thing that writes a live card file from an
automated context, and calling it "just a PR" still understates it: a PR gates
*merging*, not *what the job is capable of proposing*. Three guards, all
mechanical, all required before this ships:

- **Branch containment.** The workflow's token may push only to refs matching
  `chore/verify-*` and `chore/refresh-state`, enforced by the token's own
  permissions rather than by the job's good behaviour, and the job never runs on
  or targets `main`. A ruleset on `development` and `main` restricting who can
  push closes the same hole from the other side. If the workflow can push to
  `development`, the review gate is advisory.
- **Field-scope containment.** The diff is validated by CI against the set of
  fields `card-verifier` reported as discrepant, which the job writes into the PR
  body as machine-readable JSON alongside the human-readable report. A change to
  any path outside that set fails the check. This is the guard that matters most,
  because the difference between "this job updates a fee" and "this job can
  rewrite `verdict.text` or reorder `credits[]` while updating a fee" is the
  difference between a small blast radius and the whole catalog's editorial
  voice. Reordering is specifically included: array position is `sort_order` in
  the database, so a silent reorder is a content change that looks like
  whitespace in review.
- **Verifier-stage tree containment.** After step one and before step two,
  assert the working tree is unchanged: `git status --porcelain` must be empty,
  and the job fails if it is not. This is the guard that replaces the
  agent-level isolation the earlier revision wrongly assumed existed. Its virtue
  is that it does not depend on tool grants, on frontmatter, or on the verifier's
  judgment. It asserts the outcome that is actually wanted, "the verifier did not
  modify the repository," and it holds however a write might have been attempted,
  including through Bash. Tightening the agents' tool grants is worth doing and is
  being done separately, but a check on the outcome is strictly more robust than a
  check on the capability, because it survives someone later adding a tool back.

All three guards are things a reviewer cannot reliably do by eye at roughly two
PRs a day arriving every day, which is exactly why they are CI checks rather than
review guidance. Per this repo's habit, an invariant that matters gets a test or
it becomes folklore.

**The mechanism, in two steps that must stay separate.**

*Step one*, `card-verifier` runs and produces its report: discrepancies with both
values quoted and a source URL each, the unverified list with reasons, proposed
`timeline[]` entries, and confidence as counts.

It is read-only **by instruction and by post-hoc assertion, not by capability**.
Its `disallowedTools` list does not enforce this, for the reasons above. The
separation between step one and step two is therefore something the pipeline has
to enforce, not something it inherits: the tree-containment check above is what
makes "the verifier only reported, it did not edit" a fact rather than an
expectation. The separation is worth preserving regardless, because a verifier
that also edits is a verifier whose report can no longer be checked against the
diff independently. That reasoning was always the point; what changed is that it
now needs its own enforcement rather than borrowing someone else's.

If the agents' tool grants are tightened so that `card-verifier` genuinely cannot
write, this guard becomes redundant rather than wrong, and it should be kept
anyway: it is one line, and it is the thing that would notice if the grant were
ever loosened again.

*Step two*, a separate narrowly-scoped writer applies the report. Rules:

- It edits exactly one file, `backend/data/cards/{issuer}/{id}.json`, and only
  fields that appear in the report's Discrepancies section.
- Field names come from `Card.model_fields` or from the file itself. Whole
  dollars, never `_cents`. This is the trap `CLAUDE.md` documents, it fails
  quietly, and a machine writer is more likely to fall into it than a person,
  because the ERD in `backend/README.md` is the most authoritative-looking
  document in the repo and describes a layer nothing in this pipeline touches.
- **Every factual change carries a `timeline[]` entry, and CI enforces it.**
  Shaped `{"date", "type", "badge", "text"}` with `type` in `add | cut | neutral
  | future`, verified against `TimelineEvent` in `backend/models.py`. If the
  writer cannot produce a defensible entry for a change, it does not make the
  change; it reports it in the PR body as needing human authoring.

  The writer-side rule is not sufficient on its own, and this is the one place in
  the design where I would expect automation to drift first. Skipping a timeline
  entry produces a PR that is correct in every visible respect: the fee is right,
  the tests pass, the diff is small and reviewable. Nothing is wrong except that
  the change history quietly stopped recording changes, and the timeline is the
  differentiator that makes this catalog worth more than an aggregator. A defect
  that degrades a differentiator while looking like a clean diff will survive
  human review indefinitely.

  So: a CI check on any PR labelled `card-refresh` asserting that if the diff
  touches a factual field on a card, that card's `timeline[]` gained at least one
  entry in the same diff. It runs on the PR, not on the writer, so it holds
  regardless of which tool produced the branch or whether a human hand-edited it
  afterwards.
- A credit that disappeared from the issuer's terms gets `"removed": true` plus a
  timeline entry. Never deleted. The card detail timeline depends on that history.
- Editorial fields are untouchable: `verdict.text`, `credits[].tips`,
  `credits[].default_value`. `card-verifier` already refuses to flag them, so the
  writer has nothing to act on, and the PR template asks the human directly
  whether the factual change makes the existing verdict misleading.

**PR mechanics.** Branch `chore/verify-{card_id}-{YYYY-MM-DD}` into `development`,
label `card-refresh`, one card per PR. `chore/` into `development` matches the
convention, and verified that `enforce-main-source.yml` constrains only PRs into
`main`. **Never auto-merged.** The state-only PRs from Decision 2 may auto-merge
behind a CI path guard asserting the diff touches nothing outside
`backend/data/refresh/`; content PRs may not, at any cap, for any card. The
product's entire claim is that a person checked this.

**CI on these PRs** is the existing suite plus four additions. The existing suite
covers more of the blast radius than it did when this ADR was drafted:
`test_catalog_schema.py` catches an invalid `Card` and any key the model would
silently drop, `test_catalog_files.py` catches a broken filename-to-id or art
link, and `test_seed_catalog_boundary.py` now pins that CI validates exactly the
set `seed_catalog` seeds. That last one was listed here as work to do; it landed
in PR #192 and the item is closed.

What this ADR still adds, collected in one place because together they are the
actual gate:

1. **Field-scope check**: the diff touches only fields `card-verifier` reported
   as discrepant, including no array reordering.
2. **Timeline check**: a factual change to a card implies a new `timeline[]`
   entry on that card in the same diff.
3. **Sidecar coverage check**: sidecar stems equal card ids in both directions,
   and every card has a source or an explicit `NO_SOURCE` reason. Covers *which*
   files exist.
4. **Sidecar schema check**: every sidecar validates against the model in
   Decision 7, with no unknown keys, plus the enum-exhaustiveness and
   `normaliser_version` assertions. Covers *what is in them*. Checks 3 and 4 are
   separate on purpose, because the first passing tells you nothing about the
   second.

Checks 1 and 2 apply to PRs labelled `card-refresh`. Checks 3 and 4 apply to
every PR, because they are invariants about the catalog's state rather than about
the pipeline, and a human-authored PR can break them just as easily.

**Reversibility: mechanism cheap, output permanent.** The workflow wiring holds
no state and can be rebuilt in a day. The `timeline[]` entries it writes are
permanent published content in the catalog's own voice, and a bad one is a
content problem, not an infrastructure problem. That asymmetry is the argument
for the "no timeline entry, no change" rule.

### 7. The sidecar is a strict Pydantic model in its own module, validated at three points

Decision 2 specified the sidecar's fields and Decision 1 argued for repo JSON on
the grounds that repo files are reviewable and rebuildable. Neither is true of a
format nothing validates. The pin named in the migration path covers *which*
sidecar files exist, not *what is in them*, which leaves the state format as the
one schema boundary in this repo with no enforcement. Card files would have had
the same gap without `test_catalog_schema.py`.

**7a. A Pydantic model, in a new module, not in `backend/models.py`.**

`backend/refresh/state.py`. Pydantic rather than JSON Schema because the repo
already validates with Pydantic everywhere, `Card(**data)` is the established
idiom at every write path, and a second validation technology would mean two ways
to express the same kind of constraint for no benefit.

The placement is the part worth arguing. `CLAUDE.md` now pins `backend/models.py`
as the module you take card content field names from, and that instruction exists
because four of eight agents shipped with names taken from the ERD instead, one of
which audited by dividing two fields that exist in no file. "Take names from
`models.py`" works as an instruction precisely because everything in that file is
card content. Adding an unrelated machine-state schema to it makes the instruction
ambiguous exactly where ambiguity already caused a documented failure: an agent
grepping `models.py` for a field name could land on `RefreshState`. A new module
costs one file and one import. Ambiguity in `models.py` costs a repeat of a
failure that has already happened four times. That is not a close call.

Reversibility: cheap. The module has no consumers outside the pipeline.

**7b. It runs at three points, with deliberately different strictness.**

The asymmetry with card files is real and should shape this. A malformed card file
is a boot outage because `seed_catalog` runs before `uvicorn` and exits on the
first invalid file. A malformed sidecar breaks nothing at runtime, because nothing
at runtime reads it. So the sidecar can take a weaker guarantee, but weaker means
*differently placed*, not absent.

- **Writer, at write time: strict, fails the run.** Validate before writing. A
  writer that cannot produce a valid sidecar should fail loudly in the job rather
  than commit a file that is wrong. This is the only one of the three that
  prevents bad state from entering the repo at all.
- **CI on the PR: strict, blocking.** Every sidecar parses, no unknown keys,
  stems match card ids both ways. This is what makes the files reviewable, which
  was the argument for repo JSON over Postgres in Decision 1.
- **Scheduler, at read time: tolerant, loud, per-card.** Deliberately *not* a hard
  failure. A single unparseable sidecar must not abort the daily run for the other
  108 cards. That would convert a one-card data problem into a whole-pipeline
  outage, which is a worse failure than the one being guarded against. It degrades
  that card per 7c and reports it.

The rule underneath: fail hard where a human can fix it before it matters (write
time, CI), degrade safely where failing hard would amplify the blast radius (read
time). Reversibility: cheap.

**7c. A malformed or missing sidecar means "never verified", and that direction is
structural.**

This is the trichotomy from Decision 2 one level up, and it has the same safe and
unsafe directions. Degrading to "no state" reads as never-verified, which makes
the card maximally overdue and fires a verification: noisy, safe, self-correcting.
Degrading the other way reads as freshly verified: silent, unsafe, and permanent
until someone notices a card that has not been checked in a year.

Making it structural rather than conventional means there must be no code path
that turns a parse failure into a date:

- `last_verified_ok_at` is `datetime | None` with **no default**. A missing key,
  an absent file and an unparseable file all produce `None`, and `None` is
  maximally overdue by the same comparison Decision 5 already relies on for
  seeding. The safe direction is the one you get by doing nothing, which is the
  only kind of safe default that survives contact with a future maintainer.
- The degrade path returns a state object constructed with no arguments. It
  cannot carry a date, because there is nowhere for one to come from.
- Pinned by a test asserting `degrade(<garbage>).last_verified_ok_at is None`
  across a set of hostile inputs: empty file, truncated JSON, valid JSON of the
  wrong shape, correct shape with a future date, and correct shape with every
  field populated. The last case is the important one: it proves that even a file
  that *looks* fully populated cannot smuggle a verification date through the
  degrade path.

The two degradations compose correctly, which is worth stating because it is the
part that makes this cheap. A corrupt sidecar loses its hash as well as its date.
The absent hash routes through Decision 5's seeding path, so the next fetch writes
a hash *without* firing a hash-triggered verification, meaning corruption does not
manufacture a false "this changed!" signal. Meanwhile the absent date fires a
floor-triggered verification. Corruption is therefore caught by the floor, which
is exactly the mechanism the floor exists for, rather than by a spurious change
alarm.

A corrupt sidecar also opens an issue labelled `refresh-state-corrupt`. Without
that, a writer bug that corrupts state daily would present as a card that
mysteriously keeps needing verification, and the recurring symptom would be read
as normal.

Reversibility: the code is cheap to change; the choice of direction should be
treated as fixed. Only one direction fails loudly, and a later maintainer
"simplifying" the degrade path into a populated default would introduce a silent
failure that no test outside 7c's would catch.

**7d. Strict on unknown keys: `extra="forbid"`.**

`Card` deliberately keeps Pydantic's default `extra="ignore"` and pays for it with
the `unknown_keys` walk in `test_catalog_schema.py`. The sidecar should not copy
that arrangement, for two reasons.

First, the failure mode is worse for machine-written files. A writer that renames
a field starts writing state nobody reads, while the old value sits in the file
looking current. That is a stale-value-reading-as-live failure, which is this
ADR's characteristic silent failure appearing one level up in the stack.

Second, `extra="forbid"` catches it at the writer, which 7b established as the
only point that keeps bad state out of the repo entirely. The CI walk catches it
one step later, after the file is already written.

To be explicit, since this differs from `Card` and the difference could read as
inconsistency: **do not change `Card` to `extra="forbid"` as part of this.** That
would convert today's silent-drop into a boot outage, because `seed_catalog`
validates on the API's start command. The correct treatment genuinely differs
between a hand-authored file on the boot path and a machine-written file that
nothing at runtime reads. Set the config on a shared base model so every nested
sidecar model inherits it rather than relying on each one remembering.

Reversibility: cheap now, expensive later. Loosening is always easy; tightening
after sidecars have accumulated junk keys means cleaning 109 files first.

**7e. The enums live in the same module, and the pin is exhaustiveness, not the
list.**

`fetch_status` (seven values) and `last_verified_outcome` (three, mirroring
`card-verifier`) become `StrEnum`s in `backend/refresh/state.py`, imported by the
scheduler, the writer and the reporting. One definition, no string literals at
call sites.

Freezing the member list is the obvious pin and it is the less useful one. Since
there is only one definition, the drift risk this repo usually guards against does
not apply. The real risk is different: someone adds an eighth `fetch_status` value
and the scheduler's branching does not handle it, falling through to a default
that may read as "unchanged". That would breach the trichotomy Decision 2 calls a
fixed point, and it would breach it silently.

So the pin is exhaustiveness. The scheduler's status-to-action mapping is a dict
keyed by the enum, and a test asserts `set(ACTION_BY_STATUS) == set(FetchStatus)`.
Adding a status without deciding what the scheduler does about it becomes a CI
failure rather than a fallthrough. Add the frozen-list assertion too, but for a
different purpose: these values are a **persisted format**, written into files
that live in git. Renaming one invalidates every historical sidecar carrying it,
so a rename is a migration over 109 files, not a refactor. The frozen list is what
makes someone notice that.

`normaliser_version` is an `int` constant defined next to the normaliser, pinned
by a test asserting it is greater than or equal to the highest version in any
committed sidecar. You cannot ship a normaliser older than the state it produced,
and that check costs one line. Bumping it is already the re-seed trigger from
Decision 5.

Reversibility: adding an enum value is cheap. Renaming or removing one is
expensive and effectively one-way for values already written to git.

**7f. The `*/*.json` versus `**/*.json` asymmetry: fixed, and the pin it produced
is now a dependency of this ADR.**

An earlier revision of this section flagged the asymmetry as a live gap and
recommended fixing it independently. That happened, in PR #192, and this section
is retained rather than deleted because the fix changed what this ADR can assume.

What the gap was: `seed_catalog` globbed `backend/data/cards/**/*.json`
recursively while the catalog tests globbed `*/*.json`, exactly one directory
level. Identical results for a flat layout, but a card nested at
`cards/{issuer}/sub/deep.json` was loaded into production and invisible to CI,
and since `seed_catalog` exits on the first invalid file and runs before
`uvicorn`, "loaded but never validated" meant a failure to boot.

The trap flagged here was real and is worth recording as a pattern: the naive fix
of widening the glob alone would have introduced a new bug, because the tests
excluded staging with `p.parent.name != "staging"` and under a recursive glob
`cards/staging/nested/n.json` has `parent.name == "nested"`. Both test files now
use `CARDS_DIR.glob("**/*.json")` with `"staging" not in p.parts`, and
`seed_catalog` grew an `is_staged()` helper matching the same way. Verified in the
current source.

**Still does not affect the sidecars.** They live at `backend/data/refresh/`,
outside `backend/data/cards/`, so no glob on either side reaches them, and
Decision 1 continues to depend on that.

**What changed for this ADR** is that
`tests/backend/test_seed_catalog_boundary.py` now exists and asserts, in both
directions, that the set CI validates equals the set `seed_catalog` would seed. It
does so by calling `seed_catalog.select_files` directly rather than rebuilding the
glob, so a regression inside the seeder fails the test. That is a stronger
guarantee than the one this ADR's migration path originally asked for, and
Decision 7's sidecar checks should follow the same construction: **drive the real
selection function, never reimplement its filter in the test.** The boundary test's
own docstring records that an earlier draft of it reimplemented the filter and
passed happily against a mutated seeder, which is the vacuous-pass shape the whole
family of these tests exists to prevent.

Reversibility: not applicable, this is now a fact about the repo rather than a
decision.

---

## Consequences

**Easier.** Staleness becomes a visible quantity: "which cards have not been
verified against an issuer document in 90 days" becomes a one-line query over
`backend/data/refresh/`. A source that stops being fetchable becomes an issue
with a name instead of a quiet daily success. `card-verifier` stops depending on
somebody remembering. The catalog gains a defensible freshness story, which is
the same story the product already tells about accuracy.

**Harder.** Every new card now needs a sidecar and at least one hand-chosen
source URL, enforced by a test, which adds a step to `card-author`'s output and
to the human review of a new card. The sidecar is strict, so a writer change that
renames a field fails the run rather than degrading quietly, which is the intent
but does mean the pipeline is less tolerant of its own in-flight changes than a
lenient format would be. Reviewers acquire a recurring queue of small
content PRs, and a refresh PR that sits unreviewed for a week is now a thing that
happens and that the design has to handle rather than a thing that cannot occur.
Anyone changing the normalisation rule has to understand the version and re-seed
path, which is real complexity added to a repo that currently has none of it.

**No longer possible.** Adding a card without deciding how it will be monitored.
Changing the normalisation rule without invalidating every stored hash. Removing
the staleness floor without removing the only bound on how long a broken cheap
tier can hide, which is a change that should be hard to make by accident.

**Explicitly preserved.** JSON remains the source of truth. The database remains
derived and rebuildable from the repo by `seed_catalog`, with no exceptions:
verification state is repo state, so "drop the database and restart" stays safe.
Nothing in this design writes to Postgres at all.

---

## Migration path

Cards already in the catalog are not edited by any of this until a human merges
a proposal PR. There are no URLs to worry about: nothing here changes card ids,
slugs, filenames or routes, so nothing indexed moves.

1. **Prove auth and reachability from a runner.** Invocation is no longer the
   question: headless `claude -p --agent card-verifier --output-format json` is
   tested and works, returning structured JSON with answers checked against ground
   truth. What is untested is whether it works *on a runner*, and the risk sits in
   two different places:

   - **Reachability (do this first, and treat a bad result as design-changing).**
     Run the cheap tier's fetcher from an actual Actions runner against a
     representative source from each of the nine issuers, and count how many come
     back `blocked`. `keep-warm.yml` already documents Cloudflare challenging
     runner traffic against this project's own domain, so a substantial blocked
     fraction is the expected outcome, not the surprising one. If most issuers
     block, the cheap tier does not work from GitHub Actions and the hosting
     decision has to be revisited before anything else is built. This is the
     cheapest experiment in the whole plan and it invalidates the most if it
     fails, so it goes first.
   - **Auth and permission mode.** A runner needs an explicit
     `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` secret, since local
     subscription auth does not travel. A clean runner also needs explicit
     `--allowedTools` and `--permission-mode`, which the successful local runs did
     not exercise because they inherited an interactive session's context. Neither
     is a technical blocker; both are untested, and the permission-mode work is
     where the tree-containment guard from Decision 6 should be wired in.

   The wider caution still stands, just aimed at the right target. Steps 2 through
   10 are downstream of the pipeline being able to reach issuer documents at all.
   Every number in this document, the 1.87/day steady state, the cap of 4, the
   review burden, assumes the fetches mostly succeed.
2. **Add the fetcher dependencies in a new non-default `uv` group** (`refresh`),
   and guard the lockfile, not just the group membership.

   The group part holds. Verified: `pyproject.toml` declares only a `dev` group
   and sets no `tool.uv.default-groups`, so it defaults to `["dev"]` and a new
   non-default group is not installed by `render.yaml`'s
   `uv sync --frozen --no-group dev`.

   The guard originally written here was aimed at the wrong failure. Checked
   against uv 0.11.28, the version CI pins: `--locked` asserts that `uv.lock` will
   remain unchanged, while **`--frozen` syncs without updating `uv.lock` and does
   not verify that it is current.** `render.yaml` builds with `--frozen`. So
   adding a `refresh` group and forgetting to commit the regenerated `uv.lock`
   does not fail the build. It installs from the stale lock, the fetcher's
   dependencies are silently absent, and it surfaces later as an `ImportError` at
   run time, in a scheduled job, where nobody is watching. That is the same
   silent-wrong-direction shape as every other failure this ADR is built around,
   and it deserves the same treatment.

   The real guard is `uv lock --check`, which asserts the lock is in sync with
   `pyproject.toml`. Verified it passes today. Note that CI's own
   `uv sync --group dev --frozen` is blind in exactly the same way, so **neither
   CI nor production would currently catch a stale lock.**
3. **Land the schema and the pins first, with no automation.** Create
   `backend/refresh/state.py` with the model, the two `StrEnum`s and
   `extra="forbid"` (Decision 7), create `backend/data/refresh/`, write the
   sidecars with `last_verified_ok_at` null for all 109, hand-author `sources[]`
   for all 109 cards (this is the real human cost of the whole ADR, see below),
   and add the four state-side tests: sidecar-to-card-id both ways, `NO_SOURCE`,
   sidecar schema with no unknown keys, and the 7c degrade test. One `chore/` PR
   into `development`.

   **Add a `uv lock --check` step to `ci.yml` in this same PR.** It belongs with
   the pins rather than with step 2: it is a one-line check, it protects every
   dependency change in the repo rather than only this pipeline's, and it closes
   a gap that exists today independently of whether this ADR ever ships. Adding a
   dependency without committing the lock is currently a silent production
   defect, and this is the cheapest possible fix for it.

   **The `seed_catalog` boundary test this step used to ask for already exists.**
   `tests/backend/test_seed_catalog_boundary.py`, landed in PR #192, and its
   `test_ci_validates_exactly_what_seed_catalog_seeds` asserts in both directions
   that the set CI validates equals the set `seed_catalog` would seed. Nothing to
   do here. See 7f for why its construction is the model the sidecar checks should
   copy.

   The 7c degrade test is worth writing before the degrade path has any callers.
   It is the assertion that the unsafe direction is unreachable, and it is much
   easier to write against a function with no callers than to retrofit once the
   scheduler depends on its behaviour.
4. **Land the containment guards before the writer exists.** Branch-scoped token
   permissions, the ruleset preventing pushes to `development` and `main`, and
   the field-scope and timeline CI checks. Build these before anything can write
   a card file, not after. A guard added after the capability has already shipped
   is a guard that was absent for exactly as long as it took someone to notice.
5. **Land the normaliser with its canary fixtures**, both pairs, before anything
   ever calls it. The positive control has to exist before the first hash is
   stored, or the first hashes are of unknown quality.
6. **Run the seeding pass manually** via `workflow_dispatch --seed`. Review the
   resulting state PR by hand: it is the one time somebody will look at all 109
   fetch statuses at once, and it is the best chance to catch a systematically
   blocked issuer before the pipeline starts treating it as normal.
7. **Enable the cheap tier on its daily schedule, expensive tier still off.**
   Watch for at least two weeks. What you are looking for is the daily state PR
   being mostly empty, punctuated by real hash moves, and not a wall of
   `blocked`. If most hashes move daily, the normaliser is not done and step 5
   was optimistic.
8. **Enable the expensive tier at a cap of 1 a day.** Read all of the first ten
   PRs personally, and deliberately try to get one past the field-scope and
   timeline checks to confirm they actually fail a bad diff. Raise to 4 only once
   the proposals are consistently correct about field names, whole dollars, and
   timeline entries. Note that at a cap of 1 the queue does not drain: 1 a day is
   below the 1.87/day steady-state demand, so this is explicitly a burn-in
   setting and the backlog will grow while it is in effect. Do not leave it here.
9. **The first pass takes about 28 days at the full cap**, with every card
   starting from null. Expect the early weeks to surface more discrepancies than
   the steady state does, because the first verification of a card is catching up
   on however long it has been since a human last checked it.
10. **After the backlog drains**, recompute the tier counts and the cap
    arithmetic against the catalog as it then stands, and review the interval
    table against what actually changed. This is the first point at which there
    is any evidence, and the table is cheap to change by design.

**Authoring and re-verification capacity.** Step 3 is 109 hand-sourced terms
URLs, and it is the same kind of work that produced the catalog: real human
effort, per card, from issuer documents. It is not a prerequisite that can be
skipped or generated. Any version of this plan that does not budget for it is
not a plan, it is a workflow file. The ongoing cost is smaller but permanent:
**1.87 proposal PRs a day at steady state, about 13 a week**, each needing
someone who will actually check the quoted issuer value rather than trusting the
diff. Most will be "no discrepancies found," which is fast to review, but the
number to plan against is 13 a week of *something* arriving.

If that review capacity does not exist, the correct response is to lengthen the
intervals so that demand matches the capacity, and to say so in this ADR when it
happens. Lowering the cap alone does not work: the cap throttles delivery while
the floor keeps generating demand, so the queue grows and the 180-day maximum
becomes fiction. Between the two knobs, the interval table is the honest one
because it changes what the system claims; the cap only changes how fast it
falls behind that claim. An unreviewed proposal is worse than no proposal,
because it looks like the system is working.

---

## Alternatives rejected

**Putting the sidecar model in `backend/models.py`.** Rejected because
`CLAUDE.md` pins that module as the place card content field names come from, and
that instruction is load-bearing after four agents shipped with names taken from
the ERD. A second, unrelated schema in the same file makes the instruction
ambiguous at exactly the point where ambiguity has already caused documented
failures. Revisit only if `models.py` stops being the canonical answer to "where
do card field names live," at which point the reason for keeping them apart is
gone.

**JSON Schema instead of Pydantic for the sidecar.** Rejected: a second
validation technology for the same class of constraint, in a repo that validates
with Pydantic at every existing write path. Revisit if sidecars ever need to be
validated by something that is not Python, for instance a frontend build step
reading verification dates directly.

**Letting an unparseable sidecar degrade to "recently verified", or aborting the
whole run on one bad file.** Both rejected in Decision 7c. The first is silent and
unsafe; the second turns a one-card data problem into a 109-card outage. Not
revisitable, in the sense that the safe direction is a property of the failure
mode rather than a preference.

**Making `Card` strict (`extra="forbid"`) for symmetry with the sidecar.**
Rejected as out of scope and actively harmful here: `seed_catalog` validates on
the API's start command, so forbidding extra keys converts today's silent drop
into a failure to boot. The existing `unknown_keys` walk is the right treatment
for a hand-authored file on the boot path. Revisit only alongside a change that
takes `seed_catalog` off the start command.

**Seeding `last_verified_ok_at` from `git log -1` on the card file.** This was
the recommendation in the first draft of this ADR and it was wrong. Last-commit
date answers "when was this JSON last edited," not "when was this last checked
against issuer terms," and the two diverge exactly where it matters: a typo fix,
a formatting pass, or a schema migration touching all 109 files would seed cards
as freshly verified and delay their first real check by a full interval. The
`"seeded_from_git"` marker did not save it, because the scheduler consults the
date, not the marker. Since the cap means a first pass takes about a month under
any seeding scheme, the backfill was buying a smoother queue at the cost of the
field's meaning, and `last_verified_ok_at` is the field most likely to become a
user-facing claim. Not revisitable: the objection is to the semantics, and those
do not change.

**Seeding `last_verified_ok_at` as today's date.** Rejected for the same reason
more starkly. It marks all 109 cards freshly verified when none have been, and
pushes the first real check a full interval out.

**Verification state in Postgres.** Rejected because it would be the only part
of the system that cannot be rebuilt from the repo, which turns "drop the
database and restart" from safe into destructive, and because it needs production
credentials in CI for a job that only opens PRs. Revisit if verification state
ever needs to be read at request time by the API rather than at build and report
time, at which point the right shape is probably still repo-JSON seeded into
Postgres by `seed_catalog`, not written directly.

**Verification state inside the card JSON.** The closest of the alternatives.
The deciding factor is blast radius: `seed_catalog` runs before `uvicorn` and
exits on the first invalid file, so daily machine writes into card files put a
batch job on the critical path of the service starting. Revisit if the sidecar
files prove to be a chronic source of drift against the catalog despite the pin
test, which would mean the separation is costing more than it saves.

**GitHub Actions cache instead of committed state.** Rejected: cache entries are
evicted, and an evicted hash store means every card looks changed, which is the
first-run stampede on a recurring and unpredictable schedule. Not revisitable;
the eviction is the whole problem.

**Adaptive intervals from observed change history.** Rejected because there will
not be enough history for two years, and because an adaptive rule lengthens
intervals on cards that look quiet, which is exactly what a silently broken
fetcher produces. Revisit after 24 months of history if change frequency is
clearly bimodal and the split does not track fee and credit structure.

**Duplicating `CLASSIFICATION` backend-side to drive intervals.** Rejected
because it recreates the `SEO_ISSUERS` / `ISSUERS` drift this repo just spent a
PR pinning, and because deriving the interval from `annual_fee` and
`credits[].max_annual` makes the copy unnecessary. Revisit only if a genuine
backend need for the taxonomy appears that cannot be derived from card content,
and if it does, the copy ships with a bidirectional whole-array equality test in
the same style as `routeMeta.test.ts`, in the same PR, or not at all.

**Raw-byte hashing of `official_url`.** Rejected: issuer marketing HTML carries
CSRF tokens, rotating promotional banners and build timestamps, so the hash moves
daily, the cheap tier fires the expensive tier 109 times a day, and the cap turns
it into a permanently saturated queue that verifies nothing in particular. Not
revisitable.

**Auto-merging content PRs above a confidence threshold.** Rejected. The
product's central claim is that a person sourced every number from the issuer's
own terms. A pipeline that writes catalog content without review makes that claim
false while leaving it in the README, and no confidence score fixes that. Not
revisitable while the claim stands.

**Routing refreshes through the drafts queue.** Not rejected on merit, it is
simply unavailable: `promote` requires a tty and is hook-denied. Recorded here so
the next person does not spend an afternoon rediscovering it.
