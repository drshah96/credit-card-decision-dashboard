import hashlib
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from backend.db import engine
from backend.models import Card, CardFeedbackIn, CardSummary, ClientErrorIn, EventIn
from backend.services.cards import get_card, get_card_summaries, get_cards
from backend.services.errors import record_client_error
from backend.services.events import record_page_view
from backend.services.feedback import record_card_feedback


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

# The catalog response is ~115 KB of highly repetitive JSON and compresses by
# roughly 8x, which matters most on the cold-start fetch every visitor pays for
# on the issuer and Top Pick pages. minimum_size skips the tiny responses
# (/health, the event 200s) where a compression pass would cost more than the
# bytes it saves.
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.get("/")
def root() -> dict:
    """Points humans hitting the bare API domain at something useful; the
    actual frontend lives on a separate service and calls /api/* directly."""
    return {"name": "The Wallet Audit API", "docs": "/docs", "health": "/health"}


# robots.txt for the API host. `api.thewalletaudit.com` is a separate origin
# from the site, so the frontend's robots.txt does not apply to it and never
# has. Until now this host served no robots.txt of its own, and the one that
# answered came from Cloudflare's content-signals feature: 1,248 bytes of
# comment with zero directives, which tells a crawler nothing.
#
# That matters because the prerendered pages deliberately withhold the
# analysis — verdicts, realistic credit values, tiers, editorial tips — and
# this API serves all of it as clean JSON at /api/cards/<id>. A crawler that
# finds the API gets by the side door exactly what the front door withholds,
# in a format it prefers.
#
# This is not a security control and is not treated as one. The repository is
# public, the data is in it, and a client that ignores robots.txt is
# unaffected. It is the standard, honest way to say "this host is a machine
# interface, not content" to the crawlers that do honour it, which includes
# Google, OpenAI, Anthropic and Perplexity.
ROBOTS_TXT = """\
# api.thewalletaudit.com is a JSON API for the site's own frontend.
# There are no pages here to index. The readable content, including how any
# of these numbers are arrived at, is at https://thewalletaudit.com
User-agent: *
Disallow: /

Sitemap: https://thewalletaudit.com/sitemap.xml
"""


@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
def robots() -> str:
    """Ask crawlers not to index the API host. See ROBOTS_TXT for why."""
    return ROBOTS_TXT


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


# ─── Rate limiting for /api/events ────────────────────────────────────────────
# /api/events is public, unauthenticated and writes a row per call, so without
# a ceiling one client can grow the table without limit. The field caps in
# EventIn bound how big each row can be; this bounds how many.
#
# Deliberately in-process and dependency-free: this is a cheap analytics
# endpoint, and a shared store (Redis) would be more moving parts than the
# problem justifies. The consequence is that the limit is per worker, so N
# workers allow N x the rate. That is fine — the point is to turn "unbounded"
# into "bounded", not to meter precisely.
#
# The key is a salted hash of the client IP, held only in memory and never
# written anywhere. That keeps SessionModel's "no PII stored" guarantee intact:
# the raw IP is read from the request, used to derive a key, and dropped.
_RATE_LIMIT_MAX_EVENTS = 120
_RATE_LIMIT_WINDOW_SECONDS = 60
# Bounds worst-case memory if a lot of distinct clients (or spoofed
# X-Forwarded-For values) arrive inside one window. Past this the map is
# cleared wholesale rather than grown; dropping counters fails open, which for
# analytics is the right direction to fail.
_RATE_LIMIT_MAX_KEYS = 10_000
_rate_limit_salt = os.urandom(16)
_rate_limit_hits: dict[str, tuple[float, int]] = {}


def _client_key(request: Request) -> str:
    """A stable, non-reversible per-client key. Prefers Cloudflare's
    CF-Connecting-IP, then the first hop of X-Forwarded-For, then the direct
    peer. Hashed with a per-process random salt so the value in memory isn't
    a raw address even transiently in a dump."""
    ip = (
        request.headers.get("cf-connecting-ip")
        or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    return hashlib.blake2b(_rate_limit_salt + ip.encode(), digest_size=16).hexdigest()


def _rate_limited(request: Request) -> bool:
    """True when this client has already spent its allowance for the current
    window. Fixed window rather than sliding: a burst straddling a boundary can
    briefly get double the allowance, which does not matter here."""
    now = time.monotonic()
    key = _client_key(request)

    if len(_rate_limit_hits) > _RATE_LIMIT_MAX_KEYS:
        _rate_limit_hits.clear()

    window_start, count = _rate_limit_hits.get(key, (now, 0))
    if now - window_start >= _RATE_LIMIT_WINDOW_SECONDS:
        window_start, count = now, 0

    if count >= _RATE_LIMIT_MAX_EVENTS:
        _rate_limit_hits[key] = (window_start, count)
        return True

    _rate_limit_hits[key] = (window_start, count + 1)
    return False


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

    # Same silent-drop contract as the bot check above: the caller ignores the
    # response either way, so a limited client gets a 200 and no row rather
    # than an error it would never read. Note the bot filter is analytics
    # hygiene, not a control — any client can send a browser User-Agent — so
    # this runs independently of it rather than behind it.
    if _rate_limited(request):
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


@app.post("/api/client-errors")
def track_client_error(error: ClientErrorIn, request: Request) -> dict:
    """Record one frontend JavaScript error — the first-party half of issue
    #149. Same contract as /api/events in every way that matters: fire-and-
    forget from the client, silent drop for bot traffic, and the same
    per-client rate limiter (a shared budget is deliberate — an error storm
    from one client shouldn't get its own fresh allowance on top of the
    events one, and the reporter already dedupes and self-caps per page
    load, so legitimate error volume is a rounding error next to page
    views). Length caps live on ClientErrorIn, so by the time this body
    runs, every field is bounded."""
    user_agent = request.headers.get("user-agent")
    if _is_bot(user_agent):
        return {"status": "ok"}
    if _rate_limited(request):
        return {"status": "ok"}

    record_client_error(
        message=error.message,
        session_id=error.session_id,
        path=error.path,
        stack=error.stack,
        component_stack=error.component_stack,
        device_type=_device_type(user_agent),
    )
    return {"status": "ok"}


# Feedback gets its own, far tighter budget. /api/events is calibrated for page
# views at 120/minute; that many *written opinions* per minute from one client
# is a spam firehose against a table whose whole purpose is human text. This is
# the same fixed-window mechanism, counted separately so the two cannot spend
# each other's allowance.
_FEEDBACK_RATE_LIMIT_MAX = 6
_FEEDBACK_RATE_LIMIT_WINDOW_SECONDS = 3600
_feedback_rate_limit_hits: dict[str, tuple[float, int]] = {}


def _feedback_rate_limited(request: Request) -> bool:
    now = time.monotonic()
    key = _client_key(request)
    if len(_feedback_rate_limit_hits) > _RATE_LIMIT_MAX_KEYS:
        _feedback_rate_limit_hits.clear()
    window_start, count = _feedback_rate_limit_hits.get(key, (now, 0))
    if now - window_start >= _FEEDBACK_RATE_LIMIT_WINDOW_SECONDS:
        window_start, count = now, 0
    if count >= _FEEDBACK_RATE_LIMIT_MAX:
        _feedback_rate_limit_hits[key] = (window_start, count)
        return True
    _feedback_rate_limit_hits[key] = (window_start, count + 1)
    return False


def _is_known_card(slug: str) -> bool:
    """Whether the slug names a real card. A junk analytics row is inert, but
    a junk feedback row lands in a per-card average — and a plausible
    misspelling would quietly split a real card's score rather than obviously
    breaking. Checked against the already-warm catalog, not the database."""
    return any(card.id == slug for card in get_card_summaries())


@app.post("/api/feedback", status_code=201)
def submit_feedback(feedback: CardFeedbackIn, request: Request) -> dict:
    """Record one visitor's experience of a card they hold.

    Unlike /api/events, this is a person pressing a button and waiting, so it
    behaves like a form and not like a beacon: it returns 201 with the new
    row's id, and a failure is a real error the UI can show rather than a
    silently dropped write. Someone who took the time to write a paragraph
    should not be told "thanks" when nothing was saved.

    Rate limited by the same per-client budget as /api/events. Sharing it is
    deliberate: it is one bound on how much a single client can write to this
    database, and splitting it into two budgets would raise the total rather
    than lower it.

    Bot submissions are accepted and dropped, exactly like track_event, rather
    than rejected with an error. A spammer learns nothing from a 201, and a
    misclassified real visitor is never shown a failure for a submission that
    a human could not distinguish from a successful one. The cost is that
    genuine feedback from an unusual client is silently lost, which is the
    same trade the analytics endpoint already makes.
    """
    if _feedback_rate_limited(request):
        raise HTTPException(status_code=429, detail="Too many submissions. Try again later.")

    # Accepted and dropped rather than refused, exactly like track_event. A
    # spammer learns nothing from a 201, and a misclassified visitor is never
    # shown a failure. The cost is that genuine feedback from an unusual
    # client is lost silently, the same trade the analytics endpoint makes.
    if _is_bot(request.headers.get("user-agent")) or not _is_known_card(feedback.card_id):
        return {"status": "ok"}

    feedback_id = record_card_feedback(
        card_slug=feedback.card_id,
        rating=feedback.rating,
        maximizes_value=feedback.maximizes_value,
        held_for=feedback.held_for,
        would_keep=feedback.would_keep,
        comment=feedback.comment,
        session_id=feedback.session_id,
        device_type=_device_type(request.headers.get("user-agent")),
    )
    return {"status": "ok", "feedback_id": feedback_id}
