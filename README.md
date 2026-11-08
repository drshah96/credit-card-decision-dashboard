# The Wallet Audit

**Honest points valuation.** A dashboard for deciding which credit cards are
actually worth keeping, built on the premise that a card's advertised value and
its real value are rarely the same number.

Live at **[thewalletaudit.com](https://thewalletaudit.com)**. AI agents can
[query the catalog too](#for-ai-agents).

Most card comparison sites are paid per application. This one isn't, and that
shapes the whole thing: statement credits count at what you say you'd actually
use rather than at their headline number, points get one honest cents-per-point
figure instead of an inflated one, and a card with no purchase protection says so
plainly rather than padding the list.

---

## What the site does

Every card in the catalog is hand-authored as JSON, sourced from the issuer's own
cardmember agreement and pricing terms rather than from aggregators, and reviewed
in git like code. 89 of the 109 cards were re-checked against issuer terms in
November 2026. The other 20, mostly store cards, have no recent check.

### The four main pages

| Route | What it answers |
|---|---|
| `/` | **Card Issuers.** Which bank do you want to look at? Nine tiles, each leading to that issuer's lineup. |
| `/top-picks` | **Top Pick by category.** Who actually wins at dining, groceries, gas or travel? Ranked across the whole catalog by real returned value, not by the advertised multiplier. |
| `/compare` | **Compare Cards.** Up to four cards side by side on the things that decide it: fee, real credit value, earn rates, lounge access, insurance and foreign transaction fees. |
| `/cards/{id}` | **Card detail.** The deep dive: credits, earn rates, redemption options, insurance, rates and fees, and a history of what the issuer has added or cut. |

There's also `/issuer/{slug}` for a single bank's lineup, and `/methodology` for
how the ratings are reached.

---

## How the calculations work

Two pieces of arithmetic drive most of the site, and neither is obvious from the
UI. They're documented here because they're the actual product.

### Credit tiers, and why credits aren't worth their sticker price

A premium card sells its fee as offset by statement credits. The Amex Platinum,
for example, carries an $895 fee against more than $3,000 in listed credits. That
maths only works if you'd have spent that money anyway. A $300 dining credit paid
in $25 monthly instalments at restaurants you don't otherwise visit is not $300 of
value.

So every credit is sorted into one of three tiers:

| Tier | Meaning | Example |
|---|---|---|
| **Effortless** | Applies automatically, or covers something you'd buy anyway | A travel credit that triggers on any airfare |
| **Plan a little** | Timed, capped or split into instalments, so partial use is likely | $25 a month that expires monthly |
| **Niche** | Only worth anything if it happens to fit your life | A rideshare credit in a city you don't visit |

Each credit carries two numbers: `max_annual`, the advertised ceiling, and
`default_value`, where its slider starts. The default is $0 on 157 of the 159
active credits, because what you'd capture depends on your own situation. So a
card's total starts low until you set your usage. On the card detail page you
drag each slider to your own number and can move credits between tiers, because a
credit that's effortless for you may be niche for someone else. Slider values are
saved in your browser, per card. Tier moves last until you leave the page.

Two totals come with each card's summary:

- `total_max_credits`: the sum of every active credit's `max_annual`. This is the
  issuer's marketing number.
- `total_easy_credits`: the sum of `default_value` for **Effortless** credits only.
  With almost every default at $0, this is $0 on nearly every card.

Credits the issuer has discontinued are marked `removed` and left out of both.

### "Your take, so far"

The running total at the top of the card detail page. Deliberately simple:

```
your take = (sum of your slider values) − annual fee
```

It's green when the credits you'll genuinely use cover the fee, and red when they
don't. The bar underneath shows how much of the fee comes back.

What it counts is the important part: **statement credits and cash-like perks
only**. Not points earning, not lounge access, not insurance. That's on purpose.
Those benefits are real, but their worth varies wildly from person to person, and
folding a made-up number for "lounge access" into the total would quietly make
every premium card look like a bargain. Instead the calculator answers a narrower
question it can actually answer: *before any of the soft benefits, how much of
this fee comes back as cash?* Whether the rest is worth paying for lounges and
points is then your call, made with a real number in front of you.

### Ranking on Top Picks

Cards are ranked by **effective value**, not by the advertised multiplier:

```
effective value = earn multiplier × best cents-per-point
```

Comparing raw multipliers across currencies is meaningless: 6× hotel points at
0.5¢ each are worth less than 3× transferable points at 2¢ each. `best_cpp` is the
highest redemption value in that card's own list of redemption options. A
percentage rate, such as 2% cash back, already says how many cents you earn per
dollar, so it is used as stated.

One wrinkle is points pooling. Chase Ultimate Rewards and Citi ThankYou cards can
pool into one account, and a no-fee card in the pool can then redeem at the
premium card's transfer value. The default ranking never assumes this, because
pooling needs you to actually hold both cards. It switches on only when you pick
your own cards on Top Picks and one of them is a premium card that can reach those
transfer partners.

A rate counts toward a category only if most purchases in that category earn it.
Some bonus rates apply only at a partner network of restaurants, at certain hours,
at one merchant or website, or only online, like Bilt's "Up to 6×" at Bilt partner
restaurants or the Costco Visa's 5% on gas at Costco. Those still show on the card's
page, but in the ranking the card's broadly available rate competes instead. Two
narrower kinds do count, on purpose: travel booked through the card's own portal,
since any flight or hotel can be booked that way, and a category you choose
yourself, which ranks in each category it offers.

Rankings ignore monetization entirely, and a
[regression test](frontend/tests/utils/topPickCategories.test.ts) proves the
ranking function can't even see the affiliate flag.

---

## Cards covered

109 cards across 9 issuers, one hand-authored JSON file each under
`backend/data/cards/{issuer}/`. See [`backend/README.md`](backend/README.md) for
the schema and the add, review and promote flow.

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
penalty and late fees, foreign transaction fees, insurance, lounge access, status
perks and a dated history of issuer changes. It comes from each issuer's own
terms, not from aggregators, which during a product change are routinely months
out of date. Welcome bonuses are recorded in the card files but never shown,
because they can change daily or weekly.

---

## For AI agents

AI agents can read this catalog over the Model Context Protocol (MCP) instead of
scraping the site. The endpoint is `https://mcp.thewalletaudit.com/mcp`, and it
needs no key or sign-in.

- **In Claude** (desktop, web or mobile): open Settings, then Connectors, then Add
  custom connector. Enter the URL above and leave the OAuth fields empty.
- **In other clients:** use any MCP client that supports Streamable HTTP.

Requests without a key share one rate limit. If you need a limit of your own,
message [Dhruvin Shah on LinkedIn](https://www.linkedin.com/in/dhruvinshah1996/)
to ask for an API key.

The server has five read-only tools:

- `find_cards`: search by name, issuer or rewards program to get card ids
- `get_card`: one card's fees, rates, credits, earn rates, insurance, lounge access and perks
- `compare_cards`: 2 to 4 cards side by side
- `rank_by_category`: the best cards for a spending category, across the catalog or a wallet
- `estimate_value`: credits minus the annual fee, using your own expected usage

The answers are built so an agent can't mistake a gap for a fact:

- **Every card shows its source and age:** the issuer page, the date it was last
  checked against issuer documents, and the areas that check could not confirm. A
  card with no recorded check says `not_verified` rather than borrowing a date.
- **A check expires on time:** each card has a date after which its check
  shouldn't be relied on. That's 180 days after the check, or sooner if a rate or
  credit in the card's data ends or changes first, such as a quarterly category.
  Once that date passes, the card is flagged `review_overdue`.
- **Unknown is never "none":** a rate or fee missing from the catalog comes back as
  `not_recorded`, not as a blank an agent could read as zero.
- **Rankings match the site and ignore monetization:** a shared test fixture holds
  the Python and TypeScript rankings to the same results, and the ranking code
  can't read the affiliate flag.

[docs/mcp-server.md](docs/mcp-server.md) covers connecting, tools and limits.
[ADR 0003](docs/adr/0003-public-mcp-server.md) has the design and its tradeoffs.

---

## Stack

- **Backend:** Python 3.13, FastAPI, SQLAlchemy, Alembic, and the MCP Python SDK
- **Frontend:** React 19, TypeScript, Vite, TanStack Query
- **Database:** SQLite in development, Postgres on Neon in production
- **Hosting:** Render, for the API and the static site
- **Content:** one JSON file per card in `backend/data/cards/{issuer}/`, synced to
  the database through a review queue

The site renders in the browser, but every page is also written out as HTML at
build time by `frontend/scripts/prerender.mjs`, for link previews and for crawlers
that don't run JavaScript. Each page gets its own title, description and
OpenGraph tags, plus readable text for crawlers. On a card page that's the card's
fee, earn rates, credit names and APRs, while the analysis itself stays on the
live page. Route metadata lives in one place, `frontend/src/utils/routeMeta.js`,
which both the React app and the build scripts read, so the two can't drift.

## Getting started

```bash
# Backend. uv manages the virtualenv for you.
uv sync --group dev
uv run alembic upgrade head          # creates backend/data/card_catalog.db
uv run uvicorn backend.main:app --reload

# Frontend, in a separate terminal
cd frontend
npm install
npm run dev
```

Backend: `http://localhost:8000`, with API docs at `/docs`. Frontend:
`http://localhost:5173`.

A fresh database starts empty. To fill it with every card committed to the repo:

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

CI runs these checks on every pull request. To run them locally:

```bash
uv run ruff format --check . && uv run ruff check . && uv run pytest
cd frontend && npm run lint && npm run build && npm run test -- --run
```

`npm run build` matters on its own: it is the step that type-checks, and the
tests alone don't.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness: is the process up. Touches no database, and Render's health check uses it |
| `GET` | `/health` | Readiness: also checks the database is reachable, and returns 503 if not |
| `GET` | `/api/cards` | All cards, in summary form |
| `GET` | `/api/cards/detail?ids=a,b` | Full detail for several cards in one request |
| `GET` | `/api/cards/{card_id}` | Full detail for one card |
| `POST` | `/api/feedback` | A visitor's feedback on a card they hold |
| `POST` | `/api/events` | Anonymous page-view events from the site |
| `POST` | `/api/client-errors` | JavaScript errors reported by the site |
| `POST` | `https://mcp.thewalletaudit.com/mcp` | MCP endpoint for AI agents, no key needed. See [docs/mcp-server.md](docs/mcp-server.md) |

## Project structure

```
credit-card-decision-dashboard/
├── backend/
│   ├── main.py                 # FastAPI app and routes
│   ├── models.py               # Pydantic schemas, including the Card content shape
│   ├── db.py                   # SQLAlchemy engine and session
│   ├── db_models.py            # ORM models (the normalized schema)
│   ├── data/
│   │   ├── cards/{issuer}/*.json  # Card content, the source of truth
│   │   ├── cards/staging/      # Drafts waiting for review
│   │   ├── refresh/*.json      # When each card was last checked, and what that covered
│   │   └── card_catalog.db     # Local dev SQLite database (gitignored, regenerable)
│   ├── mcp_server/             # MCP server for AI agents (tools, access guard, ranking port)
│   ├── refresh/state.py        # The model for the per-card verification records
│   ├── services/               # Card queries, feedback, events and client errors
│   └── scripts/
│       ├── upsert.py           # Card JSON to normalized rows
│       ├── drafts.py           # Review-queue CLI: add, list, show, promote, reject
│       ├── seed_catalog.py     # Seed or resync every committed card JSON
│       └── mcp_keys.py         # Mint and check MCP API keys
├── alembic/                    # Schema migrations
├── docs/                       # MCP integrator guide and architecture decision records
├── frontend/
│   ├── src/                    # React app (pages, components, API client)
│   ├── scripts/                # Build steps: sitemap, prerender, crawlable text
│   └── tests/                  # Vitest and Testing Library
├── tests/backend/              # pytest: API, data pipeline, catalog rules, MCP server
└── .github/workflows/          # CI on every PR, plus keep-warm, MCP smoke test,
                                # Neon PR databases, dependency audit, terms reminder
```

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for the technical detail on each side.

## License

MIT, see [LICENSE](LICENSE), for this project's code and original written
content. Issuer logos and card art under `frontend/src/assets/` are trademarks or
copyrighted material of their respective owners and are not covered by that
license, see [NOTICE](NOTICE).
