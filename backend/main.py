import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.db import engine
from backend.models import Card, CardSummary, EventIn
from backend.services.cards import get_card, get_card_summaries, get_cards
from backend.services.events import record_page_view


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Eagerly load the catalog from the database at startup so a broken DB
    connection or query surfaces immediately at boot, not on the first real
    request a visitor makes."""
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
    """Health check for Render and other uptime monitors — actually verifies
    the database connection works, not just that this process is alive. A
    process-only check (the old version of this endpoint) would report "ok"
    even with a fully dead DB connection pool, e.g. after Neon's free-tier
    compute auto-suspends from being idle — see backend/db.py's
    pool_pre_ping for the other half of this fix."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unreachable") from exc
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


def _device_type(user_agent: str | None) -> str | None:
    """User-Agent request header -> "mobile"/"tablet"/"desktop"/None. Only
    the derived category is ever kept — the raw header is read here and
    discarded, never stored, keeping the "no PII" guarantee on SessionModel
    intact. Simple substring checks rather than a UA-parsing dependency:
    this only needs a rough web-vs-mobile-vs-tablet split for UI-planning
    purposes, not per-visitor precision (and UA sniffing has inherent
    limits regardless of how it's implemented — e.g. modern iPadOS Safari
    can report as desktop by default)."""
    if not user_agent:
        return None
    ua = user_agent.lower()
    if "ipad" in ua or "tablet" in ua or ("android" in ua and "mobile" not in ua):
        return "tablet"
    if "mobi" in ua or "iphone" in ua or "android" in ua:
        return "mobile"
    return "desktop"


# Substring match against a lowercased User-Agent — covers the major search
# engine/social-preview crawlers (Googlebot, Bingbot, DuckDuckBot, Applebot,
# facebookexternalhit, Slurp, ...; most self-identify with "bot" or "spider"
# somewhere in the UA), common HTTP client libraries/CLI tools that aren't
# real browsers at all (curl, wget, python-requests, PostmanRuntime), and
# headless/automated browser signatures (HeadlessChrome, PhantomJS) that
# tools like Puppeteer/Playwright default to unless overridden. Same
# lightweight-heuristic philosophy as _device_type() above: this only needs
# to keep obviously-automated traffic out of "how many real people visited"
# numbers, not withstand a bot deliberately spoofing a real browser's UA —
# that's a fundamentally different, much harder problem this isn't trying
# to solve.
_BOT_UA_SIGNATURES = (
    "bot",
    "spider",
    "crawl",
    "slurp",
    "curl",
    "wget",
    "python-requests",
    "python-urllib",
    "postmanruntime",
    "headlesschrome",
    "phantomjs",
    "facebookexternalhit",
    "whatsapp",
    "telegrambot",
    "discordbot",
    "linkedinbot",
)


def _is_bot(user_agent: str | None) -> bool:
    """True for a missing User-Agent (every real browser sends one; a
    genuine visit without one is vanishingly rare next to the volume of
    scripts/tools that omit it) or one matching a known
    automation/crawler/bot signature."""
    if not user_agent:
        return True
    ua = user_agent.lower()
    return any(signature in ua for signature in _BOT_UA_SIGNATURES)


@app.post("/api/events")
def track_event(event: EventIn, request: Request) -> dict:
    """Record one anonymous page-view event. Fire-and-forget from the
    frontend's side (sent via a keepalive fetch, response ignored), so this
    deliberately does the minimum: no validation beyond the Pydantic
    schema, no error surfaced back to the caller that would need handling —
    worst case for a malformed request is one low-quality analytics row, not
    a broken page for the visitor it came from.

    Silently drops the event (still returns 200, same as a real recorded
    one — the caller ignores the response either way) if the User-Agent
    looks like a bot/crawler/automation tool rather than a real visitor —
    see _is_bot(). Checked before touching the database at all, so bot
    traffic never creates a session or page_view row in the first place,
    rather than being flagged after the fact and requiring every future
    query to remember to filter it back out.

    Country comes from Cloudflare's CF-IPCountry request header (set for
    every proxied request once IP Geolocation is turned on for the zone),
    read server-side rather than trusted from the client payload — the
    client has no reliable way to know its own country anyway. "XX" is
    Cloudflare's own placeholder for "couldn't determine a country" and is
    normalized to None here rather than stored as a fake location. Absent
    entirely (e.g. local dev, direct-to-origin requests) also maps to None —
    no IP address is ever read or stored, keeping the "no PII" guarantee in
    backend/db_models.py SessionModel intact. Device type is derived the
    same way, off the User-Agent header — see _device_type()."""
    user_agent = request.headers.get("user-agent")
    if _is_bot(user_agent):
        return {"status": "ok"}

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
        device_type=_device_type(user_agent),
        detail=event.detail,
        value=event.value,
    )
    return {"status": "ok"}
