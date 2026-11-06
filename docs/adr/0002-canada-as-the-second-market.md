# 0002 — Canada as the second market
Status: proposed
Date: 2026-09-26

## What this document is based on

Read in full before writing: `README.md`, `backend/README.md`, `frontend/README.md`,
`CLAUDE.md`, `backend/models.py`, `backend/db_models.py`, `backend/scripts/upsert.py`,
`backend/scripts/seed_catalog.py`, `backend/services/cards.py` (lines 97-339),
`frontend/src/utils/topPickCategories.ts`, `frontend/src/utils/cardTaxonomy.ts`,
`frontend/src/utils/routeMeta.js`, `frontend/src/utils/cardImages.ts`,
`frontend/scripts/prerender.mjs`, `frontend/scripts/routes.mjs`,
`frontend/scripts/generate-sitemap.mjs`, `frontend/scripts/crawlableBody.mjs`,
`render.yaml`, `frontend/tests/utils/routeMeta.test.ts`,
`frontend/tests/utils/cardTaxonomy.test.ts`,
`frontend/tests/utils/topPickCategories.test.ts`,
`tests/backend/test_catalog_files.py`, `tests/backend/test_catalog_schema.py`,
`docs/adr/0001-two-tier-card-refresh-pipeline.md`, all nine
`.claude/agent-memory/card-verifier/reference_*_source_route.md`, and the agent
frontmatter in `.claude/agents/`.

Added for the second revision, after `schema-reviewer` reviewed this document:
`frontend/src/types/cards.ts`, `alembic/env.py`, `backend/db.py`, and the
migrations `b7c1e4a90d22`, `0ebfeee4e39d`, `93fb9fe16594`, `a45d60514c16`,
`be0291c77f0a`, `4fa0da85f81c`, `b1a8a02ceab5`, `4a994c57972e`. That review
corrected three of the twelve migration steps and one citation in this document
was **fabricated** — an earlier draft cited
`alembic/versions/17bf796f577f_*` as the reference for the SQLite batch-mode
hazard, and no such revision exists among the 24 in this repo. The real reference
is `b7c1e4a90d22_card_feedback_interested_respondents.py`. The bad citation came
from a committed agent-memory note, which has been corrected at the source. Worth
recording in the document itself: a plausible-looking file path is the failure
mode least likely to be caught by reading, since nothing about it looks wrong.

Measured against the real catalog for this ADR (109 card files, 0 staged):

| Measurement | Value |
|---|---|
| `_cents` columns in `db_models.py` | 4 (`annual_fee_cents`, `max_annual_cents`, `default_value_cents`, `fee_cents`) |
| `_cents` columns actually written by `upsert.py` | 3 — `fee_cents` is never written and never read |
| Places `_cents` is written (`* 100`) | 3 (`upsert.py:185, 273, 274`) |
| Places `_cents` is read (`// 100`) | 6 (`services/cards.py:105, 152, 153, 221, 223, 231`) |
| Numeric money fields in authored card JSON | 3 (`annual_fee`, `credits[].max_annual`, `credits[].default_value`) |
| Free-text field paths in card JSON containing a `$` | 34, across 1,565 string occurrences |
| Hardcoded `$` currency symbol sites in frontend source | 48, in 5 files, plus 1 in `crawlableBody.mjs` |
| Cards carrying `points_pool_id` | 8 (4 `chase-ultimate-rewards-transferable`, 4 `citi-thankyou-points-transferable`) |
| Distinct `earn_rates[].category` strings | 181, of which 14 name the U.S. explicitly |
| US-anchored brand tokens hardcoded in `topPickCategories.ts` matchers | 38 |
| Distinct `points.currency` values (each a `loyalty_programs` row) | 40 |
| `CLASSIFICATION` entries | 109, pinned bidirectionally against the catalog |
| Issuer source routes discovered by `card-verifier` | 9, of which 6 document a fetch pathology |
| i18n/locale infrastructure in the frontend | none; `<html lang="en">` is hardcoded in `frontend/index.html:2` |
| Alembic revisions | 24 |
| Tests asserting card `id` is unique across the whole catalog | **none** — `test_catalog_files.py` compares each file's `id` to its own stem only |
| Files containing a literal `points_pool_id` value | 10 (8 card files, plus `topPickCategories.test.ts` and `TopPickPage.test.tsx`) |

Measured by running it, not by reading (fresh in-memory SQLite, lib 3.45.3),
because step 2 of the migration path depends on the answer:

```
ALTER TABLE cards ADD COLUMN market_code VARCHAR NOT NULL
  DEFAULT 'US' REFERENCES markets(code)

PRAGMA foreign_keys=OFF : ACCEPTED, existing row reads 'US'
PRAGMA foreign_keys=ON  : REJECTED, OperationalError:
                          "Cannot add a REFERENCES column with non-NULL default value"
```

`alembic/env.py` builds its own engine with `engine_from_config` (line 60) and
never sees the `PRAGMA foreign_keys=ON` listener that `backend/db.py:61-64`
attaches to *its* engine. So migrations run with foreign keys off and the
one-statement form above is accepted. This is a real dependency, not a
coincidence, and it is recorded in step 2 as such.

Assumptions, stated as assumptions: the composition of the Canadian issuer
landscape (which banks issue what) is domain knowledge I have not verified
against issuer documents in this session. Every card count for Canada below is
an estimate for sizing, not a researched figure, and `card-author` must produce
the real lineup before Phase 1 is committed. Nothing in the recommendations
depends on those counts being exact; they only affect phasing.

---

## Context

The immediate ask is a `country` column. The column is the cheap part. What
forces a decision now is that four things in this system are near one-way once a
second market's data exists, and all four are content-side rather than
storage-side:

1. **`cards.slug`.** It is simultaneously the primary key of the card in the
   URL, the card JSON filename stem, the card art filename stem, the
   `CLASSIFICATION` key, the `secured_variant_id` target, and the value stored
   in two analytics tables that already hold production rows
   (`page_views.card_slug`, `card_feedback.card_slug`, the latter inside
   `UniqueConstraint("session_id", "card_slug")`). `tests/backend/test_catalog_files.py`
   pins the first three to each other in both directions. Choosing the wrong
   slug shape and then correcting it is a URL migration plus a data migration
   plus 109 file renames.
2. **The URL shape.** 109 card pages and 9 issuer pages are indexed, and the
   site launched on LinkedIn in August 2026. Reshaping published URLs costs
   accumulated authority.
3. **The authored field set in `backend/models.py`.** `Card` sets no
   `model_config`, so Pydantic's default `extra="ignore"` applies: a field added
   to card JSON without being added to the model is silently dropped.
   `tests/backend/test_catalog_schema.py` catches that, which means any new
   authored field is a deliberate, CI-visible change to the content contract
   across every card file.
4. **Authoring and re-verification capacity.** Each of the nine issuers in the
   catalog required a separate discovery effort to find a fetchable source of
   truth, and six of the nine have a documented pathology (Amex product pages
   fetch empty; Citi returns 200 with every number blank; Capital One's
   disclosure modal has no URL; BofA product pages 200 with an "unavailable"
   body; U.S. Bank's Pricing and Terms link exists only in markup; Bilt's
   pricing footnote is client-side). Canadian issuers are entirely unmapped.

Everything else is cheap, and the reason is the property this repo already
protects: **the database is a derived read model.** `render.yaml`'s
`startCommand` runs `alembic upgrade head && seed_catalog && uvicorn` on every
boot, and `seed_catalog` rebuilds the whole catalog from
`backend/data/cards/**/*.json` through the single idempotent `upsert_card()`.
So any decision that lives only in `db_models.py` is one migration plus a
re-seed away from being reversed. That asymmetry — content expensive, storage
cheap — is the organising principle of every call below, and it is the reason
this ADR spends most of its length on slugs, files and URLs rather than on
columns.

**What breaks if we defer.**

- **The footer's audit claim. Fixed globally on 2026-09-26, while this ADR was
  being written, and the fix does not survive a second market.** An earlier draft
  of this section named this as a live defect: `CARDS_AUDITED` is pinned by
  `routeMeta.test.ts` to `countCardFiles()`, and the footer spent it in one
  sentence with `LAST_AUDITED`, so adding a card asserted that the new card had
  been re-verified on a date predating it. Commit `e22d325` ("fix: stop the footer
  backdating card verification, and catch up the audit dates") split that copy
  into two independent claims — "All N cards here are sourced from the issuer's
  own terms. The last full issuer-by-issuer re-check finished {date}." — and moved
  `LAST_AUDITED` to September 6, 2026 and `TERMS_AS_OF` to September 2026. That is
  the right fix and it makes the file-count pin honest. Read from the code, not
  assumed.

  What remains, and it is now a *market* problem rather than an audit-honesty
  problem: `countCardFiles()` counts every non-staging issuer directory
  regardless of market, and `LAST_AUDITED` is still one global date. With
  Canadian cards on disk, a US visitor's footer would count them, and a Canadian
  page would report a US re-check date as its own. `routeMeta.test.ts`'s new
  comment also records a constraint worth honouring: if the count and the date
  are ever recombined into one sentence, the pin must stop deriving from the file
  count. D8's per-market split is unchanged by the fix; only its justification
  moves.
- `topPickCategories.ts` is a US lexicon presented as a category engine. Its
  `BRAND_EXCLUDES` list exists specifically so a United-only 11x does not win
  the broad "Flights" row. It names `united|delta|southwest|american airlines`.
  An Air Canada Aeroplan-only or WestJet-only rate is not in that list, so the
  first Canadian co-brand authored would win "Flights" outright on a rate that
  applies to one airline. The guard exists and is correct; it is simply
  US-populated.

---

## Decisions

### D1 — The market dimension: a registry file, a DB reference table, and `cards.market_code`

**Call.** Add `backend/data/markets.json` as the authored registry of markets.
Seed a `markets` reference table from it. Add `market_code` to the `Card` *and*
`CardSummary` models and to `cards`, FK to `markets.code`, **indexed**.

`backend/data/markets.json`, *not* under `backend/data/cards/` — `seed_catalog`'s
`DEFAULT_PATTERN` is `backend/data/cards/**/*.json`, recursive, and every `.json`
anywhere under that tree is fed to `Card(**data)` at boot. A sidecar in there is
a service-down event.

```json
[
  { "code": "US", "name": "United States", "currency": "USD",
    "currency_minor_exponent": 2, "locale": "en-US",
    "path_prefix": "", "slug_suffix": false, "status": "published" },
  { "code": "CA", "name": "Canada", "currency": "CAD",
    "currency_minor_exponent": 2, "locale": "en-CA",
    "path_prefix": "/ca", "slug_suffix": true, "status": "draft" }
]
```

JSON rather than a `.js` module, because both sides must read it: Python reads
it directly and Node reads it with `JSON.parse`. That avoids the situation
`routeMeta.js` is in, where being plain JS is what lets the Node build scripts
share it — a market registry has a Python consumer too, and JSON is the only
format neither language has to parse specially. It also keeps the registry
inside the JSON-as-source-of-truth property: the `markets` table is derived from
it exactly as `cards` is derived from the card files.

**The column is named `market_code`, not `country`.** This deviates from the ask,
deliberately. `sessions.country` already exists and holds the *visitor's*
two-letter ISO code from Cloudflare's `CF-IPCountry` header. Product availability
and visitor geography are different dimensions that will be joined against each
other ("what fraction of visitors from CA landed on US cards"), and giving them
the same column name in one schema invites a wrong join that returns plausible
rows. `market` is also the more accurate noun: a market is a jurisdiction a
product is offered in, which is not always a country — the EU would be one
market across many, and Quebec may need its own locale inside Canada.

**`market_code` is authored on the card, not derived from the issuer.** Reason:
`Issuer` rows are get-or-created by the authored `issuer` string
(`upsert.py:127`), and `Issuer.name` is unique. The authored string should name
the *issuing entity in that market* — "Amex Bank of Canada", not "American
Express" — which means most Canadian issuers are new issuer rows anyway and the
dual-market ones are few. Putting the market on the issuer would then be
correct-but-redundant against the card, and this repo's standing position on a
second copy of anything is that it ships with a drift pin or it does not ship.
Cheaper to derive issuer market membership from its cards, with a pin asserting
every issuer's cards share one market. That pin is load-bearing rather than
hygiene: an author writing `"issuer": "American Express"` on `amex-platinum-ca`
gets silently attached to the existing US issuer row, because
`_get_or_create(session, Issuer, name=data["issuer"], ...)` (`upsert.py:127-129`)
resolves by the authored string and `Issuer.name` is unique (`db_models.py:36`).
The card would then appear on `/issuer/amex` in the US lineup. Nothing else in
the system catches that. It is in the migration path as step 3, not left as an
aspiration in this paragraph.

**`markets.code` is the primary key, and that is a deliberate deviation.** Every
other reference table here (`Issuer`, `Network`, `LoyaltyProgram`, `BenefitTier`,
`CoverageType`) uses a surrogate integer PK plus a unique natural key. `markets`
uses the natural string `code` as its PK instead. Postgres requires an FK target
to be PK or UNIQUE, so one of the two is needed regardless; choosing the natural
key means `cards.market_code` reads as `'US'` / `'CA'` rather than as an opaque
integer, which matters because this is a column people will filter by hand in the
Neon console. The set of markets is tiny, stable and externally defined (ISO
3166-1 alpha-2), which is exactly when a natural PK is safe. Stated here so the
next reviewer does not relitigate it.

**The column is indexed.** Every FK in this schema is explicitly indexed
(`db_models.py:99-103`, and migration `a45d60514c16` exists for nothing but
adding FK indexes). More to the point, once `get_card_summaries()` is
market-scoped this column is the `WHERE` clause of the hottest query on the site.
`index=True` plus the matching `op.create_index`.

**A mis-authored `market_code` must fail in CI, not at boot.** `upsert_card`'s
`except IntegrityError` (`upsert.py:352`) exists for the deploy-transition race
documented at `upsert.py:147-155` and recovers by re-reading the row:
`filter_by(slug=data["id"]).one()`. An FK violation from `"market_code": "CAN"`
is *also* an `IntegrityError`, raised on a card that was never inserted, so the
recovery path's `.one()` raises `NoResultFound` at boot with a message that
mentions nothing about markets. So validate `market_code` against the registry in
the Pydantic model, which puts the failure at `Card(**data)`
(`seed_catalog.py:93`) where the message already names the file, and gets it
pinned by `test_catalog_schema.py` for free. A `field_validator` reading the
registry rather than a generated `Literal`: `Literal` needs statically-known
values, so generating one from a JSON file at import time is the more fragile of
the two for no gain. This is the `markets` analogue of the get-or-create
discipline at `upsert.py:94-109` — resolve reference data deliberately, and fail
with the offending input named.

**`market_code` is a second copy of something the slug also encodes, and it
ships with a pin.** D4 puts the market in the slug as a suffix, so a card's
market is derivable from its id alone. Both forms are needed and for different
reasons: the suffix is what the two file-walkers that must not parse JSON use
(see D9), and the column is what an indexed equality scope on
`get_card_summaries()` uses — a `LIKE '%-ca'` would not be indexable. Per this
repo's standing position, a second copy ships with a bidirectional pin or it does
not ship: for every card file, the authored `market_code` must equal the market
derived from its id. Two lines, and it is what makes D9's derivation trustworthy
enough to gate a publish on.

**Reversibility: the column is cheap, the authored field is moderate.** Adding,
renaming or reshaping `cards.market_code` is one migration plus a re-seed.
Adding `market_code` to `Card` touches all 109 card files once; `Card` ignores
extra keys and `test_catalog_schema.py` is what surfaces the mismatch, so the
model change and the file change must land in the same commit.

### D2 — Currency lives on the market, with a nullable per-card override

**Call.** `markets.currency` is the currency of the market. Add
`currency_code: str | None = None` to **both `Card` and `CardSummary`**,
defaulting to `None`, meaning "use the market's currency". Populate it only on
the exceptions.

**Both models, not just `Card`, and this is not symmetry for its own sake.**
Every money figure a formatter renders on a *listing* surface comes from
`CardSummary`, not `Card`: `annual_fee` (`models.py:263`), `total_easy_credits`
and `total_max_credits` (`models.py:266-267`), all returned by
`get_card_summaries()` (`services/cards.py:332`). Put `currency_code` on `Card`
alone and a CA-market, USD-billed card renders CAD on the issuer grid and the
compare table and USD on its own detail page — a disagreement between two pages
about what currency a fee is in, which is worse than either being wrong
consistently. On the TypeScript side both fields belong on `CardBase`
(`types/cards.ts:34`), which `CardSummary` (`:106`) and `Card` (`:213`) both
extend, so one edit covers both.

Not on the issuer: a single issuer can offer accounts in two currencies.
Not on the card as a required field: making it required means a market-level
currency correction is an N-file edit, and it would have to be seeded with the
market's value on every card — which is a plausible proxy standing in for
"nobody decided this", the exact failure this project has rejected before.

The exception is real and Canadian. Canadian banks issue US-dollar-billed cards
to Canadian residents (an RBC US Dollar Visa is the archetype). Those are CA
market, USD currency. `currency_code` is for them and for nothing else, so it
stays `None` on the entire existing catalog and on almost all of Canada.

**It is an override, so it ships with a pin — same standing position as D1's.**
Nothing otherwise stops `currency_code` naming a currency no market in the
registry uses, and nothing stops it being set *redundantly* to its own market's
currency, which then goes stale the day that market's currency is corrected. That
is the exact staleness this decision uses to argue the field should not be
required, so it would be incoherent to leave it unguarded. One test, two clauses:
when non-null, `currency_code` must differ from its market's currency, and must
be a currency some registry market uses.

**This field's failure mode is silent, which is why the read boundary is spelled
out in the migration path.** `market_code` is required, so forgetting it in
`_to_card` raises `ValidationError` and fails loudly. `currency_code` defaults to
`None`, so forgetting it anywhere in the chain returns `null` forever with a
green build — on the one field whose whole job is to stop a USD figure being
labelled CAD. See step 6.

**Display and conversion boundary: display at the market, never convert.**
There is no conversion boundary, because the site must not convert. A CAD annual
fee converted to USD is a number the issuer never published, it moves daily, and
it would put a fabricated figure in a document whose whole claim is that its
numbers come from issuer terms. So: a card's money is rendered in its own
currency, on pages scoped to its own market, and cross-market comparison is not
offered. This is also why the Compare page must be market-scoped rather than
market-aware (D6).

The 48 hardcoded `$` sites in frontend source and the one `money()` helper in
`crawlableBody.mjs:63` (`` `$${Number(n).toLocaleString("en-US")}` ``) get
replaced by a single formatter that takes the currency and locale off the card's
market. Symbol choice for CAD is an editorial call for the copy owner, not an
architecture call; the formatter must simply be able to express whichever is
chosen consistently. The 1,565 `$` occurrences across 34 *free-text* field paths
need no mechanism at all — `effective_cost`, `welcome_bonus.requirement`,
`late_payment_fee` and the rest are verbatim strings from issuer terms, so a
Canadian card's free text carries whatever its own terms document carries. That
is the single largest piece of good news in this ADR: the overwhelming majority
of money in this catalog is already market-neutral because it is quoted, not
computed.

**Reversibility: cheap.** One nullable column, one formatter.

### D3 — Do not rename `_cents`. Gate the rename on a mechanical check instead.

**Call.** Leave `annual_fee_cents`, `max_annual_cents` and `default_value_cents`
named as they are. Add a test that fails **unconditionally** if `markets.json`
ever contains a market whose `currency_minor_exponent` is not 2.

The brief asks whether to rename now while it is mechanical. The answer for
Canada is no, and the reason is not cost — the rename is measurably small: 3
write sites, 6 read sites, one migration. The reason is that CAD is a
two-decimal currency, so `_cents` is *accurate* for Canada, and the rename's only
beneficiary is a hypothetical zero-decimal market (JPY, KRW). Set against that,
the rename edits `CLAUDE.md`'s content-versus-storage field table,
`backend/README.md`'s ERD, and four agent definitions. `CLAUDE.md` records that
four of eight subagents shipped with wrong field names taken from that ERD,
including one whose entire audit divided two fields that exist in no file. That
table is the highest-blast-radius doc in the repo, and editing it to fix a
problem no current or planned market has is a bad trade.

What makes this a decision rather than a deferral is the guard. A deferral
recorded as a sentence is folklore; the failure mode here is specifically quiet,
because a JPY card authored with `annual_fee: 15000` would pass every existing
test and store `1500000` — a value a hundred times too large, which is the exact
failure `CLAUDE.md` already warns is silent. So the gate is a test, and it reads
the market registry, so it fires at the moment the decision actually arrives:
when someone adds the first zero-decimal market, not when someone remembers.

**The guard is not conditional on the column names, because the name is not what
breaks.** An earlier draft of this decision had the test fire only "while the
columns are still named `_cents`", which gets the mechanism backwards: renaming
the columns fixes nothing at all. What breaks is the **arithmetic** —
`round(value * 100)` at `upsert.py:185, 273, 274` on the way in, and `// 100` at
`services/cards.py:105, 152, 153, 221, 223, 231` on the way out. Those nine sites
hardcode an exponent of 2, and they would still hardcode it under a
currency-neutral name. So the assertion fires on the registry alone, and its
failure message names all nine sites as the work the new market actually requires.
A test that could be satisfied by a rename would be worse than no test, because
someone would satisfy it.

**Also in this decision: drop `additional_card_options.fee_cents`.** It exists in
exactly three places, all of them declarations: `db_models.py:354`,
`4a994c57972e:131`, and the ERD at `backend/README.md:193`. It is never written
by `upsert.py` (which sets only `fee_label`) and never read by
`services/cards.py`. Dropping it removes a fourth money column that would
otherwise need a currency story it can never use. Pre-check before the drop, so
this stays a verified claim rather than an inference from reading:
`SELECT count(*) FROM additional_card_options WHERE fee_cents IS NOT NULL` must
return 0.

The drop carries an index hazard, though not the CHECK hazard — 
`additional_card_options` has no CHECK constraint, but it does carry
`ix_additional_card_options_card_id` from `a45d60514c16:26-31`. On SQLite the
column drop rebuilds the table, and `b7c1e4a90d22:124-149` documents by
experience that the rebuilt table came back with **no indexes even though
`copy_from` declared them**, while Postgres altered in place and kept every one —
so recreating unconditionally failed on Postgres with `DuplicateTable`. Reuse that
migration's inspector guard verbatim: read
`sa.inspect(op.get_bind()).get_indexes(...)` and create only what is missing. It
is idempotent, so it is correct whether the index survived or not.

**Reversibility: the non-rename is cheap to revisit** (the guard tells you when).
**Dropping `fee_cents` is one-way for data**, which is why it is gated on the
count query; it is trivially reversible as schema.

### D4 — Identity: the market goes in the slug, as a suffix, and US is unsuffixed by grandfathering

**Call.** `market_code` `CA` gets slugs ending `-ca`: `amex-platinum-ca`,
`amex-gold-ca`, `rbc-avion-visa-infinite-ca`. US keeps its existing bare slugs.
The rule is expressed as data — `markets.json`'s `slug_suffix` flag — so US is a
registry entry rather than a special case in code.

Rejecting the compound-unique-constraint alternative is not a close call, and the
decisive factor is the two analytics tables rather than anything in the frontend.
`page_views.card_slug` and `card_feedback.card_slug` hold production rows, the
latter inside `UniqueConstraint("session_id", "card_slug")` (`db_models.py:669`),
and both are deliberately loose strings rather than foreign keys. The reason they
are loose is written into their own docstrings (`db_models.py:509-516`,
`:638-645`): a slug is already globally unique, so the tracking hot path can
store one without a catalog lookup. **A market dimension outside the slug
invalidates the premise those two tables were built on.** That argument is
structural and will still hold in two years, whereas every frontend objection
below is ultimately about code that could be changed.

The rest, in descending order of weight. A `UNIQUE(slug, market_code)` would also
have to be threaded through the `/cards/:id` route and every indexed URL,
`CardModel.secured_variant_id` (a plain unique slug string, deliberately not an
FK), `points_pool_id` peer matching, the card JSON filename (pinned to the id by
`test_catalog_files.py`), the `CLASSIFICATION` key (a flat
`Record<string, Classification>`), and the card art filename — `cardImages.ts`
globs one flat directory `../assets/cards/*.{...}` and derives the id from the
filename stem alone, so there is no second key available at that layer. That last
one is real but is the weakest of the six: it is ten lines of code and a nested
directory would solve it. Suffixing the slug requires **zero** changes to any of
them:
`amex-platinum-ca.webp` sits in the same flat art directory,
`"amex-platinum-ca": { group: "personal" }` sits in the same flat table,
`/cards/amex-platinum-ca` matches the same `/cards/:id` rewrite, and
`test_catalog_files.py` keeps passing unmodified. The whole identity problem is
solved by naming discipline plus a pin.

Suffix rather than prefix: `CLASSIFICATION`'s own comment records that the
`{issuer}-{brand}-{type}` id convention is what makes the table a restatement
rather than a guess. A `ca-` prefix breaks issuer-leading ordering and scatters
each issuer's cards across the table; a `-ca` suffix keeps `amex-platinum` and
`amex-platinum-ca` adjacent everywhere the ids sort.

US being unsuffixed is an artifact, and should be recorded as one rather than
rationalised. Migrating the 109 existing slugs to `-us` would mean 109 URL
redirects on indexed pages, 109 art renames, 109 `CLASSIFICATION` key edits, and
rewriting slug history in `page_views` and `card_feedback`. Not worth symmetry.

**Ships with two pins, and the order matters because only one of them actually
closes the failure.**

The failure: a Canadian card authored as `amex-platinum` does not collide
loudly. It is a second file whose id equals an existing slug, and `upsert_card`
looks up `filter_by(slug=data["id"])` (`upsert.py:157`), so the two files
overwrite each other's row. Precisely what happens, corrected from an earlier
draft of this paragraph that said "alternating by glob order": `select_files` does
`sorted(glob.glob(pattern, recursive=True))` (`seed_catalog.py:55`), so the
alphabetically-last matching path wins **deterministically on every boot**. A
stable wrong answer is harder to notice than an alternating one, not easier. And
`seen_slugs` is a set (`seed_catalog.py:97`), so the run prints "seeded 110 cards"
while 109 rows exist, with nothing in the repo comparing those two numbers —
`CARDS_AUDITED` counts files, not rows.

- **Pin 1, and it is the one that closes this: every card file's `id` is unique
  across the whole catalog.** No such test exists today —
  `test_catalog_files.py` compares each file's `id` to *its own* stem
  (`test_every_card_file_is_named_after_the_id_inside_it`), which is a per-file
  check, so two files in different issuer directories may share an id and every
  test passes. This pin is correct independently of whether the suffix convention
  survives, and it also catches a US/US collision, which no convention check
  would.
- **Pin 2, the suffix conformance check**, driven off the registry rather than a
  hardcoded list: every card file's id ends with `-{code.lower()}` when its
  market's `slug_suffix` is true, does not when it is false, and no id in a
  non-suffixed market ends with a token that is a registered market code. This is
  a *convention* check. On its own it would miss two CA files sharing an id, and
  it is what makes D9's market-from-filename derivation sound.

**Reversibility: one-way in practice.** Once a Canadian slug is published and
indexed, changing its shape is a URL migration. This is the decision in this ADR
to get right first.

### D5 — Points pooling: market-scoped pool ids, enforced by a catalog pin. No `loyalty_programs` market dimension.

**Confirmed against the code, not assumed.** `effectiveCppFor`
(`topPickCategories.ts:352-362`) keys on `card.points_pool_id`, filters
candidates on `c.points_pool_receiver`, and returns `card.best_cpp` unchanged
unless `applyPointsPooling` is true. `TopPickPage.tsx:401` passes
`applyPointsPooling: selectedIds.size > 0`. The whole-catalog default ranking
never pools. The framing recorded in prior memory holds for a real second market.

**Measured exposure for Canada specifically: zero cards.** All 8 cards carrying
a `points_pool_id` belong to Chase and Citi, and neither issues consumer cards
in Canada. So cross-market pooling is not reachable at Canadian launch at all,
and remains unreachable until someone authors a `points_pool_id` on a Canadian
card — plausibly an Amex Canada Membership Rewards pool or a Scotiabank Scene+
pool. This is a bug to make structurally impossible now, while it costs nothing,
not a bug to fix.

**Call.** Pool ids carry the market: `chase-ultimate-rewards-transferable-us`,
`citi-thankyou-points-transferable-us`. Rename the existing two now. Measured
footprint: **10 files — 8 card files plus two test files** that contain the
literal strings (`frontend/tests/utils/topPickCategories.test.ts` and
`frontend/tests/pages/TopPickPage.test.tsx`, both self-contained fixtures). No
migration, because `points_pool_id` is repopulated from JSON by `seed_catalog` on
the next boot and nothing outside the catalog keys on it. Doing it now means the
convention has no grandfathered exception, unlike slugs, where indexed URLs
forced one.

**The guard is the point, and it is stronger than the convention.** Add a catalog
test: no `points_pool_id` value appears on cards of more than one market. That
makes cross-market pooling unreachable regardless of whether a future author
remembers the suffix, and it fails on the authored data rather than on ranking
behaviour, so it does not depend on `applyPointsPooling` being wired a particular
way. A suffix convention alone would be a policy sentence.

**Why a test rather than a database constraint, stated properly.** Two reasons,
and the second is the one that matters. First, the predicate is cross-row — it
asks whether a value appearing on this card also appears on a card of another
market — and no CHECK constraint can express that. Second and more important:
the database is a derived read model, so a constraint there would fire at boot,
inside `upsert_card`, in the `except IntegrityError` path at `upsert.py:352` that
exists for the deploy-transition race and recovers by re-reading the row. The
violation would be swallowed or resurface as an unrelated `NoResultFound`. The
invariant lives in the authored files, so the check belongs where the files are
read. The pin is not the weaker layer standing in for a constraint; it is the only
layer that reports this correctly.

**No market dimension on `loyalty_programs`, and the reason is that nothing
computes across a program row.** `LoyaltyProgram` carries `name`,
`program_type`, `is_transferable`. Verified: `best_cpp` is derived per card from
`redemption_options` (`services/cards.py:259`), not from the program, so a
Membership Rewards Canada card carries its own Canadian valuation with the
program row shared. Transfer partners live per-card in `card_transfer_partners`
with the ratio and notes on the edge, so MR Canada's Aeroplan-and-British-Airways
partner set and MR US's set are already separate data. `is_transferable` is OR'd
across cards (`_mark_transferable`), and both MR pools are transferable, so
sharing produces no wrong value. The only shared consequence is that
`summaryTags` emits `card.points_program` as a filter chip label, and both
markets' MR cards would show a "Membership Rewards" chip — correct inside a
market-scoped view, which is what D6 makes them.

Author `points.currency` identically in both markets where the program brand is
genuinely the same. Note for whoever authors it that `loyalty_programs` is a
name-deduped bucket rather than a curated registry, and already carries
near-duplicates: `ThankYou Points` and `ThankYou® Points` are two rows, as are
`Ultimate Rewards` and `Ultimate Rewards (cash back)`. Adding market variants by
string would deepen that; do not.

**Reversibility: cheap.** A `loyalty_programs` market column later is one
migration plus a re-seed. Revisit it only if a *transfer partner or valuation*
question needs it — never because of ranking behaviour, which is settled here.

### D6 — Valuations and rankings are per-market data, and the catch is the category lexicon, not `best_cpp`

**Call on valuations: per-market authored data, no shared-defaults-with-overrides
machinery, because there are no shared defaults to override.** Verified:
`credits[].default_value` is authored per credit per card; `BENEFIT_TIERS` in
`upsert.py:41` carries only the three tier codes, labels and sort order, and no
values. `best_cpp` is derived per card from that card's own authored
`redemption_options`, taking the option the author flagged `best: true` rather
than the maximum (`services/cards.py:259` — the max-based version was ranking 16
of 109 cards at their aspirational sweet spot, and a regression test now pins
this). So Canadian cards get Canadian numbers authored from Canadian prices as a
natural consequence of the existing content model. Zero schema change. Adding an
override layer would create a second source of truth for a value that has
exactly one.

Two things do need adding. A per-market methodology statement, because
`/methodology` currently describes US valuation assumptions as *the*
assumptions. And a pin that `default_value <= max_annual` per credit, which I
could not find in the existing tests and which becomes materially easier to get
wrong when the author is estimating realistic capture in an unfamiliar retail
market.

**Call on rankings: `topPickCategories.ts`'s matchers become market-scoped
lexicons, and the `BRAND_EXCLUDES` gap is the load-bearing part.** 38 US brand
tokens are hardcoded across `CATEGORY_MATCHERS`, `WHOLESALE_EXCLUDES` and
`BRAND_EXCLUDES`. Most are additive and harmless to leave — a Canadian grocery
rate reading "Loblaws, No Frills, Metro" simply will not match
`/grocery|groceries|supermarket|whole foods/i` on the brand tokens, but it
almost certainly contains the word "grocery" and matches anyway. The category
matchers mostly work on generic nouns, and the brand tokens are a long tail.

`BRAND_EXCLUDES` is different in kind and must be populated before the first
Canadian co-brand ships. Its job is to stop a single-airline or single-hotel rate
from winning a broad category row, and the comment says so explicitly: "a
United-flights-only 11x doesn't mean 11x on any airline". Its
`SINGLE_AIRLINE_BRAND` regex names four US carriers. An Air Canada or WestJet
co-brand's Aeroplan-portal rate would win "Flights" outright. `SINGLE_HOTEL_BRAND`
names five chains and misses Fairmont. `SINGLE_RIDESHARE_BRAND` names Uber and
Lyft, which is probably sufficient in Canada.

The 14 category strings naming the U.S. explicitly ("U.S. supermarkets", "U.S.
gas stations") are correct data about US products and must not be edited; they
just mean the matchers cannot assume a market from the category text. The market
comes from the card.

**Reversibility: cheap.** These are regexes with a test file that drives them
against real category strings from the catalog. Extend the existing
`it.each(cases)` table with Canadian strings and the coverage question answers
itself.

### D7 — Routing: path prefix `/ca`, US at the root, hreflang on static routes only

**Call.** `/ca/`, `/ca/top-picks`, `/ca/compare`, `/ca/methodology`,
`/ca/issuer/{slug}`, `/ca/cards/{id}`. US stays unprefixed. One Render service,
one build, one prerender pass, one sitemap.

Rejecting subdomain and ccTLD on a single deciding factor: this site launched in
August 2026 and has one domain's worth of accumulated authority.
`ca.thewalletaudit.com` or `thewalletaudit.ca` each start a separate authority
pool and require a second Render static service with its own build and its own
prerender run, because Render static sites do not do host-based routing within
one service. A path prefix also keeps `canonicalUrl(path)` a single function over
a single `SITE_URL`, which is what its docstring's guarantee rests on — that the
runtime tag, the prerendered tag and the sitemap "cannot drift into three
opinions about one URL". Introducing a host dimension weakens exactly that.

Two concrete consequences, both verified in the repo:

- **`render.yaml` needs 6 more rewrite rules** (`/ca/cards/:id`,
  `/ca/issuer/:slug`, `/ca/compare`, `/ca/top-picks`, `/ca/methodology`, `/ca`).
  `:param` matches one segment, so `/ca/cards/:id` at three segments cannot
  collide with `/cards/:id` at two. But `routeMeta.test.ts` asserts
  `expect(sources.length).toBeLessThan(10)` — that bound becomes 12 and the
  assertion fails. It must become a per-market bound (roughly
  `5 * markets + 1`), not simply be raised, because the number exists to stop a
  return to the 122 enumerated rules Render never applied.
- **No edge geo-redirect is available.** `render.yaml` records that the frontend
  domains are DNS-only on Cloudflare (grey cloud) since 2026-08-07, because
  free-plan JS Detections cost ~2.8s of mobile CPU per page; only
  `api.thewalletaudit.com` stays proxied, for `CF-IPCountry`. So the static HTML
  is served with no country header and cannot be redirected at the edge.

Given that, **never auto-redirect by geography.** The URL prefix is
authoritative, market selection is an explicit in-app switcher persisted in
localStorage, and a first-time visitor may be *offered* their likely market
(the API can see `CF-IPCountry`) but never moved. Auto-redirecting is bad for
crawlers, breaks a shared Canadian link opened in the US, and would hide US cards
from a Canadian who wants to read about them.

**hreflang, and this is the call most likely to be gotten wrong: card and issuer
pages are not alternates.** `hreflang` asserts "same content, different locale",
which licenses a search engine to substitute one for the other. `amex-platinum`
and `amex-platinum-ca` are different products with different fees, credits and
terms. Declaring them alternates invites Google to show a Canadian the US fee.
So:

- hreflang pairs on the four static routes only: `/` ↔ `/ca/`, and the same for
  `/top-picks`, `/compare`, `/methodology`. `en-US`, `en-CA`, and `x-default`
  pointing at the US root.
- Card and issuer pages: self-referencing canonical, no hreflang. They are
  distinct documents about distinct products, not translations.

Sitemap: keep the single `public/sitemap.xml`. Multi-locale URLs in one file is
valid, and a sitemap index is premature below 50,000 URLs.

`fr-CA` is out of scope here and is **not** merely a translation task. Quebec's
language law and Quebec's own consumer-protection regime are part of D9's gate,
and whether a French-language version is optional or mandatory for a
consumer-credit site addressing Quebec is a question for counsel, not for this
document.

**Reversibility: moderate, and the ordering matters.** Adding a prefix to a
root-only site is additive and cheap. Moving later from prefix to subdomain or
ccTLD is a redirect migration — expensive but not one-way. Doing it in the other
order is not possible cheaply. Prefix first is the reversible sequence.

### D8 — `routeMeta.js` becomes market × route, and the prerender guarantee is preserved by an output-side assertion

**Call.** `routeMeta.js` imports the market registry, `SEO_ISSUERS` grows a
`market` field, `STATIC_ROUTE_META` becomes per-market, and `allRouteMeta(cards)`
groups cards by their own `market_code` and emits prefixed paths.

The `SEO_ISSUERS` ↔ `ISSUERS` drift pin in `routeMeta.test.ts` is whole-array
equality in both directions, so adding a third field to both sides keeps the pin
working with no change to the assertion. That is the pattern working as
designed — note it, and copy it for anything new.

**But that pin is not sufficient here, because `market` on `SEO_ISSUERS` is a
third copy.** Issuer market membership would then exist in `cards.market_code`
(authored), in `ISSUERS` (if it gains the field), and in `SEO_ISSUERS`. The
existing whole-array pin compares `SEO_ISSUERS` to `ISSUERS` and **neither of them
to the catalog** — the two can agree with each other and both be wrong, which is
exactly why `routeMeta.test.ts` already carries a separate
`ISSUERS vs. the real card catalog` block checking `issuerField` against the card
files in both directions. Extend that block, not the first one: assert each
issuer's declared `market` equals the market of that issuer's cards on disk. Same
shape as the test already there, and it is the only one of the three that is
grounded in authored data.

**Preserving `prerender.mjs`'s fail-on-generic guarantee through the
multiplication.** Today `applyMeta` asserts all 7 of its swap patterns matched
and throws otherwise, and `routeMeta.test.ts` independently asserts
`index.html` still ships each of those 7 tags. Two new per-route tags are needed
and they behave differently:

- **`<html lang="...">`** is in the shell (`frontend/index.html:2`, hardcoded
  `lang="en"`), so it becomes an 8th asserted swap and inherits the guarantee
  directly. Add it to the mirrored list in `routeMeta.test.ts` too.
- **hreflang links are not in the shell**, so they would be *appended*, the way
  canonical already is at `prerender.mjs:96`. An append has no
  fail-if-missing assertion, and that is precisely the hole.

Close it on the output side rather than the input side: after writing, assert
that every emitted file contains exactly the hreflang set its route should have
(the pair for a static route, none for a card or issuer route), that
`written` equals the expected route count per market, and that no emitted file
still carries the shell's placeholder title. An outcome assertion is the right
control type here for the same reason it was in ADR 0001 — it does not depend on
the mechanism staying shaped the way it is today, so it survives a refactor of
`applyMeta`.

**Also in scope: `CARDS_AUDITED` and `LAST_AUDITED` become per-market.** The
audit-honesty half of this was fixed in commit `e22d325` by splitting the footer
copy into two independent claims (see Context). What multi-market adds is a scoping
problem the fix does not address: `countCardFiles()` counts every market's files,
and `LAST_AUDITED` is one global date. So the count becomes per-market — and the
pin keeps deriving from the file count only because the two claims are separate
sentences, which `routeMeta.test.ts` now records as a condition — and each market
gets its own audit date, seeded `null` for Canada until a Canadian full pass has
actually run. Not the US date, and not today's date. A market with no audit date
renders no audit claim at all, which is the only value that cannot be mistaken
for evidence.

**Reversibility: cheap.** Build-script shape, fully re-derivable.

### D9 — Regulatory posture is a gate, and it is enforced by `markets.status`

**Call.** Canadian consumer-credit promotion and the operation of a
comparison/referral service in Canada require qualified Canadian legal advice
before any Canadian card is authored or published. This is a gate, not a task.
I am not drafting compliance language and am not estimating what the rules
require.

Naming the areas counsel needs to cover, without asserting their content:
federal cost-of-borrowing disclosure obligations applying to federally regulated
issuers; provincial consumer-protection and cost-of-credit disclosure
requirements, which differ province to province; Quebec's separate consumer
protection regime and its language requirements; and — separately from anything
about wording — whether operating a card comparison or referral service is
itself a registrable or licensed activity in any province. The answer can change
which fields are mandatory on a Canadian card, what must appear alongside every
rate, and whether the market is viable at all. Which is exactly why it precedes
content work rather than accompanying it.

**The gate is mechanical, because the failure is a publish.** `markets.json`
carries `status: draft | published`, Canada starts `draft`, and both catalog
readers exclude draft-market cards:

- `seed_catalog`'s `select_files()` (`seed_catalog.py:47-62`).
- `loadCards()` in `frontend/scripts/routes.mjs`, which already has the exact
  one-line `continue` this needs at line 32, or a draft-market card gets a
  prerendered page and a sitemap entry.

That second bullet is not hypothetical symmetry. It is the precise pair of bugs
PR #192 fixed for `staging/`: a *valid* draft was silently published to the live
catalog on the next API boot, and an *incomplete* one broke the boot.

**The filter must be a pure path predicate, and the market suffix is what makes
that possible.** An earlier draft of this decision said `select_files()` would
"exclude cards whose market is not published, exactly as `is_staged()` already
excludes `staging/`". That analogy does not hold, and the reason is worth stating
because it is the trap: `is_staged` is a pure path predicate
(`seed_catalog.py:44-45`) with no I/O and no schema knowledge. Reading a
*card field* would force `json.load` of every file **inside** `select_files`,
ahead of the per-file error handling at `seed_catalog.py:86-95`. A malformed file
would then raise a bare `JSONDecodeError` with no path in the message, instead of
the existing `error: {path} does not match the Card schema`. That is the
boot-breaking half of PR #192 reintroduced one function earlier and with a worse
message. It would also make the exit at `seed_catalog.py:57-61` lie: if every
matched file happened to be in a draft market, the process would exit claiming
every file is under `staging/`.

So the predicate reads the **filename**, which D4 has already made
market-bearing:

```python
def market_of(path: str) -> str:
    """Pure path predicate, like is_staged. Reads the registry once, never a card file."""
    stem = Path(path).stem
    for code in SUFFIXED_MARKET_CODES:      # from markets.json
        if stem.endswith(f"-{code.lower()}"):
            return code
    return UNSUFFIXED_MARKET               # the single market with slug_suffix false
```

No per-file I/O, no nesting change, and it composes into the existing list
comprehension at `seed_catalog.py:56` alongside `is_staged`. "No suffix means the
unsuffixed market" is not an unwritten default doing a proxy's job — it is D4's
convention read in the other direction, stated once in the registry, and pinned
from both ends by D4's two pins plus D1's `market_code`-equals-derived-market pin.
Three consequential edits follow: the `:57-61` exit message must name *which*
filter emptied the list rather than assuming `staging/`; `select_files` is the
function the boundary test drives, per `test_seed_catalog_boundary.py`'s own
recorded rule that an earlier draft of it reimplemented the filter and passed
against a mutated seeder; and note that `JSON.parse` at `routes.mjs:36` has no
`try/catch`, so a malformed card file there fails the frontend build with no
filename either — pre-existing, worth fixing in the same pass, not caused by this.

**Rejected: putting draft-market cards under their own directory** so the
existing path predicate generalises over it. Attractive, and it was the first fix
proposed, but it breaks five one-level catalog walkers on the Node side —
`routes.mjs:29-38`, and three in `routeMeta.test.ts`, and one in
`cardTaxonomy.test.ts` — each of which does `readdir(CARDS_DIR)`, treats every
entry as an issuer directory, and reads `.json` files exactly one level down.
The Python side would be fine (all three of its walkers glob `**/*.json`
recursively). The Node failure is silent: `readdir` finds `ca/`, then `amex`
does not end in `.json`, so it is skipped with no error and Canadian cards stay
invisible to the sitemap and prerender *after* the market is published. The
variant that avoids the extra nesting level — encoding the market in the issuer
directory name — contradicts a stated design position: `cardTaxonomy.test.ts`
records that `cards/{dir}/` matching `ISSUERS[].slug` is "a coincidence this test
has no business freezing", so directory names are deliberately not semantic.

The market-agnostic plumbing — the registry, the `market_code` column, the slug
convention, the pool-id pin, the formatter, the routing rules — is not
Canada-specific and does not need to wait. Anything that authors or publishes a
Canadian card does.

**Reversibility: not a code decision, so not applicable. The `status` flag is
cheap.**

---

## Consequences

**Easier.**

- Adding market three is mostly a registry entry, a prefix, a slug suffix and
  content. The expensive decisions are made once here.
- Card art, `CLASSIFICATION`, `/cards/:id`, `secured_variant_id` and both
  analytics tables need no change at all, because the market is inside the slug.
- For the same reason, **card detail is market-scoped for free**: `get_card()`
  (`services/cards.py:283`) and `get_cards()` (`:304`) filter by slug, and a slug
  now names exactly one card in exactly one market, so neither function changes.
  Only `get_card_summaries()` (`:332`), which returns everything, needs the new
  `WHERE`. One query to scope, not three.
- The rebuildable-database property is untouched. Every storage change in this
  ADR is a migration plus a re-seed; nothing is authored into the database.
- Cross-market points pooling becomes structurally unreachable rather than
  merely unlikely, and the guard is on authored data, so it holds regardless of
  future ranking changes.
- Two latent defects get closed as a side effect. `BRAND_EXCLUDES` stops being a
  US-only list inside a guard that is supposed to be general. And card `id`
  uniqueness across the catalog gets a pin, which it has never had — today two
  files in different issuer directories can share an id, and the
  alphabetically-last one wins silently on every boot. Neither is caused by
  multi-market; both are found by it.

**Harder.**

- `topPickCategories.ts` stops being one lexicon and becomes a lexicon per
  market. Its test file's `it.each` table grows the same way.
- **Adding any card field is now a four-file change, and one of the four is
  unpinned.** `backend/models.py`'s `Card` is both the authored-content schema and
  the API response model, so a field has to be added to `models.py` (both `Card`
  and `CardSummary`), `upsert.py`, `services/cards.py` (both `_to_card` and
  `_to_card_summary`, each of which passes an explicit kwarg per field), and
  `frontend/src/types/cards.ts`. Only the first is pinned by
  `test_catalog_schema.py`; the TypeScript side is pinned by nothing at all. This
  is not created by multi-market — it is true today — but multi-market is the
  first change to add two fields at once, and an optional field forgotten in this
  chain fails silently.
- Every listing surface needs market scoping. `get_card_summaries()` currently
  returns every active card with no filter (`services/cards.py:332-339`), and
  `groupCardsForPicker`, `filterByIssuers` and `computeTopPicks` all operate on
  whatever list they are handed. Market scoping belongs at the boundary that
  fetches, so each surface keeps taking a plain list.
- `render.yaml`'s rule count grows per market and its test bound has to grow
  with it deliberately rather than by being relaxed.
- `card-verifier` inherits an unmapped set of issuers. Six of nine existing
  issuers needed a documented workaround to be fetchable at all, and Canadian
  terms documents may additionally be geo-gated from US-hosted infrastructure —
  `card-verifier` already lists geo-blocked as an Unverified reason, and
  `keep-warm.yml` documents that GitHub Actions runners get bot-challenged even
  by this project's own Cloudflare zone.

**No longer possible.**

- Ranking or comparing cards across markets. D2 forbids currency conversion,
  which makes a mixed-market ranking meaningless rather than merely awkward.
  This is a deliberate narrowing, and it is the honest one: the product's claim
  is that its numbers come from issuer terms.
- A single global "cards audited" or "terms as of" claim.
- Treating `cards.slug` as a bare product identifier. It is now a product
  identifier scoped by market, and the suffix is load-bearing.

**Capacity, stated plainly, because a market plan without it is not a plan.**

ADR 0001 measured the real catalog: a 37/42/30 split across 30/90/180-day
re-verification intervals, steady-state demand of 1.87 verifications/day, and a
cap of 4/day chosen because 3/day allowed 11 days of slip. That ADR is still
`proposed` and unimplemented — there is no `backend/refresh/` module and no
refresh workflow in `.github/workflows/` — so today's actual mechanism is a human
doing full-catalog passes, most recently the September 2026 audit.

Scaling ADR 0001's own model: a Canadian catalog of roughly 100 cards (big-five
banks plus Amex Canada plus Capital One Canada, estimated, not researched) takes
the catalog to ~209 and steady-state demand to ~3.6/day. That is 90% of the cap
ADR 0001 proposed, leaving ~0.4/day of spare capacity, which means **draining
100 new cards through the first-pass queue would take on the order of 240 days**
against the 28-day first pass ADR 0001 measured for 109. ADR 0001 explicitly
says to recompute past roughly 200 cards; a full Canadian lineup *is* that
trigger condition. Note this is a projection from ADR 0001's model, not a fresh
simulation — the real tier split for a Canadian lineup depends on its fee
distribution, which does not exist yet.

The conclusion is not "raise the cap". It is that **Canada must launch phased,
sized to re-verification capacity rather than to market coverage**, and that
either ADR 0001 ships first or the manual audit cadence is what is being
committed to.

**Phase 1 recommendation: Amex Canada only, estimated 12-15 cards.** One
recommendation, and the deciding factor is that it is the only candidate that
exercises every decision in this ADR at minimum authoring cost. It is a
dual-market issuer, so `amex-platinum-ca` beside `amex-platinum` tests the slug
collision that matters (same product name, genuinely different fee and credits).
Membership Rewards Canada tests D5's shared-`loyalty_programs` call. Amex's
source route is already mapped and its pathology documented, so the *authoring*
cost is the lineup rather than the lineup plus a discovery effort — which is not
true of any Canadian-only bank. It also adds ~0.25/day of steady-state
verification demand rather than ~1.7/day, which fits under the existing cap with
room. Phase 2 onward is one Canadian-only issuer at a time, each gated on its
source route being mapped and recorded in `card-verifier`'s memory the way the
existing nine are.

---

## Migration path

**The `country` column can be added additively without disturbing existing US
data, and in one statement rather than three.**

```python
op.add_column("cards", sa.Column(
    "market_code", sa.String(), nullable=False, server_default="US",
    # see the caveat below before copying this line
))
op.create_index(op.f("ix_cards_market_code"), "cards", ["market_code"])
```

Not nullable-then-backfill-then-`ALTER ... NOT NULL`. SQLite cannot alter a column
to NOT NULL, so that sequence needs `batch_alter_table` on `cards` — which
rebuilds a table carrying `ck_card_verdict_status` (`db_models.py:91-93`), a CHECK
that SQLAlchemy **cannot reflect from SQLite**, plus two unique constraints and
three FK indexes from `a45d60514c16`. That is the most expensive migration pattern
in this repo, and it is entirely avoidable: `93fb9fe16594:26` records that the
"NOT NULL needs a `server_default`" hazard applies *only* when adding a column to
an existing table, which is exactly this case. Four precedents do it this way
already — `be0291c77f0a:27`, `4fa0da85f81c:30`, `b1a8a02ceab5:30`, and
`b7c1e4a90d22:161` (`respondent_type`, `server_default="holder"`, on a table whose
every existing row needed the same value). No batch mode, no rebuild, no CHECK or
index loss, no separate backfill step, and the column is valid in the window
between `alembic upgrade head` and `seed_catalog` that `render.yaml:25-27` creates.

**Caveat, measured rather than assumed.** No migration in this repo has ever added
a *foreign key* column to an existing table, and SQLite rejects `REFERENCES`
combined with a non-NULL default when foreign keys are enforced. Tested on a fresh
in-memory SQLite (lib 3.45.3):

```
PRAGMA foreign_keys=OFF : ACCEPTED, the existing row reads 'US'
PRAGMA foreign_keys=ON  : REJECTED, OperationalError:
                          "Cannot add a REFERENCES column with non-NULL default value"
```

It works because `alembic/env.py` builds its own engine (`engine_from_config`,
line 60) and never sees the `PRAGMA foreign_keys=ON` listener that
`backend/db.py:61-64` attaches to *its* engine. So this depends on a split that
exists for unrelated reasons. Record it in the migration's docstring: **if
`alembic/env.py` ever enables `foreign_keys`, this migration breaks on a fresh
SQLite chain and must move to the nullable-then-batch-alter form.** Postgres has
no such restriction (not tested here; standard `ALTER TABLE ... ADD COLUMN ... NOT
NULL DEFAULT ... REFERENCES` is valid). The same measurement also showed that with
foreign keys off, a bad value such as `'CAN'` is accepted outright and only
`PRAGMA foreign_key_check` finds it — which is the second reason D1 puts the real
validation in Pydantic rather than relying on the FK.

Steps, in order. Steps 1-7 are market-agnostic and are not behind D9's gate.

1. **Registry, seeding, and the gate.** Add `backend/data/markets.json` with US
   `published` and Canada `draft`. Seed the `markets` table **inside
   `seed_catalog()`, before the card loop**, get-or-created by `code` so re-seeds
   are idempotent, exactly as `ensure_benefit_tiers()` (`upsert.py:112-121`) is
   called from the top of `upsert_card`. This matters: `render.yaml:25-27` is
   `alembic upgrade head && seed_catalog && uvicorn`, so on a fresh Postgres an
   empty `markets` table would send the very first `upsert_card` into the swallowed
   `IntegrityError` path at `upsert.py:352`. If it is instead a third command in
   the `startCommand` chain, say so explicitly and update `render.yaml` in this
   step — what must not happen is that nobody decides.
   Then add the D9 filter: `market_of()` in `seed_catalog.py` composed into
   `select_files`, the matching `continue` in `loadCards()` (`routes.mjs:32`), the
   corrected `:57-61` exit message, and boundary tests that **drive the real
   `select_files`** rather than reimplementing its filter. Lands before anything
   can author a Canadian card, and being suffix-based it needs no card field, so
   it is correct before step 2 exists.
2. **`market_code` across all four layers.** This is the step most likely to be
   done half-way, because `backend/models.py`'s `Card` is *two things in one
   class*: the authored-content schema and the API response model. The same trap
   `CLAUDE.md` documents between content and storage field names exists one layer
   up, between authored input and serialised output. A field is not added until all
   four are done:
   - `models.py` — `Card` **and** `CardSummary`, plus the D1 registry validator.
   - `upsert.py` — the assignment, alongside the block at `:180-243`.
   - `services/cards.py` — **`_to_card` (`:98`) and `_to_card_summary` (`:218`)**.
     Both build their model with an explicit kwarg per field, so a missing one is
     not inherited from anywhere. For a *required* field this raises
     `ValidationError` and 500s `GET /api/cards/:id`, which at least fails loudly
     in CI.
   - `frontend/src/types/cards.ts` — on `CardBase` (`:34`), inherited by
     `CardSummary` (`:106`) and `Card` (`:213`). Pinned by nothing: the only
     Pydantic↔TypeScript pin in the repo is `test_liked_feature_options.py`, and
     it covers `LIKED_FEATURES` only. Forget this file and every consumer reads
     `undefined` with a green build.

   Plus `"market_code": "US"` in all 109 card files and the migration above. One
   commit, because `Card` ignores extra keys and `test_catalog_schema.py` is what
   surfaces a mismatch.
3. **Identity and issuer pins.** Three tests, in this order:
   (a) every card file's `id` is unique across the whole catalog — the pin that
   actually closes D4's failure, and which does not exist today;
   (b) D4's suffix-conformance check, driven off `markets.json`;
   (c) every issuer's cards share one market (D1) — the one that stops
   `amex-platinum-ca` silently attaching to the US `American Express` issuer row
   via `_get_or_create` at `upsert.py:127-129`.
   Also (d) the `market_code`-equals-derived-from-id pin that D1 owes for keeping
   two copies. All four pass trivially with one market, which is the point: they
   are in place before the first Canadian file exists.
4. **Pool ids.** Rename the two existing values to `-us`: 8 card files plus two
   test fixtures (`topPickCategories.test.ts`, `TopPickPage.test.tsx`). No
   migration; the column is repopulated by the next boot. Add the
   one-market-per-pool-id pin.
5. **`_cents` gate and `fee_cents` drop.** Add the D3 guard test, firing
   unconditionally on `currency_minor_exponent != 2` and naming all nine
   arithmetic sites in its message. Run the `fee_cents IS NOT NULL` count, confirm
   0, drop the column. `additional_card_options` has no CHECK constraint so that
   hazard does not apply, but it does carry `ix_additional_card_options_card_id`
   (`a45d60514c16:26-31`) and the SQLite rebuild returns without indexes even when
   `copy_from` declares them — reuse the inspector guard at
   `b7c1e4a90d22:124-149`. The reference for all of this is
   `b7c1e4a90d22_card_feedback_interested_respondents.py`: docstring lines 10-22
   for unreflectable CHECKs, `_table()` for the `copy_from` pattern,
   `_recreate_indexes()` for the guard. Plus `0ebfeee4e39d:24-33` for batch mode
   on `cards` specifically, and `93fb9fe16594:26` for the NOT NULL rule.
6. **Currency and formatter.** Add `currency_code: str | None = None` and the
   column, through the same four layers as step 2 — and here the discipline
   matters more, not less, because `None` is a *legal* value. A missed
   `_to_card_summary` or a missed `types/cards.ts` does not raise; the API returns
   `null` forever and the build stays green, on the one field whose job is to stop
   a USD figure being labelled CAD. Add D2's two-clause override pin. Replace the
   48 hardcoded `$` sites and `crawlableBody.mjs:63`'s `money()` with one
   market-aware formatter. No card file changes: `None` is correct for all 109.
7. **Per-market footer claims.** `CARDS_AUDITED` becomes a per-market count and
   `LAST_AUDITED` a per-market date, with Canada's `null` until a Canadian pass
   runs and no claim rendered when it is null. Note this builds on the
   2026-09-26 copy split rather than replacing it, and keep the two claims in
   separate sentences — `routeMeta.test.ts` records that recombining them is what
   makes a file-count-derived pin dishonest.
8. **GATE — D9.** Canadian legal advice obtained and its conclusions recorded.
   Nothing past this point proceeds without it, and its output may change steps
   9-12.
9. **Routing and prerender, still with Canada `draft`.** Market-aware
   `routeMeta.js`, the six `render.yaml` rules, the `lang` swap as an 8th
   asserted replacement, the hreflang appends with the output-side assertion
   from D8, and the per-market bound replacing `sources.length < 10`. Extend
   `routeMeta.test.ts`'s existing `ISSUERS vs. the real card catalog` block to
   assert `SEO_ISSUERS[].market` against the market of that issuer's cards on
   disk — the `SEO_ISSUERS` ↔ `ISSUERS` pin compares the two copies to each
   other and neither to the catalog, so on its own it lets a third copy be
   consistently wrong. All of this is verifiable with an empty Canadian
   catalog, which is the cheapest place to find out it is wrong. Note
   `render.yaml`'s own warning that routing rules cannot be verified on a PR
   preview, because previews reuse the service's existing settings and never
   read the file.
10. **Category lexicon.** Populate `BRAND_EXCLUDES` for Canadian carriers and
    chains, extend `CATEGORY_MATCHERS` with Canadian retail and transit
    vocabulary, and extend the existing `it.each` case table with real Canadian
    category strings once Phase 1 cards exist.
11. **Phase 1 content.** Amex Canada, authored through `card-author` into
    `staging/`, promoted through the existing tty-gated queue. Market stays
    `draft`, so nothing publishes. Add `default_value <= max_annual`.
12. **Flip Canada to `published`.** One line in `markets.json`. Everything else
    is already in place and already tested.

**What happens to cards already in the catalog.** Two mechanical changes to all
109 files: `"market_code": "US"` (step 2) and, for 8 of them, the `-us` pool-id
suffix (step 4). No slug changes, no filename changes, no art renames, no
`CLASSIFICATION` key changes, no re-authoring of any money value. Nothing is
backfilled from a proxy: every US card is US because it is, and
`currency_code` stays `None` on all 109 because `None` means "the market's
currency" rather than "unknown".

**What happens to URLs already indexed.** Nothing. Every existing path keeps its
exact form, `canonicalUrl` keeps returning the same string for it, and no
redirect is introduced. This is the single strongest argument for the
US-at-the-root, US-unsuffixed asymmetry, and it is worth accepting the
inelegance to get it.

---

## Alternatives rejected

**`UNIQUE(slug, market_code)` with a market-free slug.** Revisit if card art
ever stops being addressed by filename — `cardImages.ts` globbing a flat
directory and deriving the id from the stem is the binding constraint, since
there is no second key available at that layer. Until then the compound key has
to be threaded through six places that only have room for one string, two of
which already hold production data.

**Gating the publish on a card *field* read inside `select_files()`.** Revisit
only if the market ever stops being derivable from the filename — that is, if
D4's slug suffix is abandoned. Rejected because it moves `json.load` of every
card file ahead of the per-file error handling at `seed_catalog.py:86-95`,
turning a malformed file from `error: {path} does not match the Card schema` into
a bare `JSONDecodeError` with no filename, and because it makes the exit message
at `:57-61` claim every file is under `staging/` when the real cause is a draft
market. See D9.

**Gating the publish on a directory, so the existing path predicate
generalises.** Revisit if the five one-level Node catalog walkers are ever
consolidated into one recursive helper — at that point this becomes the cleaner
option. Today it breaks `routes.mjs:29-38` plus three walkers in
`routeMeta.test.ts` and one in `cardTaxonomy.test.ts`, all of which read `.json`
exactly one level below `CARDS_DIR`, and it breaks them *silently*: the market
directory is skipped for not ending in `.json`, so published Canadian cards stay
absent from the sitemap and prerender with nothing failing. The
no-extra-nesting variant — encoding the market in the issuer directory name —
contradicts `cardTaxonomy.test.ts`'s recorded position that directory names are
deliberately not semantic.

**Adding `market_code` nullable, backfilling, then altering to NOT NULL.**
Revisit if `alembic/env.py` ever enables `PRAGMA foreign_keys`, which is the one
thing that would make the single-statement form fail on SQLite (measured; see the
top of the migration path). Rejected because it requires `batch_alter_table` on
`cards`, rebuilding a table whose `ck_card_verdict_status` CHECK SQLAlchemy cannot
reflect from SQLite, for no benefit over `server_default="US"`.

**A separate Canadian catalog, service and frontend.** Revisit if the
regulatory answer from D9 requires data or disclosures that cannot coexist in
one schema — a genuine possibility, which is why D9 precedes the schema work. On
technical grounds alone it buys isolation that `market_code` plus a published
flag already provides, at the cost of duplicating `seed_catalog`, the API, the
prerender, `CLASSIFICATION` and the whole test suite.

**Renaming `_cents` to a currency-neutral term now.** Revisit the moment
`markets.json` gains a market whose `currency_minor_exponent` is not 2 — but
revisit it as the smaller half of that job. The rename is cosmetic; the work is
the nine hardcoded `* 100` / `// 100` sites, which is why D3's guard fires on the
registry unconditionally rather than on the column names. A guard that a rename
could satisfy would be worse than no guard.

**A market dimension on `loyalty_programs`.** Revisit if a transfer-partner or
valuation question needs it — for instance if partner *ratios* need to be
program-level rather than per-card-edge. Not for ranking behaviour: D5 settles
that, and the mechanism is `points_pool_id`, which is authored on the card.

**Currency on the issuer.** Revisit never. A single issuer offers accounts in
more than one currency, which is the fact that kills it, and Canada has real
examples in the form of US-dollar-billed cards issued to Canadian residents.

**Subdomain (`ca.thewalletaudit.com`) or ccTLD (`thewalletaudit.ca`).** Revisit
when Canadian organic traffic justifies its own authority pool and its own
deploy, or if a geo-signal turns out to be worth more than consolidated
authority. The deciding factor today is that the site is one month past launch
with a single domain's authority; the deciding factor then would be measured
Canadian traffic. Both are reachable from a path prefix via redirects; the
reverse is not cheap.

**Auto-redirecting visitors to their geographic market.** Revisit never, on
three independent grounds: the frontend is DNS-only on Cloudflare so no edge
country header exists, it breaks shared links across the border, and it hides
content from someone deliberately looking for it.

**hreflang between a US card page and its Canadian namesake.** Revisit never.
They are different financial products with different fees. hreflang would
license a search engine to substitute one for the other, which is the single
worst failure this site could ship.

**Launching Canada broadly (big five plus Amex, ~100 cards).** Revisit once ADR
0001's pipeline is implemented and its cap re-measured against the combined
catalog. At 1.87 verifications/day today and ~3.6/day projected, a broad launch
consumes the entire budget ADR 0001 sized and stretches the first pass from
~28 days to roughly 240. Phase it.
