# The Wallet Audit — Credit Card Decision Dashboard

A web-based tool to help decide which premium credit cards to keep or downgrade.

## Stack

- **Backend:** Python 3.13 + FastAPI + SQLAlchemy + Alembic
- **Frontend:** React 19 + TypeScript + Vite
- **Database:** SQLite in development, Postgres in production. Card content itself
  lives in `backend/data/cards/{issuer}/*.json` (one file per card, grouped by
  issuer, git-reviewable) and is synced into the database through a review queue —
  see [`backend/README.md`](backend/README.md) for the schema and how the pipeline
  works.

## Cards covered

| Card | Annual Fee |
|------|-----------|
| Amex Platinum | $895 |
| Chase Sapphire Reserve | $795 |
| Capital One Venture X | $395 |
| Delta SkyMiles Platinum | $350 |

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

Backend: `http://localhost:8000` (API docs at `/docs`). Frontend: `http://localhost:5173`.

A fresh database starts empty. The fastest way to populate it with every card
already committed to this repo is the bulk seed script:

```bash
uv run python -m backend.scripts.seed_catalog
```

It re-upserts every JSON file under `backend/data/cards/`, so it's also the
way to resync your local database after pulling a data or schema change. It
skips the review queue — that's only for adding a genuinely new card (see
[`backend/README.md`](backend/README.md#adding-or-updating-a-card) for the
full add → review → promote flow):

```bash
uv run python -m backend.scripts.drafts add amex-platinum "<source url>" backend/data/cards/amex/amex-platinum.json
uv run python -m backend.scripts.drafts promote 1
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/cards` | List all cards (summary) |
| `GET` | `/api/cards/{card_id}` | Full detail for one card |

## Project structure

```
credit-card-decision-dashboard/
├── backend/
│   ├── main.py                # FastAPI app + routes
│   ├── models.py               # Pydantic response schemas
│   ├── db.py                   # SQLAlchemy engine/session
│   ├── db_models.py            # ORM models (the normalized schema)
│   ├── data/
│   │   ├── cards/{issuer}/*.json  # Card content, source of truth — one file per card, grouped by issuer
│   │   └── card_catalog.db     # Local dev SQLite db (gitignored, regenerable)
│   ├── services/
│   │   └── cards.py            # Query layer used by the API routes
│   └── scripts/
│       ├── upsert.py           # Card-shape dict → normalized rows (shared by drafts + any re-sync)
│       └── drafts.py           # Review-queue CLI: add / list / show / promote / reject
├── alembic/                     # Schema migrations
├── frontend/
│   ├── src/                    # React app (pages, components, api client)
│   └── tests/                  # Vitest + Testing Library
├── tests/backend/               # pytest — API + upsert/drafts pipeline
└── .github/workflows/           # CI (backend + frontend checks on every PR)
```

## License

MIT, see [LICENSE](LICENSE), for this project's code and original written
content. Issuer logos and card art under `frontend/src/assets/` are
trademarks/copyrighted material of their respective owners and are not
covered by that license, see [NOTICE](NOTICE).
