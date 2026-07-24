# Backend — card catalog database

The card catalog is a normalized relational schema (17 tables), not a single JSON
blob. This doc covers the schema shape, how data actually gets in, and how to add
or update a card.

## Why a database instead of one JSON file

`backend/data/cards.json` (a single ~750-line array) worked for four hand-written
cards, but doesn't scale: repeated strings with no integrity (issuer/network names
can drift between cards), no way to query across cards ("which cards have primary
rental coverage?"), one malformed brace breaks every card at once, and no path to
letting the catalog grow without a PR per edit.

## Schema

- **Reference/lookup tables** — `issuers`, `networks`, `loyalty_programs`,
  `benefit_tiers`, `coverage_types`. Shared across cards, get-or-created by name so
  "American Express" resolves to the same row for every card that uses it.
- **`cards`** — the core entity. One row per card.
- **Detail tables** — one per repeating block in the original data: `earn_rates`,
  `redemption_options`, `credits` (+ `credit_tips`), `insurance_benefits`,
  `status_perks`, `services`, `additional_card_options` (+ `_benefits`),
  `timeline_events`. Each has a `sort_order` column standing in for array position,
  and cascades on delete with its card.
- **`card_transfer_partners`** — junction table (card ↔ named transfer partner).
  Schema is ready but currently unpopulated for most cards — the source data only
  has aggregate counts (`transfer_airline_count`/`transfer_hotel_count` on `cards`),
  not an authoritative per-partner list with ratios. Populate this once a reliable
  per-partner source exists, rather than inventing entries.
- **`card_drafts`** — the review queue. Not part of the normalized schema itself;
  holds fetched-and-extracted card data pending human approval before it's promoted
  into the tables above.

```mermaid
erDiagram
    ISSUERS ||--o{ CARDS : issues
    NETWORKS ||--o{ CARDS : carries
    LOYALTY_PROGRAMS ||--o{ CARDS : "native currency"
    CARDS ||--o{ EARN_RATES : has
    CARDS ||--o{ REDEMPTION_OPTIONS : has
    CARDS ||--o{ CREDITS : offers
    BENEFIT_TIERS ||--o{ CREDITS : classifies
    CREDITS ||--o{ CREDIT_TIPS : has
    CARDS ||--o{ INSURANCE_BENEFITS : has
    COVERAGE_TYPES ||--o{ INSURANCE_BENEFITS : classifies
    CARDS ||--o{ STATUS_PERKS : grants
    CARDS ||--o{ SERVICES : includes
    CARDS ||--o{ ADDITIONAL_CARD_OPTIONS : offers
    ADDITIONAL_CARD_OPTIONS ||--o{ ADDITIONAL_CARD_BENEFITS : lists
    CARDS ||--o{ TIMELINE_EVENTS : records
    CARDS ||--o{ CARD_TRANSFER_PARTNERS : "transfers via"
    LOYALTY_PROGRAMS ||--o{ CARD_TRANSFER_PARTNERS : "target program"

    ISSUERS {
        int issuer_id PK
        string name UK
        string slug UK
        string logo_url
    }
    NETWORKS {
        int network_id PK
        string name UK
    }
    LOYALTY_PROGRAMS {
        int loyalty_program_id PK
        string name UK
        string program_type
        bool is_transferable
    }
    BENEFIT_TIERS {
        int tier_id PK
        string code UK
        string label
        string description
        int sort_order
    }
    COVERAGE_TYPES {
        int coverage_type_id PK
        string name UK
        string category
    }
    CARDS {
        int card_id PK
        string slug UK
        string name
        int issuer_id FK
        int network_id FK
        int points_program_id FK
        string accent_color
        int annual_fee_cents
        string effective_cost_label
        string verdict_status
        string verdict_text
        string earn_note
        string points_per_100k_label
        string points_note
        int transfer_airline_count
        int transfer_hotel_count
        string transfer_highlight
        string transfer_recent_changes
        string protection_note
        string rental_note
        string additional_cards_title
        string additional_cards_note
        bool is_active
        datetime created_at
        datetime updated_at
    }
    EARN_RATES {
        int earn_rate_id PK
        int card_id FK
        string emoji
        float multiplier_x
        string category
        bool is_highlight
        bool is_base
        int sort_order
    }
    REDEMPTION_OPTIONS {
        int redemption_option_id PK
        int card_id FK
        string method
        float cents_per_point
        bool is_best
        int sort_order
    }
    CREDITS {
        int credit_id PK
        int card_id FK
        string slug "unique with card_id"
        string name
        string subtitle
        int max_annual_cents
        int default_value_cents
        int tier_id FK
        bool is_removed
        date removed_on
        string description
        int sort_order
    }
    CREDIT_TIPS {
        int credit_tip_id PK
        int credit_id FK
        string tip_text
        bool is_warning
        int sort_order
    }
    INSURANCE_BENEFITS {
        int insurance_benefit_id PK
        int card_id FK
        int coverage_type_id FK
        string detail
        string level
        int sort_order
    }
    STATUS_PERKS {
        int status_perk_id PK
        int card_id FK
        string name
        int strength
        string note
        int sort_order
    }
    SERVICES {
        int service_id PK
        int card_id FK
        string name
        string detail
        int sort_order
    }
    ADDITIONAL_CARD_OPTIONS {
        int option_id PK
        int card_id FK
        string name
        int fee_cents
        string fee_label
        bool is_free
        int sort_order
    }
    ADDITIONAL_CARD_BENEFITS {
        int benefit_id PK
        int option_id FK
        string benefit_text
        bool is_included
        int sort_order
    }
    TIMELINE_EVENTS {
        int event_id PK
        int card_id FK
        date event_date
        string date_label
        string event_type
        string badge
        string description
        int sort_order
    }
    CARD_TRANSFER_PARTNERS {
        int card_id PK,FK
        int loyalty_program_id PK,FK
        string transfer_ratio
        string notes
    }
    CARD_DRAFTS {
        int draft_id PK
        string card_slug
        string source_url
        datetime fetched_at
        string extracted_json
        string status
        string reviewer_notes
        datetime reviewed_at
    }
```

`card_drafts` has no FK to `cards` on purpose — it's a staging area, not part of the
normalized graph above (see "How data gets in" below).

Design choices worth knowing before touching this schema:
- **Money is integer cents** (`annual_fee_cents`, not a float `annual_fee`) — no
  rounding drift. The API layer converts to whole dollars at the response boundary.
- **`is_removed`, not deleted.** A discontinued credit (e.g. Amex Platinum's old
  Saks credit) stays a row with `is_removed = true` — historical accuracy is a
  product feature (see the card detail page's timeline), not just data hygiene.
- **Every FK is indexed.** Postgres doesn't do this automatically, and it's easy to
  forget when adding a new detail table.

## How data gets in

```
backend/data/cards/staging/{slug}.json  →  drafts add  →  card_drafts (pending)
                                                          │
                                                    drafts promote
                                                          │
                                                          ▼
                                              upsert_card() [backend/scripts/upsert.py]
                                                          │
                                                          ▼
                                            normalized tables (cards, credits, ...)
                                                          │
                                                          ▼
                                move file: staging/{slug}.json → {issuer}/{slug}.json
```

`upsert_card()` is the single write path — both draft promotion and any future
direct re-sync go through it. It's idempotent: re-running it for an already-live
card updates the row and fully replaces its child collections (credits, earn
rates, etc.) rather than duplicating them.

## Adding or updating a card

1. Research the card from its official issuer page. Prefer the issuer's own site
   over third-party aggregators for factual claims (fees, credit amounts, terms) —
   editorial content like tips and the keep/reconsider verdict is necessarily a
   judgment call either way.
2. Write the card to `backend/data/cards/staging/{slug}.json`, matching the
   `Card` shape in `backend/models.py`. A file in `staging/` means "drafted,
   not yet promoted" — the seeding fixture in `tests/backend/conftest.py`
   skips this folder for exactly that reason, so a pending card never behaves
   like a live one in tests. See `backend/data/cards/staging/README.md`.
   For co-branded cards (a bank card tied to an airline/hotel loyalty program),
   the `id` follows `{issuer}-{brand}-{type}`, e.g. `amex-hilton-honors-aspire`
   or `amex-marriott-bonvoy-brilliant` — keeps cards from the same loyalty
   program grouped together alphabetically and makes the issuer unambiguous.
3. Add it to the review queue:
   ```bash
   uv run python -m backend.scripts.drafts add <slug> "<source url>" backend/data/cards/staging/<slug>.json
   ```
   This validates against the Pydantic schema before it's even allowed into the
   queue — a draft that doesn't parse never becomes something to review.
4. Review it: `uv run python -m backend.scripts.drafts show <draft_id>`
5. Promote it (or reject it with a reason):
   ```bash
   uv run python -m backend.scripts.drafts promote <draft_id> --notes "..."
   uv run python -m backend.scripts.drafts reject <draft_id> --notes "..."
   ```
   A rejected draft can't be promoted later — fix the JSON and add it as a new
   draft instead.
6. Once promoted, move the file out of staging into its issuer folder so the
   file tree matches what's actually live:
   ```bash
   git mv backend/data/cards/staging/<slug>.json backend/data/cards/<issuer>/<slug>.json
   ```

## Migrations

```bash
# after changing backend/db_models.py
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

Autogenerated migrations for SQLite sometimes need a manual `server_default` added
for new `NOT NULL` columns (SQLite can't `ALTER TABLE ADD COLUMN NOT NULL` without
one to backfill existing rows) — check the generated file before applying.

## Known gaps

- `card_transfer_partners` is unpopulated for most cards (see Schema above).
- No bulk "seed everything" script yet — a fresh database needs each card added
  and promoted individually (see Getting Started in the top-level README).
- User accounts / persisted calculator state (which credits a specific person
  actually uses) isn't built — the frontend calculator is currently client-side
  state only, reset on page refresh.
