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
# Create and activate virtual environment
python3.13 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the dev server
uvicorn backend.main:app --reload
```

API docs available at `http://localhost:8000/docs`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cards` | List all cards |
| `GET` | `/api/cards/{card_id}` | Full detail for one card |
| `POST` | `/api/recommend` | Rules-based card recommendations |

## Project structure

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