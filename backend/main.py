from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.models import Card, CardSummary
from backend.services.cards import get_card, get_card_summaries


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Eagerly load and validate cards.json at startup so errors surface immediately."""
    get_card_summaries()
    yield


app = FastAPI(
    title="Credit Card Decision Dashboard",
    description="API for comparing and evaluating premium credit cards.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """Health check for Render and other uptime monitors."""
    return {"status": "ok"}


@app.get("/api/cards", response_model=list[CardSummary])
def list_cards() -> list[CardSummary]:
    """Return a summary of all cards."""
    return get_card_summaries()


@app.get("/api/cards/{card_id}", response_model=Card)
def get_card_detail(card_id: str) -> Card:
    """Return full detail for a single card."""
    card = get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found.")
    return card
