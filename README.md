# The Wallet Audit — Credit Card Decision Dashboard

A web-based tool to help decide which premium credit cards to keep or downgrade.

## Stack

- **Backend:** Python 3.13 + FastAPI
- **Frontend:** Plain HTML / CSS / JavaScript
- **Data:** `cards.json` (source of truth — no database)

## Cards covered

| Card | Annual Fee |
|------|-----------|
| Amex Platinum | $895 |
| Chase Sapphire Reserve | $795 |
| Capital One Venture X | $395 |
| Delta SkyMiles Platinum | $350 |

## Getting started

```bash
# Install dependencies (uv handles the virtualenv automatically)
uv sync --group dev

# Run the dev server
uv run uvicorn backend.main:app --reload
```

API docs available at `http://localhost:8000/docs`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cards` | List all cards |
| `GET` | `/api/cards/{card_id}` | Full detail for one card |
| `POST` | `/api/recommend` | Rules-based card recommendations |

## Project structure

> Planned — files are added incrementally via feature branches.

```
credit-card-decision-dashboard/
├── backend/
│   ├── main.py            # FastAPI app + routes
│   ├── models.py          # Pydantic schemas
│   ├── data/cards.json    # Card data (source of truth)
│   ├── services/
│   │   ├── cards.py       # Load/serve card data
│   │   └── recommend.py   # Rules-based scoring
│   └── tests/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```