import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.models import Card, CardSummary, EventIn
from backend.services.cards import get_card, get_card_summaries, get_cards
from backend.services.events import record_page_view


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

# Comma-separated list of allowed frontend origins. Defaults to the Vite dev
# server; production sets this to the deployed frontend's real origin (see
# ALLOWED_ORIGINS in render.yaml).
_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    """Points humans hitting the bare API domain at something useful; the
    actual frontend lives on a separate service and calls /api/* directly."""
    return {"name": "The Wallet Audit API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict:
    """Health check for Render and other uptime monitors."""
    return {"status": "ok"}


@app.get("/api/cards", response_model=list[CardSummary])
def list_cards() -> list[CardSummary]:
    """Return a summary of all cards."""
    return get_card_summaries()


@app.get("/api/cards/detail", response_model=list[Card])
def list_card_details(ids: str = "") -> list[Card]:
    """Full detail for multiple cards in one request, given a comma-separated
    `ids` query param. Registered above /api/cards/{card_id} — as a literal
    path, it has to be matched before that param route, or "detail" would be
    parsed as a card_id instead. Lets a page that needs every card in a
    lineup (e.g. an issuer's full set) fetch them all in one round trip
    instead of fanning out into a separate request per card."""
    card_ids = [i for i in ids.split(",") if i]
    return get_cards(card_ids)


@app.get("/api/cards/{card_id}", response_model=Card)
def get_card_detail(card_id: str) -> Card:
    """Return full detail for a single card."""
    card = get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found.")
    return card


def _referrer_host(referrer: str | None) -> str | None:
    """Full referring URL -> bare host (e.g. "google.com"), matching the
    "not a full URL" contract on SessionModel.referrer. None for a direct
    visit (empty document.referrer) or anything unparseable as a URL with
    a host — a malformed value here is worth one blank analytics field,
    not worth rejecting the whole event over."""
    if not referrer:
        return None
    return urlparse(referrer).hostname


@app.post("/api/events")
def track_event(event: EventIn, request: Request) -> dict:
    """Record one anonymous page-view event. Fire-and-forget from the
    frontend's side (sent via navigator.sendBeacon, response ignored), so
    this deliberately does the minimum: no validation beyond the Pydantic
    schema, no error surfaced back to the caller that would need handling —
    worst case for a malformed request is one low-quality analytics row, not
    a broken page for the visitor it came from.

    Country comes from Cloudflare's CF-IPCountry request header (set for
    every proxied request once IP Geolocation is turned on for the zone),
    read server-side rather than trusted from the client payload — the
    client has no reliable way to know its own country anyway. "XX" is
    Cloudflare's own placeholder for "couldn't determine a country" and is
    normalized to None here rather than stored as a fake location. Absent
    entirely (e.g. local dev, direct-to-origin requests) also maps to None —
    no IP address is ever read or stored, keeping the "no PII" guarantee in
    backend/db_models.py SessionModel intact."""
    country = request.headers.get("cf-ipcountry")
    if country == "XX":
        country = None
    record_page_view(
        session_id=event.session_id,
        event_type=event.event_type,
        issuer=event.issuer,
        card_slug=event.card_id,
        referrer=_referrer_host(event.referrer),
        country=country,
    )
    return {"status": "ok"}
