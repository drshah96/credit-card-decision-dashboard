# The Wallet Audit

**Honest points valuation.** A dashboard for deciding which credit cards are
actually worth keeping, built on the premise that a card's advertised value and
its real value are rarely the same number.

Live at **[thewalletaudit.com](https://thewalletaudit.com)**.

Most card comparison sites are paid per application. This one isn't, and that
shapes the whole thing: statement credits are valued at what a normal person
would realistically use rather than at their headline number, points are given
one honest cents-per-point figure instead of an inflated one, and a card with no
purchase protection says so plainly rather than padding the list.

---

## What the site does

Every card in the catalog is hand-authored as JSON, sourced from the issuer's own
cardmember agreement and pricing terms rather than from aggregators, and reviewed
in git like code.

### The four surfaces

| Route | What it answers |
|---|---|
| `/` | **Card Issuers.** Which bank do you want to look at? Nine tiles, straight into an issuer's lineup. |
| `/top-picks` | **Top Pick by category.** Who actually wins at dining, groceries, gas, travel? Ranked across the whole catalog by real returned value, not by advertised multiplier. |
| `/compare` | **Compare Cards.** Put up to four cards side by side on the things that decide it: fee, real credit value, earn rates, lounge access, insurance, foreign transaction fees. |
| `/cards/{id}` | **Card detail.** The deep dive: credits, earn rates, redemption ladder, insurance, rates and fees, and the history of what the issuer has added or cut. |

Plus `/issuer/{slug}` for a single bank's lineup, and `/methodology` for how the
ratings are reached.

---

## How the calculations work

Two pieces of arithmetic drive most of the site, and neither is guessable from
the UI. They're documented here because they're the actual product.

### Credit tiers, and why credits aren't worth their sticker price

A premium card advertises a fee offset by statement credits: "$795 fee, but
$1,500 in credits." That maths only works if you'd have spent that money anyway.
A $300 dining credit paid in $25 monthly instalments at restaurants you don't
otherwise visit is not $300 of value.

So every credit is sorted into one of three tiers:

| Tier | Meaning | Example |
|---|---|---|
| **Effortless** | Auto-applies, or covers something you'd unavoidably buy | A travel credit that triggers on any airfare |
| **Plan a little** | Timed, capped or split into instalments; partial use is likely | $25/month that expires monthly |
| **Niche** | Only worth anything if it happens to fit your life | A rideshare credit in a city you don't visit |

Each credit carries two numbers: `max_annual`, the advertised ceiling, and
`default_value`, a realistic starting estimate of what a typical person captures.
The card detail page seeds every slider from `default_value`, then lets you drag
each one to your own number and move credits between tiers, because a credit
that's effortless for you may be niche for someone else. Your adjustments persist
locally per card.

Two derived totals appear on listing pages:

- `total_max_credits` — the sum of every active credit's `max_annual`. The
  issuer's marketing number.
- `total_easy_credits` — the sum of `default_value` for **Effortless** credits
  only. The floor: what you'd get without planning anything.

Credits the issuer has discontinued are marked `removed` and excluded from both.

### "Your take, so far"

The running total in the card detail hero. Deliberately simple:

```
your take = (sum of your slider values) − annual fee
```

Green when the credits you'll genuinely use cover the fee, red when they don't.
The bar underneath shows how much of the fee is recovered.

What it counts is the important part. **Statement credits and cash-like perks
only** — not points earning, not lounge access, not insurance. That's on purpose.
Those benefits are real but their worth varies wildly per person, so folding a
made-up number for "lounge access" into the total would quietly make every
premium card look like a bargain. Instead the calculator answers a narrower,
answerable question: *before any of the soft benefits, how much of this fee comes
back as cash?* Whether the remainder is worth paying for lounges and points is
then a judgement you make with a real number in front of you.

### Ranking on Top Picks

Cards are ranked by **effective value**, not by the advertised multiplier:

```
effective value = earn multiplier × best cents-per-point
```

Comparing raw multipliers across currencies is meaningless: 6× hotel points at
0.5¢ each is worth less than 3× transferable points at 2¢ each. `best_cpp` is the
highest redemption value in that card's own ladder.

One wrinkle: cards that pool into a shared account (Chase Ultimate Rewards,
Citi ThankYou) inherit the pool's best redemption value, but only when a card
that can actually reach those partners is also in the set being ranked. A feeder
card on its own is valued on its own.

Rankings ignore monetization entirely, and there's a
[regression test](frontend/tests/utils/topPickCategories.test.ts) proving the
ranking function can't even see the affiliate flag.

---

## Cards covered

109 cards across 9 issuers, one hand-authored JSON file each under
`backend/data/cards/{issuer}/`. See [`backend/README.md`](backend/README.md) for
the schema and the add → review → promote flow.

| Issuer | Cards |
|--------|-------|
| Citi | 23 |
| Chase | 19 |
| Capital One | 17 |
| American Express | 14 |
| Bank of America | 10 |
| U.S. Bank | 9 |
| Wells Fargo | 8 |
| Discover | 6 |
| Bilt | 3 |

Card data records APRs, intro offers, balance transfer and cash advance terms,
penalty and late fees, foreign transaction fees, welcome bonuses, insurance,
status perks and a dated history of issuer changes. Sourced per card from the
issuer's own terms, not from aggregators, which during a product transition are
routinely months out of date.

---

## Stack

- **Backend:** Python 3.13, FastAPI, SQLAlchemy, Alembic
- **Frontend:** React 19, TypeScript, Vite
- **Database:** SQLite in development, Postgres in production
- **Content:** JSON per card in `backend/data/cards/{issuer}/`, synced to the
  database through a review queue

The site is a client-rendered SPA, but every route ships a prerendered `<head>`
with its own title, description and OpenGraph tags, generated at build time by
`frontend/scripts/prerender.mjs`. Route metadata lives in one place,
`frontend/src/utils/routeMeta.js`, read by both the React app and the Node build
scripts so the two can't drift.

## Getting started

```bash
# Backend — uv handles the virtualenv automatically
uv sync --group dev
uv run alembic upgrade head          # creates backend/data/card_catalog.db
uv run uvicorn backend.main:app --reload

# Frontend, in a separate terminal
cd frontend
npm install
npm run dev
```

Backend: `http://localhost:8000` (API docs at `/docs`). Frontend:
`http://localhost:5173`.

A fresh database starts empty. To populate it with every card committed to the
repo:

```bash
uv run python -m backend.scripts.seed_catalog
```

That re-upserts every JSON file under `backend/data/cards/`, so it's also how you
resync after pulling a data or schema change. It skips the review queue, which is
only for adding a genuinely new card:

```bash
uv run python -m backend.scripts.drafts add amex-platinum "<source url>" backend/data/cards/amex/amex-platinum.json
uv run python -m backend.scripts.drafts promote 1
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/cards` | List all cards (summary) |
| `GET` | `/api/cards/detail?ids=…` | Full detail for many cards in one request |
| `GET` | `/api/cards/{card_id}` | Full detail for one card |

## Project structure

```
credit-card-decision-dashboard/
├── backend/
│   ├── main.py                 # FastAPI app + routes
│   ├── models.py               # Pydantic response schemas
│   ├── db.py                   # SQLAlchemy engine/session
│   ├── db_models.py            # ORM models (the normalized schema)
│   ├── data/
│   │   ├── cards/{issuer}/*.json  # Card content, source of truth
│   │   └── card_catalog.db     # Local dev SQLite db (gitignored, regenerable)
│   ├── services/cards.py       # Query layer used by the API routes
│   └── scripts/
│       ├── upsert.py           # Card dict → normalized rows
│       ├── drafts.py           # Review-queue CLI: add / list / show / promote / reject
│       └── seed_catalog.py     # Bulk-seed/resync every committed card JSON
├── alembic/                    # Schema migrations
├── frontend/
│   ├── src/                    # React app (pages, components, api client)
│   ├── scripts/                # Sitemap + prerender build steps
│   └── tests/                  # Vitest + Testing Library
├── tests/backend/              # pytest — API + upsert/drafts pipeline
└── .github/workflows/          # CI (backend + frontend checks on every PR)
```

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for the technical detail on each side.

## License

MIT, see [LICENSE](LICENSE), for this project's code and original written
content. Issuer logos and card art under `frontend/src/assets/` are
trademarks/copyrighted material of their respective owners and are not covered by
that license, see [NOTICE](NOTICE).
