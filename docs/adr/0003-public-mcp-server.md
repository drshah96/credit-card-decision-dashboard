# 0003 — Public, key-authenticated MCP server
Status: accepted
Date: 2026-11-06

## Context

Third-party AI agents, such as shopping agents, should be able to call The Wallet
Audit for verified card data instead of scraping the site. No third party depends
on this today. The owner asked for an MCP (Model Context Protocol) server offering
`get_card`, `compare_cards`, `rank_by_category` and `estimate_value`. Every
answer must carry the issuer source and a "last verified" date. Access must be
by key, and the server must run on Render next to the site.

Nothing breaks if this is deferred. What makes it an architecture decision is
that five of its parts get expensive to change once outside agents depend on
them:

- the public hostname;
- the tool contract;
- how the server says "this value is not recorded";
- what "last verified" means and where the date comes from;
- the promise that rankings ignore monetization.

A third-party agent cannot read our commit log. Whatever these mean on day one,
the agents will act on.

The forces, all verified below:

- **The free tier is the budget.** There is one free Render web service, Neon
  bills compute per wake, and a cold start takes about 60 s.
- **Ranking exists only in TypeScript**, and the product's central claim is
  that it is blind to `is_affiliate_link`.
- **No per-card verification date exists anywhere.** ADR 0001 sketched where
  one should live and said it must never be backfilled from a proxy.
- **Card content has `null` in fields where the site deliberately does not
  distinguish "none" from "not audited".**
- **The API host sits behind a Cloudflare zone** whose Bot Fight Mode has
  already challenged datacenter traffic once.

### What I read

`CLAUDE.md`, the root, `backend/` and `frontend/` READMEs, ADR 0001 in full,
and ADR 0002's log entry in my memory. In the backend: `main.py`, `models.py`,
`db.py`, `services/cards.py`, `scripts/seed_catalog.py`, `scripts/drafts.py`
and the class list of `db_models.py`. In the frontend: `topPickCategories.ts`,
the helpers in `cardTaxonomy.ts` (`parseMultiplierValue`,
`excludeHiddenSecuredCards`, `CLASSIFICATION`), and the value and rates code in
`CardDetailPage.tsx`, `ComparePage.tsx`, `TopPickPage.tsx` and
`MethodologyPage.tsx`. Also `topPickCategories.test.ts` (the blindness tests),
`render.yaml`, `pyproject.toml` and `uv.lock`, and every workflow in
`.github/workflows/`. Tests: `tests/backend/conftest.py`, `test_render_yaml.py`
and `test_readme_facts.py`. Agent memory:
`.claude/agent-memory/card-verifier/*` (all ten source-route notes). History:
the seven Sep 2026 refresh commits, their full messages, and the merged branch
range `0eb156e^1..0eb156e^2`. Plus the installed source of `mcp==2.3.0`.

### What I verified, and how

**Repo state (read in code, re-checkable at `0eb156e`, which is both `HEAD` and
`origin/development`):**

- **The read path.** `services/cards.py` opens a fresh `session_scope()` per
  call and filters `is_active`. There is no cache. `main.py`'s lifespan calls
  `get_card_summaries()` once at boot.
- **`seed_catalog` deactivates missing cards.** It runs with
  `deactivate_missing=True` for the default pattern, so a card in the DB but
  not in files is set `is_active=False` on the next boot.
- **`drafts promote`** writes through `upsert_card` to whatever `DATABASE_URL`
  is set. Its only control is the tty gate.
- **The catalog is 109 live cards** (plus 1 under `staging/`). That is 904 KB of
  JSON on disk, or 741 KB compact. A card's compact JSON is median 6.1 KB and
  max 16.0 KB.
- **`official_url` is on 108 of 109 cards.** `amex-green` has none.
- **`welcome_bonus` is present on 107 files** (78 set, 29 null). The site
  deliberately does not render it (see Decision 5).
- **Nulls are overloaded.** All 109 files carry every nullable rate key.
  `penalty_apr` is null on all 17 Capital One cards, and intro APRs are null on
  78 and 80 cards.
  - `CardDetailPage.tsx`'s comment on `formatAprRow` says the "—" rendering
    "deliberately doesn't distinguish 'this card has no such offer' from 'not
    yet audited'".
  - `_intro_apr` in `services/cards.py` says null means either.
  - Only `foreign_transaction_fee: false` is a positive "none" (107 of 109
    set).
- **Realistic value as the site computes it.**
  - `CardDetail` seeds every slider from `default_value` over all non-removed
    credits, any tier. `HeroTakeWidget` shows `totalUsed - annualFee`.
  - `ComparePage.yourCreditsTotal` uses the same sum.
  - "Best-case net" is `annual_fee - total_max_credits`, shown sign-flipped.
  - `CardSummary.total_easy_credits` sums easy-tier defaults only.
  - No credit has `default_value > max_annual`. The only `max_annual == 0`
    credit is removed (`amex-platinum` `saks`).
  - Credit ids include an underscore (`capital-one-venture` `ge_tsa`).
  - At most 12 credits per card, on 49 of the 109 cards.
- **Ranking.** `computeTopPicks` returns the top 3 per category for 18
  categories.
  - `TopPickPage` pools when `selectedIds.size > 0`, over the selected cards
    only.
  - `ComparePage.MAX_CARDS = 4`. "My Cards" has no cap.
  - The tiebreak is `a.card.name.localeCompare(b.card.name)`.
- **Multiplier and cpp edge cases.**
  - One multiplier has no digits: `citi-macys` "Points on Star Money Days". It
    parses to `-Infinity`.
  - 13 cards have no redemption options (`best_cpp` 0.0) and also no earn
    rates.
  - Category strings contain no non-ASCII letters. Their only non-ASCII
    characters are `×`, `–` and `™`. Multipliers add only `¢`.
  - All 109 card names are distinct.
- **Pools and twins.** Pooling cards: Chase UR has 4 (2 receivers) and Citi
  ThankYou has 4 (2 receivers). There are 8 secured-twin pairs.
- **Tests and CI.**
  - Baseline is `uv run pytest`: 988 passed. Re-run for this ADR on the project
    venv.
  - Existing tests build `TestClient(app)` at module level without a `with`, so
    the lifespan never runs in them.
  - `test_readme_facts.py` reads every root-README table row matching
    `^\| ([A-Za-z .]+) \| (\d+) \|$` as an issuer count. A new root-README table
    with rows like `| Rate limit | 60 |` would break it.
  - On a push to `main`, only `CI` (jobs `backend`, `frontend`) runs. Scheduled
    keep-warm runs also attach to `main`'s latest commit (see D13-A14).
  - Branch protection on `main` requires `backend` and `frontend` (GitHub API).
  - **`development` is not protected** (GitHub API: "Branch not protected").
- **Refresh evidence.** The Sep 2026 refresh is seven commits on `development`,
  on branch range `0eb156e^1..0eb156e^2`.
  - That branch was cut after 2026-08-30 12:26 ET.
  - The commits are dated 2026-09-05 and 2026-09-06 UTC.
  - Their full SHAs resolve on the public remote
    `github.com/drshah96/credit-card-decision-dashboard`.
- **Which cards that refresh covered.** The member set is exactly the 86
  non-`cobrand` cards in `CLASSIFICATION`.
  - Per-issuer counts in the commit messages match the non-cobrand counts
    exactly: Amex 14, Chase 17, Citi 11, BofA 10, Capital One 10, Wells Fargo 6,
    U.S. Bank 9, Discover 6, Bilt 3.
  - None of the seven commits touched a cobrand file.
  - `CLASSIFICATION`'s id-to-group mapping is identical at every evidence
    commit and at HEAD, and the card set is the same 109 files.
  - `367edbe` names its Wells Fargo and U.S. Bank cards and its 17 remaining
    cards explicitly.
  - The commit prose has count typos: "986", "16 cards" for 17, "Six" for
    seven. So membership below is derived from named lists and categories,
    never from the prose counts.

**The SDK (installed `mcp==2.3.0` into a scratchpad directory, never the
project venv). I read the source and ran experiments.** Paths are relative to
site-packages.

| Fact | Where |
|---|---|
| `from mcp.server import MCPServer`; `MCPServer(name, title, description, instructions, website_url, icons, version, auth_server_provider, token_verifier, *, lifespan, log_level="INFO", auth, middleware, ...)` | `mcp/server/mcpserver/server.py:157` |
| **The constructor calls `configure_logging(log_level)`, which runs `logging.basicConfig(level=..., format="%(message)s", handlers=[StreamHandler])`**. Measured: the root logger goes from no handlers at WARNING to a StreamHandler at INFO with the default. | `mcp/server/mcpserver/utilities/logging.py` |
| `streamable_http_app(*, streamable_http_path="/mcp", json_response=False, stateless_http=False, max_request_body_size=4 MiB, transport_security=None, host="127.0.0.1", ...)` returns a Starlette app whose lifespan runs `session_manager.run()` | `server.py:1288`, `mcp/server/lowlevel/server.py:732-852` |
| With `transport_security=None` and a localhost `host`, it auto-enables DNS-rebinding protection for localhost only, so a production Host would be rejected unless settings are passed | `lowlevel/server.py:752-758` |
| `StreamableHTTPSessionManager.run()` may be entered **once per instance** (RuntimeError otherwise). Mounting disables the sub-app lifespan, so the parent must enter it | `mcp/server/streamable_http_manager.py`, docs `/run/asgi/` |
| Stateless mode builds a fresh transport per request with `can_send_request=False` | `streamable_http_manager.py:_handle_stateless_request` |
| `RequestBodyLimitMiddleware` answers 413 on `Content-Length` or streamed overflow, before parsing | `mcp/server/transport_security.py` |
| `TransportSecuritySettings(enable_dns_rebinding_protection, allowed_hosts, allowed_origins)`. A POST without an `application/json` content type gets 400, a bad Host 421, and a present-but-disallowed Origin 403. An absent Origin is allowed | `transport_security.py` |
| Protocol versions: 2024-11-05, 2025-03-26, 2025-06-18 and 2025-11-25 by handshake; 2026-07-28 is a stateless per-request envelope routed by the `MCP-Protocol-Version` header, through the same body limit and security settings | `mcp_types/version.py`, `mcp/server/_streamable_http_modern.py` |
| **Sync tools run in `anyio.to_thread.run_sync`; async tools run on the event loop** | `mcp/server/mcpserver/utilities/func_metadata.py:164` |
| A return annotation `Annotated[CallToolResult, Model]` publishes `Model`'s schema as `outputSchema` and validates `structured_content` against it unless `is_error`. A plain `BaseModel` return makes the text block `to_json(indent=2)` | `func_metadata.py` (`convert_result`, `_convert_to_content`) |
| **Unknown tool arguments are silently ignored.** `ArgModelBase` sets no `extra="forbid"`, and nothing validates arguments against the JSON schema | `func_metadata.py:96`; experiment |
| Argument validation failure gives `is_error` with "Error executing tool X: <pydantic message>". The input repr is truncated by pydantic (about 50 chars measured) | `mcp/server/mcpserver/tools/base.py` |
| `ToolError` gives `is_error` with "Error executing tool X: msg". Any other exception gives only "Error executing tool X", with the traceback logged at ERROR (no leak; measured with a fake DSN in the message). `MCPError` gives a JSON-RPC protocol error | `tools/base.py`, `mcpserver/exceptions.py` |
| **Returning `CallToolResult(is_error=True, content=[...])` directly gives exactly that text, with no prefix and no output validation** | experiment |
| `ToolAnnotations(title, read_only_hint, destructive_hint, idempotent_hint, open_world_hint)`, camelCase on the wire | `mcp_types/_types.py:1365` |
| `from mcp.server.mcpserver import Context`; `ctx.request_context.lifespan_context` reaches lifespan state. The Context parameter is excluded from `inputSchema` | `mcp/server/context.py:41`; experiment |
| Auth hooks: `TokenVerifier.verify_token` and `AuthSettings`, where **`issuer_url` is required** and `resource_server_url` must be passed explicitly. The 401 comes from `RequireAuthMiddleware`. RFC 9728 metadata routes are added only when `resource_server_url` is set | `mcp/server/auth/{provider.py:124,settings.py,middleware/bearer_auth.py}`, `lowlevel/server.py:835` |
| `MCPServer.middleware` is documented "Provisional - the signature may change in a 2.x minor release". A refusal raised there reaches the client application as a JSON-RPC error, not the model | `server.py:279`; docs `/advanced/middleware/` |
| Client: `from mcp import Client`. `Client(server)` is in-memory (`mcp/client/_memory.py`). `Client(streamable_http_client(url, http_client=httpx2.AsyncClient(headers=...)))` is HTTP. `call_tool` returns `.is_error`, `.structured_content` and `.content`. DELETE is sent only when a session id exists, and 405 is tolerated | `mcp/client/client.py`, `mcp/client/streamable_http.py:695,713` |
| `mcp.types` re-exports `mcp_types` | experiment |

**Integration experiments (scratchpad venv built from our `uv.lock` plus
`mcp==2.3.0`):**

- **Dependency resolution.** Starlette 1.3.1, FastAPI 0.141.1, pydantic 2.13.4,
  anyio 4.14.1 and uvicorn 0.52.1 all stay at their locked versions.
  - `mcp` requires `httpx2>=2.10.0`, which **conflicts with the locked 2.9.1**.
    The resolver moves `httpx2` and `httpcore2` to 2.16.0 and makes them
    production dependencies.
  - New packages: `mcp`, `mcp-types`, `sse-starlette`, `pyjwt[crypto]` (with
    `cryptography`, `cffi`, `pycparser`), `jsonschema` (with `attrs`,
    `referencing`, `rpds-py`, `jsonschema-specifications`),
    `opentelemetry-api` and `python-multipart`.
  - **All 988 existing tests pass under that resolution.**
- **Mounting.** A custom ASGI guard registered as `Route("/mcp", endpoint=guard)`
  gets `POST /mcp` with no redirect.
  - FastAPI's own 405 (`POST /api/cards`) and JSON 404 are preserved.
  - `Mount("/mcp", ...)` with `streamable_http_path="/"` **issues a 307 to
    `/mcp/` on real uvicorn, with an `http://` Location**. `TestClient` hides
    this because it follows redirects. Use `follow_redirects=False` in every
    MCP HTTP test.
  - `Mount("/", ...)` turns existing 405s into 404s, even when registered
    after every route (`POST /api/cards` measured 404).
  - `POST /mcp/` under the Route approach is a FastAPI 307 to `http://`, so it
    needs its own route.
- **Lifespan.** Rebuilding the SDK sub-app per lifespan lets `TestClient` enter
  the lifespan repeatedly. One instance cannot.
- **Stateless GET.** A stateless-mode GET holds the connection open
  indefinitely (curl `--max-time 5` expired).
- **Slow body.** A `Content-Length` larger than the body sent stalls the read
  until the client gives up (8 s observed, curl exit 28).
- **Deep nesting.** A 30 KB depth-15,000 body makes stdlib `json.loads` raise
  `RecursionError`. The SDK's pydantic-core parser returns a clean 400 at about
  depth 200.
- **The official client** completes initialize, `tools/list` and `tools/call`
  through the guard. That is three POSTs, with no GET and no DELETE.

**Measurements (prototype projections over the real 109 cards; scripts in the
scratchpad, not committed):**

- **Snapshot build** (`get_card_summaries` plus `get_cards` for all ids on
  SQLite): 61 ms.
  - About 7.2 MB retained and 11.7 MB peak.
  - The canonical JSON is 889 KB.
  - Process RSS is 118 MB with `mcp` imported.
- **Compute.** The Python ranking port runs all 18 categories over the full
  catalog in 6 ms (one category about 0.35 ms). `get_card` takes 0.04 ms.
- **Parity, the most important result.** The prototype Python port was run
  against the real TS `computeTopPicks` (executed with Node 25 type stripping)
  over 9 scenarios × 18 categories.
  - It matches exactly on the top 3 and on the full list (up to 88 entries),
    **but only when names compare by `(name.casefold(), name)`**.
  - Plain codepoint order diverges from position 25: "AT&T Points Plus" sorts
    before "Altitude Connect", and "TSC" before "The Key".
  - Many value-and-fee ties reach the name tiebreak.
  - Node's `localeCompare` order equals the casefold order over all 109 names
    under `LANG=C.UTF-8` (resolves to en-US), en_US and sv_SE.
- **Payload sizes** are in Decision 5.

**External documentation fetched today:**

- **Render free tier** (render.com/docs/free): 750 free instance hours per
  workspace per month, shared across free web services. Exhaustion suspends
  all free web services until next month. Services spin down after 15 minutes
  without inbound traffic, and spin-up takes about a minute.
- **Render deploys**, via a search of the Blueprint spec on render.com:
  `autoDeployTrigger: checksPass` deploys only after a commit's checks pass.
  Neutral and skipped count as passes. Zero checks or any failure blocks.
- **MCP authorization spec, latest (2026-07-28)**: authorization is OPTIONAL.
  HTTP implementations SHOULD conform (OAuth 2.1, RFC 9728 Protected Resource
  Metadata). Tokens MUST NOT go in the query string.
- **Claude Code docs** (code.claude.com/docs/en/mcp):
  - Add a server with `claude mcp add --transport http <name> <url> --header
    "Authorization: Bearer ..."`. `.mcp.json` takes `"type": "http"`, a
    `headers` block and `${VAR}` expansion.
  - **The per-request timer for HTTP servers is the greatest of 60 s, the
    server's tool timeout and `MCP_TIMEOUT`.**
  - Tool output warns above 10,000 tokens and defaults to a 25,000-token limit.
  - **Text results over 50,000 characters are saved to a file.**
- **`mcp-remote` README**: a Claude Desktop config using `--header` with env
  expansion. It records a bug on Claude Desktop (Windows) where spaces inside
  `args` get mangled.

**Live checks:**

- `api.thewalletaudit.com/healthz` and `thewalletaudit-api.onrender.com/healthz`
  both answer 200 with `server: cloudflare`, a `cf-ray` and
  `x-render-origin-server: uvicorn`. So the raw origin is also behind a
  Cloudflare edge, but Render's, not our zone.
- Keep-warm runs against the raw origin from GitHub-hosted runners succeeded on
  2026-11-06 (`gh run list`).
- `mcp.thewalletaudit.com` had no DNS record when this was written. It now does (D13-A13).

### What I am assuming, and what each assumption gates

1. **A DNS-only record in our zone is untouched by our zone's Bot Fight Mode,
   and Render's edge does not challenge datacenter IPs.**
   - The evidence is keep-warm reaching the raw origin from Azure-hosted
     GitHub runners. Other clouds (AWS, GCP) are unproven.
   - Gates Decision 1.
   - Verified by the smoke workflow in migration step 9.
2. **Render's Cloudflare edge rejects a client-supplied `CF-Connecting-IP`
   (error 1000) and overwrites `True-Client-IP`. Render keeps a client-supplied
   leftmost `X-Forwarded-For`.**
   - Third-party evidence only (github.com/johnbeynon/header-test, author not
     shown to be Render staff).
   - Gates only the per-IP failed-auth limiter in Decision 8.
   - The smoke workflow checks it directly.
3. **Render issues a certificate for a grey-cloud custom domain.**
   - Precedent: the frontend root is DNS-only and served on Render's
     certificate, per `render.yaml`'s domain comments.
   - Confirmed on 2026-11-06: Render issued the certificate for this hostname.
4. **Saving an env var in the Render dashboard redeploys the service within
   minutes.** This gates the revocation latency in Decision 7. The owner
   measures it once.
5. **The Render free instance is 512 MB / 0.1 CPU.**
   - Pricing page, not re-fetched in this run.
   - The design needs well under 50 MB extra, so only the CPU side matters,
     and the tools are sub-millisecond.
6. **Whether a given client shows the model the text block, the
   structuredContent, or both is unverified.** Budgets in Decision 5 keep even
   the doubled size under Claude Code's 50,000-character file threshold.
7. **Tokens are about 3.5 bytes each for this JSON.** Unmeasured; budgets are
   enforced in bytes.
8. **Each commit date bounds its verification reads from above, by at most
   about a day.**
   - The reads happened on that branch between 2026-08-30 and the commit.
   - Card-verifier's route notes date their Amex and Capital One reads
     2026-09-05, the same day as those commits.

### Defects found along the way (pre-existing, not fixed here)

- **The footer will overclaim.** The unmerged footer fix (`6961e9d` on
  `fix/footer-audit-dates`) changes the copy to "The last full
  issuer-by-issuer re-check finished September 6, 2026".
  - That pass skipped all 23 cobrand cards.
  - Once this server reports those 23 as `not_verified`, site and MCP will
    contradict each other.
  - Fixed by owner action O9: the merged copy says the re-check covered 86 of the 109
    cards. It reaches the live site with the next release to `main`.
- **The site's tie order depends on the browser locale.** `localeCompare`
  without a locale uses the user's default collation, and ties reach it on
  real data. Every locale tested agrees on today's names. The parity pin in
  Decision 6 is what would notice a name where they stop agreeing.
- **Card content cannot say "confirmed none"** for most rate fields. The fix is
  a content-schema decision outside this ADR. Decision 5 represents the gap
  honestly instead.
- **`development` accepts merges with red CI.**

---

## Decision

D13 overrides anything earlier that it conflicts with, including field names and server
wording in D5. For exact served text, the code and the surface snapshot are authoritative.

Ship a Python MCP server inside the existing API process, on a new DNS-only
hostname `mcp.thewalletaudit.com`, behind a guard we own. It serves five
read-only tools from an immutable in-process snapshot, with an explicit
provenance block on every card and a `{status, value}` wrapper on every field
that can be unrecorded. Ranking is a Python port of the TS code, pinned to it
in CI by a shared fixture. Access is by pre-shared, hashed API key.

### D1. Where it runs: inside `thewalletaudit-api`, at `POST https://mcp.thewalletaudit.com/mcp`

**The call.**

- Same process, same Render service.
- A new custom domain on that service: `mcp.thewalletaudit.com`, a CNAME to
  `thewalletaudit-api.onrender.com`, **proxy status DNS only**.
- The MCP endpoint is exactly `/mcp`.
- `api.thewalletaudit.com/mcp` is refused with 421 (it is not in the allowed
  Host list).
- The raw origin `thewalletaudit-api.onrender.com/mcp` works as an
  undocumented fallback.

**Why the same process.** It is decided by instance hours, and the arithmetic
is not close.

- Keep-warm starts runs at :00 and :30 of UTC hours 11–23 and 0–3, and each
  pings for 50 minutes. So the API is awake from about 11:00 to 04:35 UTC:
  - about 17.6 h/day;
  - 528 h in a 30-day month, 545 h in a 31-day month.
- Always-on would be 720 or 744 h, inside the 750 h allowance.
- A second free service kept warm on the same schedule brings the workspace to
  1,056–1,090 h. That exhausts the allowance around day 21 and **suspends every
  free service, including the site's API, for the rest of the month.**
- Left cold instead, the second service gives agents a fresh ~60 s cold start
  after every 15 idle minutes. That is the same length as Claude Code's
  60-second per-request floor.

**Cold-start and Neon cost.**

- MCP traffic shares the API's warmth, and **adds zero Neon queries per call**
  (D3, pinned by a test).
- Its only Neon cost is indirect. A request during the overnight sleep window
  wakes the service, and boot runs `alembic`, `seed_catalog` and the snapshot
  load, which wakes Neon for one 5-minute window.
- Render's 15-minute idle rule caps that at one boot per idle gap.
- Extending keep-warm to 24/7 is an owner choice (O10). At 744 h it fits under
  750 with 6 h of margin.

**Why DNS-only.** Our zone's free-plan Bot Fight Mode is zone-wide with no
skip rules (`keep-warm.yml` documents both). It challenged GitHub runners in
August, and agents run in datacenters. A grey-cloud record is not proxied by
our zone at all, so the setting cannot apply. Traffic still passes Render's
Cloudflare edge, which today serves datacenter callers: keep-warm runs from
GitHub-hosted runners against the raw origin succeed.

What DNS-only gives up is our zone's WAF on that one hostname, and
`CF-IPCountry`, which only the analytics routes read. The raw origin already
exposes every route without our zone, so a second unproxied hostname adds no
new class of exposure.

**The concrete verification step** is migration step 9: a `workflow_dispatch`
smoke job run from a GitHub-hosted runner after the first deploy. It records
challenge headers on all three hostnames and checks the IP-header behaviour
assumption 2 depends on.

**Reversibility.**

- **Process placement is cheap.** The MCP is one package; moving it to its own
  service later is a deploy change behind the same hostname.
- **The hostname is expensive.** Integrators paste it into configs, so choose
  once.
- **The proxy toggle is cheap.** It can be orange-clouded later if the zone
  ever gets per-path bot exceptions.

### D2. Python, `mcp>=2.3.0,<3` (locked at 2.3.0), Streamable HTTP, stateless, JSON responses

**Python.** The catalog, the `Card`/`CardSummary` models and the read path are
Python. A TypeScript MCP server could import `computeTopPicks` directly, but it
needs a Node runtime: either a second service (which D1 rules out) or two
runtimes in one free instance. The price of Python is a port of about 470
lines of ranking logic, which D6 pins.

**Transport.** Streamable HTTP, the protocol's remote transport.

- `stateless_http=True`: no session state to lose when the free instance
  sleeps or restarts, which it does nightly.
- `json_response=True`: no SSE, so no long-lived connections on one worker, and
  GZip cannot buffer a stream.
- The tools are pure request/response with no progress, sampling or
  elicitation.
- The SDK's stateless mode already disables server-to-client requests.
- The protocol's newest revision (2026-07-28) is itself a stateless
  per-request envelope, and 2.3.0 serves it through the same app.

**Reversibility.** Transport mode is cheap (two flags), as long as no tool ever
depends on session state. The SDK choice is moderate: the guard, the tools and
the tests are SDK-shaped.

### D3. Data access: an immutable in-process snapshot built at boot

**The call.** At lifespan start, build `CatalogSnapshot` once, off the event
loop (`anyio.to_thread.run_sync`), from:

- `get_card_summaries()`;
- `get_cards(all ids)`, the same functions and the same derived fields the
  site's API serves;
- the verification sidecars from D4, read from repo files.

Precompute the 18 whole-catalog rankings. Every tool call reads only this
object, so a call makes **zero database statements**, pinned by a test.

**The staleness bound, stated precisely.**

- **Normal path: zero.** The snapshot equals the database as of process start.
  Content reaches production only by deploy, the start command reseeds before
  uvicorn, and the snapshot is built after the seed.
- **Out-of-band DB writes, i.e. `drafts promote` against the production
  `DATABASE_URL`.** The tty gate permits a human to do this.
  - The site sees the write at once; the MCP sees it at the next process start.
  - That is the next sleep or deploy, and unbounded if agents keep the process
    awake.
  - The next boot's `seed_catalog` would also deactivate that card unless its
    file has been deployed. So this path is already unsupported in practice
    (O11).
  - Every response carries `meta.catalog_digest`, a hash of exactly what the
    MCP is serving, so divergence is detectable.

**Failure isolation.** If the MCP config or the snapshot build raises, the
endpoint is disabled: `/mcp` answers 503, an ERROR line is logged, and the
site's API keeps serving. A malformed sidecar degrades only that card to
`not_verified` (ADR 0001 §7b/7c, safe direction). The MCP must never be the
reason the site does not boot.

**Reversibility: cheap.** It is internal. Moving to per-call reads would mean
deliberately deleting the zero-statement test, which is the point of having
it.

### D4. Verification dates and issuer sources: sidecars per ADR 0001, backfilled only from evidence

**Location and model.** These follow ADR 0001 decisions 1 and 7a: one file
per card at `backend/data/refresh/{card_id}.json`, flat, outside
`backend/data/cards/` so no catalog glob (Python or Node) reaches it. The
strict model lives in a new `backend/refresh/state.py`, deliberately not in
`backend/models.py`. This ADR lands the first slice of 0001's step 3:

```json
{
  "card_id": "amex-gold",
  "last_verified_ok_at": "2026-09-05",
  "verification": {
    "evidence": "git:99058a0186dd0d6c093f2a5f8d48fa51769420c8",
    "evidence_scope": "card",
    "facts_sha256": "<64 hex, see D13-A3>",
    "documents": [],
    "not_checked": ["insurance_limits"],
    "note": "Checked field by field against Amex application terms, cardmember agreements and benefit policy pages. Insurance dollar limits are only published behind a cardmember login and were not checked."
  }
}
```

and, for a card with no evidence:

```json
{"card_id": "citi-costco-anywhere-visa", "last_verified_ok_at": null, "verification": null}
```

**Model rules** (Pydantic, `extra="forbid"` on a shared base, frozen):

- **`card_id`** matches the card id pattern.
- **`last_verified_ok_at: date | None`** is a required key with no default.
  `verification: VerificationRecord | None` is the same. A validator enforces
  both null or both set.
- **`VerificationRecord.evidence`** matches
  `^(git:[0-9a-f]{40}|pr:[1-9][0-9]{0,5})$`.
- **`documents`**: at most 20 `{kind: DocumentKind, url: https URL}`.
- **`not_checked`**: unique `SectionKey` values.
- **`note`**: 1–400 characters.
- **`SectionKey`** (StrEnum, a persisted format): `annual_fee`,
  `rates_and_fees`, `credits`, `earn_rates`, `redemption`, `transfer_partners`,
  `insurance`, `insurance_limits`, `perks`, `additional_cards`.
- **`DocumentKind`**: `rates_and_fees`, `cardmember_agreement`,
  `guide_to_benefits`, `application_terms`, `benefit_policy`, `product_page`,
  `other_issuer_document`.
- **`degraded(card_id)`** returns the all-null state, and has nowhere for a
  date to come from. `load_all(card_ids)` is tolerant per card (ADR 0001 §7b).

**The backfill, from evidence only.** All 109 files are created; 86 carry the
dates below and 23 are null. A recorded verification event is not a proxy. It
is the thing ADR 0001 said `last_verified_ok_at` means: "the verifier actually
read an issuer document". The date is the evidence commit's UTC date (assumption
8).

| Evidence (full SHA in file) | Date | Cards | `not_checked` | Note (verbatim into the file) |
|---|---|---|---|---|
| `git:99058a0186dd0d6c093f2a5f8d48fa51769420c8` | 2026-09-05 | all 14 `amex-*` | `insurance_limits` | Checked field by field against Amex application terms, cardmember agreements and benefit policy pages. Insurance dollar limits are only published behind a cardmember login and were not checked. |
| `git:1de0ac5abec4103d96dcc381078ca3ee1d2c3efe` | 2026-09-05 | the 17 non-cobrand `chase-*` | `transfer_partners`, `insurance_limits`, `additional_cards` | Checked against Chase pricing and terms tables, rewards program agreements and Guide to Benefits PDFs. Transfer partners, insurance limits and authorized-user rules were largely not checked. |
| `git:54f0d72c12208c45f24898d3617a26a0296cb024` | 2026-09-05 | the 11 non-cobrand `citi-*` | `rates_and_fees` | Benefits were checked against Citi's own pages. Citi fills in rate and fee numbers in the browser, so most APRs and fees could not be confirmed in this pass. |
| `git:89bc4442b6227d64c9b9c346e0b988ec2598116c` | 2026-09-05 | all 10 `bofa-*` | `insurance` | Checked against Bank of America's card index and public sample cardmember agreements. Bank of America publishes no Guide to Benefits, so insurance was not checked. |
| `git:cf1ab028b88caa89ff1bf32ca2b0564d170d2ee8` | 2026-09-05 | the 10 non-cobrand `capital-one-*` | `rates_and_fees` | Checked against Capital One product pages and Guide to Benefits PDFs. Only the annual fee and purchase APR were reachable; other APRs and fees were not checked. |
| `git:367edbe845e12795543058e04cf394f269bc1f23` | 2026-09-06 | `wells-fargo-reflect`, `wells-fargo-active-cash` | `redemption` | Checked against Wells Fargo product pages and its Guide to Benefits. The rewards program terms could not be fetched, so redemption values were not checked. |
| same | 2026-09-06 | `us-bank-smartly`, `us-bank-altitude-go`, `us-bank-cash-plus`, `us-bank-shield`, `us-bank-split` | `insurance` | Checked against U.S. Bank product pages and Pricing and Terms. U.S. Bank publishes no Guide to Benefits, so a missing insurance benefit cannot be confirmed as absent. |
| `git:405c511480a05952bfbb77ab6b9ca4d8da2765c7` | 2026-09-06 | `wells-fargo-autograph`, `wells-fargo-autograph-journey`, `wells-fargo-choice-privileges`, `wells-fargo-choice-privileges-select` | `redemption` | (Wells Fargo note above) |
| same | 2026-09-06 | `us-bank-altitude-connect`, `us-bank-altitude-go-secured`, `us-bank-cash-plus-secured`, `us-bank-secured` | `insurance` | (U.S. Bank note above) |
| same | 2026-09-06 | all 6 `discover-*` | none | Checked against the single Capital One cardmember agreement that has covered the Discover line since 30 June 2026, and Discover's own pages. |
| same | 2026-09-06 | all 3 `bilt-*` | `rates_and_fees` | Benefits were checked against Bilt's card pages. Bilt loads its pricing footnotes in the browser, so APRs and fees were not confirmed in this pass. |

Where the `not_checked` column comes from:

- **Amex, Chase, Citi, BofA and Capital One:** each commit message's own
  "remain unverified" sentences.
- **Wells Fargo, U.S. Bank and Bilt:** the same-pass route notes in
  `.claude/agent-memory/card-verifier/`, committed in `80d72af` and `c683df3`.

Where one issuer statement covers mixed per-card outcomes (Citi's "most"), it
is applied to every card of that issuer. Claiming less verification is the safe
direction. **The 23 cobrand cards stay null.** There is no per-card evidence
they were checked; their sourcing at authoring time is not a verification
event; and borrowing the catalog footer date is exactly what ADR 0001 and
commit `6961e9d` exist to stop.

Two consequences of how this is defined:

- **An empty `not_checked` means none was recorded, not that every field was
  confirmed.** The output schema description says so.
- **A future verification** (a human pass, or 0001's pipeline) writes `pr:<n>`
  evidence and the documents it read, with kinds.

**The pins that keep the dates honest**, in `tests/backend/test_verification_sidecars.py`:

1. **Sidecar stems equal card ids, both ways.** This is ADR 0001's pin. A new
   card cannot ship without a sidecar, and its natural first state is null.
2. **Every file validates strictly**, with no unknown keys.
3. **Anti-borrowing.** A frozen `BACKFILL` ledger in the test maps each
   evidence key to its date and its exact frozen id set (the table above).
   - Any sidecar citing a backfill key must be in that key's set and carry that
     key's date.
   - Every id in a set must carry either that evidence or a strictly later date
     with different evidence. A backfilled date can be superseded, never
     dropped or moved earlier.
   - Copying a backfilled sidecar onto a new card therefore fails CI.
   - Freezing these sets is not a drift risk. They record past events.
4. **No date in the future**, and a null date if and only if a null record.
5. **`degraded()` returns a null date for every hostile input:** an empty
   file, truncated JSON, the wrong shape, a future date, and a fully populated
   valid-looking file (ADR 0001 §7c).
6. **No U+2014 in any note.** These notes are agent-facing copy.

**What "issuer source" means.** Every card carries `issuer_sources`, a typed
list:

- the `official_url` as `kind: "product_page"`, where current terms are
  published;
- plus every document a verification recorded, with its kind.

The schema description says plainly that a product page is where to check
current terms, not proof of what was verified. The Sep 2026 pass recorded
issuer routes, not per-card URLs (the route notes say why: Chase's `LGC`
codes are per-offer). So the backfill lists no documents, and none are
invented. `amex-green` has an empty list and is still `verified` (it was in
the Amex pass). The checkable claim is `verification.evidence_url`, which
links the public commit that recorded the check.

**Amendments to ADR 0001, made explicitly here:**

- **Decision 5, part two** ("seed `last_verified_ok_at` null, never
  backfilled") becomes: seeded from dated per-card verification evidence where
  it exists, null otherwise. The objection to git last-edit dates and to
  today's date stands unchanged.
- **Decision 2** gains the `verification` block. `last_verified_attempt_at`,
  `last_verified_outcome`, `sources[]` and `open_review` stay 0001's to add
  when its pipeline ships, as additive fields on this model.
- **"Derived from sidecars at seed time"** becomes "derived from sidecars when
  a read model is built". Today that is the MCP snapshot. `seed_catalog` would
  do it only if the site's API ever needs the field. The sidecars never enter
  Postgres, so the database stays rebuildable from the repo.

**Reversibility.**

- **The location is expensive** (as 0001 said).
- **The backfill is one-way.** Once dates are published to agents, nobody can
  tell a backfilled date from a real one, which is why it is evidence-only and
  ledger-pinned.
- **The fields are cheap to add.**

### D5. Tool contracts

**Common to every tool.**

- **Annotations:** `read_only_hint=True`, `destructive_hint=False`,
  `idempotent_hint=True`, `open_world_hint=False`.
- **Return annotation:** `Annotated[CallToolResult, <OutputModel>]`.
- **Success results:** the text block is the compact JSON
  (`separators=(",", ":")`) of exactly the structured content, as the spec's
  backwards-compatibility SHOULD requires.
- **Error results:** `CallToolResult(is_error=True)` with one text block and no
  structured content.
- **Tools are `async def`.** That keeps them on the event loop, off the 40-token
  thread pool the site's sync endpoints use. Measured cost is under 1 ms.
- **Names follow `Card`, never the ERD.** Money is whole US dollars, and no
  output property name ends in `_cents` (pinned).
- **Output models** live in `backend/mcp_server/schemas.py`, not
  `backend/models.py`, so `CLAUDE.md`'s rule about where card field names come
  from stays unambiguous.

**Shared types.**

- **`CardId`**: string, pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, length 1–64.
  **`CreditId`**: pattern `^[a-z0-9]+([_-][a-z0-9]+)*$`, length 1–64
  (`ge_tsa`).
- **`Meta`**, the same on every success:
  - `contract_version` ("1.0.0");
  - `catalog_digest` (12 hex characters of SHA-256 over the snapshot's
    canonical JSON);
  - `catalog_card_count`;
  - `market` ("US") and `currency` ("USD"). ADR 0002, if accepted, would add a
    `market` input as a minor version and would forbid mixing markets in one
    comparison or ranking;
  - `methodology_url` (`https://thewalletaudit.com/methodology`).
- **`query`**: every success echoes the applied, validated arguments with
  defaults filled in. The SDK silently ignores unknown argument names
  (verified). This echo is how an agent sees that a misspelled `limit` did not
  apply.
- **`Fact`**: `{"status": "recorded" | "not_recorded", "value": T | null}`, with
  a validator that `recorded` holds exactly when value is not null.
  - Used for: `variable_apr`, `intro_apr_purchases` (`{rate, months}`),
    `balance_transfer_apr`, `intro_apr_balance_transfers`,
    `balance_transfer_fee`, `foreign_transaction_fee` (bool),
    `foreign_transaction_fee_rate`, `cash_advance_apr`, `penalty_apr`,
    `penalty_apr_trigger`, `pay_over_time_fee`, `late_payment_fee`,
    `returned_payment_fee`, `returned_check_fee`.
  - **`not_recorded` never means "none".** A `null` cannot be read as absent,
    because there is no bare `null` to misread. Among these 14 fields, the only
    positive "none" is `foreign_transaction_fee` recorded `false`.
    (`insurance[].level` also holds a literal `"none"`; see D13-A2.)
  - This one-to-one mapping is deliberate. The content cannot say more than
    this, and the server must not either.
- **`ProvenanceRef`** (on list items, including `compare_cards`): `issuer_url`
  (product page or null), `verification_status`, `verified_on`, `not_checked[]`
  and `review_due_on`. See D13-A1 and D13-A3.
- **`Provenance`** (on single-card answers) adds `issuer_sources[]`,
  `not_checked[]`, `note`, `evidence_url` and `site_url`
  (`https://thewalletaudit.com/cards/{id}`). A degraded or null sidecar gives
  `not_verified` with every date-bearing field null.
- **No `served_at` timestamp anywhere.** The honest as-of date for a fact is
  `verified_on`. A serve time invites "as of today" for figures that are as of
  September.
- **Editorial versus fact.** Verdict status, short tag and text, credit `tier`,
  credit `default_value` and `effective_cost` are The Wallet Audit's estimates.
  They sit under `editorial` or carry schema descriptions saying so.
  `max_annual`, fees and rates are issuer terms. The verdict has no separate
  review date, and its factual inputs were last checked on `verified_on`.
- **Withheld by policy.** `welcome_bonus` is never served. `get_card` reports
  `withheld: [{"field": "welcome_bonus", "reason": "Sign-up offers change
  faster than this catalog is re-verified, so they are not served."}]`. This
  mirrors the site, whose card page keeps that block disabled for the same
  reason.

**Error model.**

- The first token of the text is `[<code>]`. The message is 400 characters at
  most.
- Input is echoed only after it has passed its pattern, so any echo is at most
  64 characters of `[a-z0-9_-]`.
- Suggestions come from the catalog via
  `difflib.get_close_matches(id, ids, n=3, cutoff=0.6)`, and always add "Call
  find_cards to search by name."
- Codes, a closed StrEnum pinned by exhaustiveness against the code paths:

| Code | Meaning |
|---|---|
| `unknown_card_id` | Lists every unknown id. Never answers a partial set. |
| `unknown_credit_id` | Lists that card's valid credit ids, 12 at most. |
| `duplicate_card_ids` | The same id passed twice. |
| `duplicate_credit_ids` | The same credit id passed twice. |

Schema violations (a bad category, too many ids, out-of-range integers) are the
SDK's own `is_error` validation messages, which name the field. They are
bounded by the pattern and length limits and by pydantic's input truncation.
They are pinned only for `is_error` and the field name.

**Server `instructions`** (verbatim; no em-dashes; static text, so adding a card
never changes the contract):

> Data on US consumer credit cards, hand-sourced from issuer terms by The Wallet
> Audit. Money is whole US dollars. A field with status not_recorded has no value
> in the catalog: that does not mean the card lacks the feature. Every card
> carries provenance: the issuer page, the date the card was last checked against
> issuer documents, and the areas that check could not confirm; not_verified means
> no recorded check. Verdicts, credit tiers and default credit values are editorial
> estimates. Rankings use the earn multiplier times the card's realistic cents per
> point and never consider affiliate status. Sign-up offers are not served. Use
> find_cards to get card ids.

Server name `thewalletaudit`, title "The Wallet Audit", version
`CONTRACT_VERSION`, `website_url` `https://thewalletaudit.com`. Pass
`log_level="WARNING"` so the constructor's `basicConfig` does not lower the
root logger to INFO.

**The tools.** The fifth tool, `find_cards`, is an addition. None of the other
four can be called without a card id, and nothing else lets an agent discover
one.

**1. `find_cards`** (title "Find cards")

- **Description:** "Search the catalog by name, issuer or rewards program and
  get card ids for the other tools. Returns at most `limit` cards plus
  total_matches and next_offset, so you can tell when there are more. Omit
  query to list every card for an issuer."
- **Input:**
  - `query: str | None` (1–64 characters, no control characters);
  - `issuer: Literal[...] | None` (the 9 `issuer` strings, pinned
    bidirectionally against the catalog);
  - `limit: int = 10` (1–20);
  - `offset: int = 0` (0–200).
- **Matching.** Casefold, strip `®™℠`, and split on whitespace; every token
  must be a substring of the normalized name, id, issuer and points program.
  Never compile user input as a regex. Sort by the collation key from D6.
- **Output:** `meta`, `query`, `total_matches`, `returned`, `next_offset`
  (null at the end), and `cards[]` of `{card_id, name, issuer, network,
  points_program, annual_fee, verdict_status, is_secured_variant_of,
  provenance: ProvenanceRef}`.

**2. `get_card`** (title "Get card")

- **Description:** "One card's fees, rates, credits, earn rates, redemption
  values, insurance and perks, with provenance. Heavy sections (credit tips,
  timeline, transfer partner list, services, additional cards, removed credits)
  are omitted unless requested in sections; omitted_sections lists what was
  left out. Rate and fee fields are {status, value}: not_recorded means the
  catalog has no value, not that the fee is zero."
- **Input:**
  - `card_id: CardId`;
  - `sections: list[Literal["credit_tips", "timeline", "transfer_partner_list",
    "services", "additional_cards", "removed_credits"]] = []`, at most 6, with
    duplicates collapsed in the echo.
- **Output:** `meta`, `query`, `card`, `provenance` (full), `omitted_sections`
  and `withheld`. `card` contains:
  - **identity:** `id`, `name`, `issuer`, `network`, `points_program`,
    `currency`;
  - **`annual_fee`;**
  - **`editorial`:** `verdict_status`, `short_tag`, `verdict_text`,
    `effective_cost`;
  - **earning:** `earn_rates[]` (`category`, `multiplier`, `is_base`) and
    `earn_note`;
  - **`points`:** `currency`, `best_cpp`, `per_100k`, `note`, and
    `redemption_options[]` (`method`, `cpp`, `best`);
  - **`credits[]`** for non-removed credits only: `id`, `name`, `subtitle`,
    `tier`, `max_annual`, `default_value`, `description`, plus `tips` when
    requested;
  - **`value`:** as in `estimate_value` with no overrides;
  - **`rates_and_fees`:** the 14 `Fact`s;
  - **coverage:** `insurance[]` (`coverage`, `level`, `detail`),
    `protection_note`, `rental_note`;
  - **perks:** `has_lounge_access` and `status_perks[]` (`name`, `strength`,
    `note`);
  - **`transfer_partners`:** `airline_count`, `hotel_count`, `highlight`,
    `recent_changes`, plus `partners[]` when requested;
  - **`related`:** `secured_variant_id`, `is_secured_variant_of`,
    `points_pool_id`, `points_pool_receiver`;
  - **`is_affiliate_link`**, a disclosure that ranking never reads.
- **Errors:** `unknown_card_id`.

**3. `compare_cards`** (title "Compare cards")

- **Description:** "Compare 2 to 4 cards side by side: annual fee, realistic
  and advertised credit value, earn rates, best cents per point, lounge access,
  foreign transaction fee, intro APRs and insurance levels, each with
  provenance. Cards are returned in the order given."
- **Input:** `card_ids: list[CardId]`, 2–4 (the site's `MAX_CARDS = 4`).
- **Output:** `meta`, `query`, and `cards[]` of `{card_id, name, issuer,
  annual_fee, currency, verdict_status, short_tag, value, best_cpp,
  points_program, earn_rates[], has_lounge_access, foreign_transaction_fee:
  Fact, intro_apr_purchases: Fact, intro_apr_balance_transfers: Fact,
  insurance[] (coverage, level), transfer_partner_counts, provenance}`.
- **Errors:** `unknown_card_id` (every unknown id) and `duplicate_card_ids`.

**4. `rank_by_category`** (title "Rank cards by category")

- **Description:** "Rank cards for a spending category by effective return per
  dollar: the earn multiplier times the card's realistic cents per point
  (percent rates are used as stated). With card_ids, ranks only those cards and
  applies points pooling between cards that share a points account, as the
  site's My Cards view does; without it, ranks the whole catalog with no
  pooling. Ties go to the lower annual fee, then name. If fewer than 3 cards
  have a real bonus, the remaining top slots are filled with flat-rate cards
  marked is_fallback. Ignores spending caps, activation requirements and
  sign-up offers."
- **Input:**
  - `category: Literal[18 keys]`, pinned to TS;
  - `card_ids: list[CardId] | None`, 1–25 when present;
  - `limit: int = 3` (1–10).
- **Modes.** Catalog mode serves the precomputed list. Wallet mode is exactly
  the site's "My Cards": pooling whenever `card_ids` is given, and secured twins
  hidden when both are in the set.
- **Output:**
  - `meta`, `query`;
  - `category`: `key`, `label`, `description`, `group`;
  - `mode` (`catalog` | `wallet`) and `points_pooling_applied`;
  - `total_matching`, the count of real-bonus matches;
  - `returned`;
  - `hidden_as_secured_twins[]`;
  - `entries[]`: `{rank, card_id, name, issuer, annual_fee, multiplier,
    is_percent_rate, effective_cents_per_dollar, best_cpp, effective_cpp,
    is_fallback, is_pooled, provenance: ProvenanceRef}`;
  - `method`: `formula`, `tie_break`, `limitations`.
- **`effective_cents_per_dollar`** is `floor(v * 10000 + 0.5) / 10000`, the
  same 4-decimal precision the ranking compares at.
- **Positions past 3** are real bonuses only. Fallbacks only ever fill the top
  3, which is the site's rule.
- **Errors:** `unknown_card_id` and `duplicate_card_ids`.

**5. `estimate_value`** (title "Estimate card value")

- **Description:** "The realistic yearly value of a card's statement credits and
  cash-like perks minus its annual fee, the same figure the site's card page
  shows. Uses The Wallet Audit's default estimate for each credit unless you pass
  credit_overrides with your own expected annual use; overrides are clamped to
  each credit's advertised maximum and reported. Excludes points earning, lounge
  access, insurance, status perks and sign-up offers."
- **Input:**
  - `card_id: CardId`;
  - `credit_overrides: list[{credit_id: CreditId, annual_value: int 0..100000}]
    | None`, 1–30 when present.
- **Semantics** (all over non-removed credits; "net" is always credits minus
  fee, so positive means the credits beat the fee):
  - `realistic_credit_value` = the sum of `applied_value`, where
    `applied_value` is the override clamped to [0, `max_annual`] (the slider's
    bounds), or else `default_value`;
  - `realistic_net` = `realistic_credit_value - annual_fee`. This is
    `HeroTakeWidget`'s `diff`;
  - `advertised_credit_value` = the sum of `max_annual`;
  - `best_case_net` = `advertised_credit_value - annual_fee`. The site shows
    the same figure as `annual_fee - total_max_credits`, sign-flipped for
    display;
  - `effortless_credit_value` = the sum of `default_value` over `tier == "easy"`.
    This is `CardSummary.total_easy_credits`, and overrides never change it.
- **Output:**
  - `meta`, `query`, `card_id`, `name`, `currency`, `annual_fee`;
  - `credits[]`: `{credit_id, name, tier, max_annual, default_value,
    applied_value, source: "default" | "override" | "override_clamped",
    requested_value}`;
  - `totals`;
  - `counts` (the fixed sentence above) and `excludes[]`;
  - `provenance`.
- **Errors:** `unknown_card_id`, `unknown_credit_id` (which includes a removed
  credit) and `duplicate_credit_ids`.

**Response-size budgets.** Measured over every card with a prototype
projection. Bytes are compact UTF-8 JSON of the structured content.

| Tool / case | Measured max | Budget |
|---|---|---|
| `find_cards`, limit 20 | about 8,000 (at 25: 7,420 without the URL) | 12,288 |
| `get_card`, default | 8,787 | 12,288 |
| `get_card`, all sections | 16,526 | 20,480 |
| `compare_cards`, 4 largest | 8,155 | 12,288 |
| `rank_by_category`, limit 10 | 5,032 | 8,192 |
| `estimate_value` | 1,944 | 4,096 |

These budgets are not sampled. The snapshot is fixed per deploy, so CI checks
them **exhaustively**:

- every card's `get_card` with no sections and with all sections;
- `compare_cards` over the 4 largest entries;
- `rank_by_category` with the 10 largest entries;
- `find_cards` with the 20 largest entries;
- every card's `estimate_value`.

**The server never truncates.** A breach fails the build, never the agent. The
largest response even when doubled (text plus structured, 40,960 bytes) stays
under Claude Code's 50,000-character file threshold.

The real projection adds `meta` and `query`, so the implementer re-measures. If
an output does not fit, they trim or raise a budget deliberately, in that PR,
with the new measurement.

**Reversibility.**

- **Additive changes are cheap.**
- **Breaking changes are expensive**, because third parties depend on them
  (see D10).
- **The `not_recorded` representation is effectively one-way** once agents
  rely on it.

### D6. Ranking and value semantics in Python, with parity and blindness pins

**The port.** `backend/mcp_server/ranking.py` is a line-for-line port of
`rankCategory` (below). It carries the TS regex sources verbatim, compiled with
`re.IGNORECASE | re.ASCII`. `re.ASCII` is deliberate: JS `\b`, `\d` and `\s`
without the `u` flag are ASCII-only, and Python's are Unicode. The port also
carries:

- **`parse_multiplier_value`:** the first `[\d.]+` token, then JS
  `parseFloat`'s longest-prefix rule, or `-inf` when there is none.
- **`js_round(x) = floor(x + 0.5)`**, which is `Math.round`, not Python's
  banker's `round`. Non-finite input is returned unchanged.
- **The collation key `(name.casefold(), name)`.**
- **The secured-twin rule.** A twin is hidden only when its unsecured sibling
  is in the same set.
- **Pooling.** It is receiver-only, keyed on `points_pool_id` and computed over
  the deduplicated set. A `%` rate is literal unless pooling actually boosted
  it.

Value semantics are D5's formulas, in `backend/mcp_server/values.py`.

**The TS side (the only frontend change, and no behaviour change).** In
`frontend/src/utils/topPickCategories.ts`:

- export `CATEGORY_MATCHERS`, `WHOLESALE_EXCLUDES`, `BRAND_EXCLUDES` and
  `CENTS_PER_GALLON`;
- extract `export function rankCategory(cards, categoryKey, options = {}):
  TopPickEntry[]`. It returns every real-bonus entry, sorted. If there are fewer
  than 3 and the key is not `catch-all`, it appends fallbacks up to 3 total;
- `computeTopPicks` becomes the map over `TOP_PICK_CATEGORIES` that takes slots
  0–2.

This is justified because the MCP returns up to 10 positions and the pin has to
cover every position the MCP can return. The 806-line existing test file pins
that the refactor changes nothing.

**The cross-language pin.** Fixtures live in `tests/fixtures/ranking_parity/`,
and both CI jobs run them unchanged:

- **`summaries.json`** is `[s.model_dump(mode="json") for s in
  get_card_summaries()]` from the test database, written by Python.
- **`scenarios.json`**, written by Python and deterministic:
  - `catalog_default` (no pooling) and `catalog_pooled`;
  - for each pool id, the full membership and the feeders only;
  - all secured pairs, and secured cards only;
  - one receiver alone;
  - 20 wallets from `random.Random(20261106)` of sizes 2–25.
- **`expected.json`** is written by TS through vitest `toMatchFileSnapshot`.
  - It records the 18 categories (`key`, `label`, `emoji`, `description`,
    `group`, in order).
  - It records each matcher's `{source, flags}`, `WHOLESALE_EXCLUDES`,
    `BRAND_EXCLUDES`, `CENTS_PER_GALLON`, and the names sorted by
    `localeCompare`.
  - Per scenario and category, it records `{total, real, top}`, where `top` is
    at most 10 rows of `[id, effectiveValue, multiplier, isFallback, isPooled]`.
  - Verified in vitest 4.1.10 source: under `CI` the snapshot mode is `"none"`,
    so a stale or missing file fails and is never rewritten.

The Python test (`test_ranking_parity.py`) asserts:

- **Inputs:** the summaries fixture equals the live summaries, and the
  scenarios fixture equals a fresh generation.
- **Output equality:** the Python full lists, truncated to 10, equal
  `expected.json` exactly, floats included. These are IEEE doubles from the
  same operations, measured exact.
- **Definitions:** the category definitions, regex sources and flags, exclude
  lists and collation order equal TS.
- **Non-vacuity:** at least one pooled entry, one fallback, one hidden secured
  twin, 18 categories and at least 27 scenarios. This copies the repo's "guard
  the parsers themselves" pattern.

Its failure message prints the three-command regeneration:

```
UPDATE_RANKING_FIXTURE=1 uv run pytest tests/backend/mcp_server/test_ranking_parity.py
(cd frontend && npx vitest run tests/utils/rankingParity.test.ts -u)
uv run pytest tests/backend/mcp_server/test_ranking_parity.py
```

Update mode refuses to run when `CI` is set.

**Limits of the pin, stated honestly.** It guarantees the two implementations
agree, not that the rules are right. The TS tests and review own correctness.

What it costs is a regeneration whenever a card edit changes a ranking input
(earn rates, fee, name, `best_cpp`). Card files changed in 45 commits between
2026-08-01 and 2026-09-07 and in none since, so the cost arrives in bursts
during refreshes. In exchange, `expected.json`'s diff becomes a reviewable
record of how every ranking moved.

**Catalog invariants this port depends on** (`test_matcher_input_invariants.py`):

- no non-ASCII letter (Unicode category `L*`) and no non-ASCII whitespace in
  any earn-rate `category` or `multiplier`, which is the exact gap between the
  two regex engines;
- every multiplier that matches any category, or is a base rate, parses to a
  finite number. Today `citi-macys`'s digitless rate matches nothing, so the
  `-Infinity` and `NaN` paths are unreachable and need no emulation;
- card names are unique, so ranking cannot depend on input order.

**Monetization blindness, made provable in Python.** `test_ranking_blindness.py`
checks two things:

- **Structural.** Ranking takes `RankInput`, a frozen dataclass built from
  `CardSummary` through an explicit allowlist: `id`, `name`, `annual_fee`,
  `categories`, `best_cpp`, `secured_variant_id`, `points_pool_id`,
  `points_pool_receiver`. The test asserts the field set equals that allowlist
  and that `is_affiliate_link` is not in it. Ranking literally cannot read the
  flag.
- **Behavioural.** Over the real catalog, every category and both modes: every
  card flagged, none flagged, and three seeded random subsets flagged all give
  identical `rank_by_category` output. Rank entries carry no affiliate field at
  all.

`find_cards` sorts by name and `compare_cards` keeps input order, so neither
can rank by money either.

**Reversibility: cheap.** It is internal, and the pin is what keeps it cheap.

### D7. Auth: pre-shared API keys, SHA-256 hashed, in a Render env var, verified by our guard

**Format.** `twa_<key_id>_<secret>`. `key_id` is 8 lowercase hex characters,
public, and appears in logs. `secret` is `secrets.token_urlsafe(32)`, which is
43 characters and 256 bits. Parse with
`^twa_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$`. **Never split on `_`**, because the
base64url alphabet contains `_`.

**Storage.** `MCP_API_KEYS` (Render, `sync: false`) holds a JSON array of
`KeyRecord`:

```json
[{"id": "3f9a1c2e", "sha256": "<64 hex of sha256(full key)>", "label": "first reviewer",
  "created": "2026-11-06", "expires": "2027-02-04", "per_minute": null, "per_day": null}]
```

`KeyRecord` rules: `extra="forbid"`; `label` 1–64 printable characters;
`expires` inclusive in UTC, or null; `per_minute` 1–600 or null; `per_day`
1–100,000 or null. The array has unique ids and unique hashes, 50 records at
most. Missing or invalid config disables the MCP; it never blocks the site's
boot.

**Why an env var, not a table.**

- **Zero Neon touches per call**, where a table needs a per-call read or a
  cache.
- **Nothing non-rebuildable lands in a database** the repo treats as a derived
  read model.
- **A Neon project migration**, which this repo has done before, cannot
  silently lock every key holder out.
- **The cost:** revocation and rotation take a redeploy (minutes, assumption 4)
  rather than an `UPDATE`.
- At a handful of hand-issued keys, minutes is acceptable.
- **SHA-256, not a slow hash.** Slow hashes protect low-entropy passwords, and a
  256-bit random key gains nothing from per-request CPU spent on one.

**Verification.** Read only `Authorization: Bearer <key>`, matching the scheme
case-insensitively; never a query string. Then:

1. regex parse;
2. look up the record by `key_id`;
3. check expiry;
4. `hmac.compare_digest(sha256(key).hexdigest(), record.sha256)`.

Every failure takes the same response. `key_id` is not secret, so a lookup
timing difference reveals nothing.

**Issuance tooling.** `uv run python -m backend.scripts.mcp_keys mint --label
"..." [--expires YYYY-MM-DD | --no-expiry]`, with a 90-day default.

- It refuses unless stdin is a TTY, the same mechanism as `drafts promote`. An
  agent's shell would otherwise put a live secret into a transcript.
- It prints the key once and the record to append, and writes nothing.
- `mcp_keys check` reads a candidate `MCP_API_KEYS` value on stdin, validates
  it with the same model, and prints ids, labels and expiry, never hashes.
- **Revoke:** delete the record, then save and deploy.
- **Rotate:** add the new record, hand the new key over, then remove the old
  one.

**401 shape** (our guard, not the SDK's):

- Status 401, `Content-Type: application/json`.
- `WWW-Authenticate: Bearer realm="thewalletaudit-mcp"`, plus
  `, error="invalid_token"` only when a credential was presented.
- Body: a JSON-RPC error with `id: null`, code -32000, and the message "A valid
  The Wallet Audit API key is required in the Authorization header as: Bearer
  <key>."
- **No `resource_metadata`, and `/.well-known/oauth-protected-resource` is 404**
  (both pinned).
- **There is no 403 of ours.** There are no scopes. The SDK's own 403 is for a
  disallowed Origin.

**How this fits the MCP authorization spec, honestly.** The spec makes
authorization OPTIONAL and says HTTP implementations SHOULD use its OAuth 2.1
and RFC 9728 path. This server does not implement MCP authorization at all. It
gates access with a pre-shared credential carried in the standard bearer
header. That is SHOULD-level non-conformance, not a MUST violation. The one
thing that would make it a lie is advertising metadata it cannot back, so it
advertises none.

The SDK's own `TokenVerifier` hook was rejected for keys because `AuthSettings`
requires an `issuer_url`. That would mean a fake authorization server today,
and a false metadata document the day someone sets `resource_server_url`.

**The evolution path:**

- an external authorization server issuing client-credentials tokens;
- `MCPServer(token_verifier=JwtVerifier(...), auth=AuthSettings(issuer_url=<AS>,
  resource_server_url="https://mcp.thewalletaudit.com/mcp",
  validate_token_resource=True))`, which serves RFC 9728 metadata and enforces
  audience;
- keys accepted in parallel for one deprecation window;
- `key_id` mapped to `client_id`, so limits and logs carry over.

The trigger is the first client platform we need that only connects to
OAuth-protected MCP servers, or self-serve issuance.

**What is logged:** `key_id` after successful verification. Never the key, the
`Authorization` header, a hash or an IP (pinned by a log-scan test).

**Reversibility.**

- **Storage and verification are cheap.**
- **The key format is moderately expensive.** It lives in integrators' configs, so
  changing it means reissuing.

### D8. Hostile input and load

The guard `McpEndpoint` is a plain ASGI class. Starlette treats a
non-function endpoint as an ASGI app, and registering it as
`Route("/mcp", endpoint=...)` and `Route("/mcp/", endpoint=...)` was verified
above. In order:

1. **Path.** `/mcp/` gets 404 with the hint "The MCP endpoint is /mcp, without
   a trailing slash." There is no redirect.
2. **Method.** Anything but POST gets 405 with `Allow: POST`. A stateless GET
   otherwise holds the connection open forever (verified). The spec allows 405.
   The official client sends no GET or DELETE in stateless mode (verified).
3. **Not started or disabled** gets 503.
4. **`Content-Length`** that is unparseable or over 32,768 gets 413, before
   anything else is read.
5. **Auth** (D7). On failure, count against the per-client and global
   failed-auth budgets.
   - Over budget gets 429 with `Retry-After: 60`; otherwise 401.
   - Valid keys never touch these budgets, so a flood of bad keys cannot lock
     out a good one.
   - The client key is a salted BLAKE2b hash of `cf-connecting-ip`, then
     `true-client-ip`, then the peer address. **`X-Forwarded-For` is never
     read.** Its leftmost entry is client-controlled on Render (assumption 2).
   - This differs from `main.py._client_key` on purpose, and the analytics
     limiter is left alone.
6. **Per-key rate limit.** Fixed windows of 60 per minute and 2,000 per
   rolling-start 24 hours, with per-record overrides. Over the limit gets 429
   with `Retry-After` set to the window remainder.
   - Counts live in process memory and reset on restart. That is acceptable
     because a restart follows idleness.
   - With one uvicorn worker (the start command passes no `--workers`), the
     limits are exact.
7. **Concurrency.** At most 8 MCP requests in flight per process (a plain
   counter on the single event loop). The 9th gets 503 with `Retry-After: 1`.
8. **Body read** with a 32,768-byte cap (413) and a 10 s deadline, `408` on
   expiry, then replayed to the SDK. The SDK keeps its own
   `max_request_body_size=32768` as a second layer.
9. **Parse for logging only**, with `pydantic_core.from_json` inside a
   catch-all. It never raises. stdlib `json.loads` is banned here because it
   raises `RecursionError` (verified).
10. **SDK**, under a 10 s deadline. A timeout before the response starts gets a
    504 JSON-RPC error. One after it starts is logged as `timeout_after_start`.
    The SDK keeps its own checks: content type 400, Host 421 against
    `MCP_ALLOWED_HOSTS`, and Origin 403 with `allowed_origins=[]`, so no browser
    origin is ever allowed.
11. **Tag every response** with `X-Request-Id`.

**Memory is bounded:**

- the snapshot, about 7 MB;
- at most 8 × (32 KiB body + about 21 KiB response) in flight;
- the per-key map, sized by the key count;
- the failed-auth map, capped at 10,000 entries and cleared wholesale like
  `main.py`'s. That fails open, but only for counting failures.

**Concurrency on one free worker.** Tools are async and sub-millisecond, so MCP
never takes the thread pool the site's sync routes run in.

**GZip.** The existing `GZipMiddleware(minimum_size=1024)` compresses MCP JSON.
Verified that clients decode it transparently. No SSE exists for it to buffer,
and no secret is ever in a response body, so there is no compression-oracle
concern. Nothing changes.

**Limits are constants in `backend/mcp_server/config.py`.** Tests override them
through the config object, not the environment. **Reversibility: cheap.**

### D9. Observability: one JSON line per authenticated request, aggregates for the rest

The logger is `backend.mcp_server` with its own stdout handler, format
`%(message)s`, level INFO and `propagate=False`. Tests attach a capture
handler to it.

**Per authenticated request**, emitted by the guard after the response:

```json
{"event":"mcp_request","request_id":"9c1f0e2ab4d7","key_id":"3f9a1c2e","rpc_method":"tools/call",
 "tool":"get_card","http_status":200,"outcome":"ok","duration_ms":3.1,"request_bytes":143,
 "response_bytes":5120,"protocol_version":"2025-06-18","card_ids":["amex-gold"],"category":null,"client":null}
```

- **`tool`** comes only from the known set; anything else is `"<unknown>"`.
- **`card_ids` and `category`** appear only when they pass their patterns.
- **`client`** appears only on `initialize`, as `clientInfo.name/version`
  checked against `^[\x20-\x7e]{1,64}$`. The raw User-Agent is not logged,
  matching the repo's analytics stance.
- **`outcome`** is one of: `ok`, `tool_error:<code>`, `invalid_arguments` (the
  SDK's "Error executing tool" text), `rpc_error:<code>`, `rate_limited`,
  `busy`, `too_large`, `timeout`, `timeout_after_start` or `internal_error`.
  It is read from the response body the guard already relays.

**Pre-auth rejections** (401, 405, 413 and unauthenticated 429) are counted and
emitted at most once a minute as
`{"event":"mcp_rejections","window_seconds":60,"counts":{...}}`. Floods cannot
flood the log.

**At boot**, one of:

- `{"event":"mcp_started","contract_version":...,"catalog_digest":...,"cards":109,"verified_cards":86,"keys":N,"allowed_hosts":[...]}`
- `{"event":"mcp_disabled","reason":"..."}`

The reason is never a secret or a hash. A degraded sidecar logs
`verification_state_degraded` at ERROR.

**Reversibility: cheap.** "Never log the key or an IP" is effectively one-way,
because logs cannot be unwritten. That is why it is a test.

### D10. Contract stability and versioning

- **`CONTRACT_VERSION = "1.0.0"`** lives in `backend/mcp_server/contract.py`.
  It is `serverInfo.version` and `meta.contract_version`.
- **The snapshot.** `tests/backend/mcp_server/snapshots/tool_surface.json` holds
  the full `tools/list` result (names, titles, descriptions, input and output
  schemas, annotations) plus server name, version and instructions.
  - A test asserts live equals file.
  - The file is regenerated only with `UPDATE_MCP_SURFACE=1`, and refused under
    `CI`.
- **`PUBLISHED_SURFACES`** in `contract.py` maps every published version to the
  SHA-256 of the canonical surface JSON. A test asserts the live digest equals
  `PUBLISHED_SURFACES[CONTRACT_VERSION]`.
  - So the surface cannot change without a new version entry, or a visible edit
    to an already-published one.
  - Rule: new tools, new optional inputs and new output fields are a minor bump.
    Removing or renaming anything, tightening a bound, or changing a meaning is
    a major bump, and ships as new tool names with the old ones kept for one
    deprecation window.
  - The reviewer classifies the bump. A test cannot classify meaning.
- **The same tests also assert:**
  - every input string has `maxLength` or an enum, every array `maxItems`, and
    every integer both bounds ("no unbounded input", walked structurally);
  - every tool carries the D5 annotations;
  - no output property ends in `_cents`;
  - no description or instruction contains U+2014.

**Reversibility: cheap.** This is the part that makes everything else's
reversibility explicit.

### D11. The eval and regression gate

`test_eval_against_content.py` reads the card JSON files and sidecars directly
and computes every expectation itself. **It may not import
`backend.mcp_server.values`, `ranking` or `schemas`.** An `ast` check in the
same file allows only the server factory and the snapshot builder, so the eval
can never become the code checking itself. Through the in-memory `Client`:

- **Every card, `get_card`:**
  - name, issuer, network and fee equal the raw file;
  - active credits (order, id, `max_annual`, `default_value`, tier) and earn
    rates equal raw;
  - each `Fact` is recorded exactly when the raw value is not null, with the
    same value;
  - `welcome_bonus` appears nowhere in the payload;
  - `issuer_sources[0]` is `official_url` when present, and empty for
    `amex-green`;
  - verification equals the raw sidecar.
- **Every card, `estimate_value` with no overrides:** all five totals equal
  sums computed in the test. One seeded override case per credit-bearing card
  checks clamping.
- **Every category in catalog mode and every parity scenario,
  `rank_by_category`:** order and fields equal `expected.json` (the TS
  computation). Each entry's value is independently recomputed from the raw
  multiplier and the raw best flagged cpp.
- **`compare_cards`** over consecutive 4-card chunks of all ids: every entry
  equals raw-derived values.
- **`find_cards`:** every card is found by its own name, and paging through
  each issuer enumerates exactly that issuer's files.

**Deploy gating.**

- `main`'s branch protection is the gate. `backend` and `frontend` must pass on an
  up-to-date branch before any merge, and this applies to admins (verified).
- Render deploys what lands on `main`. `checksPass` was rejected; see D13-A14.
- Protecting `development` is owner action O6.

**LLM-in-the-loop evals are not the gate.** They are nondeterministic and cost
money. The runbook's manual pre-release checklist covers them.

**Reversibility: cheap.**

### D12. Render, docs and site

**`render.yaml`**, API service:

- `domains` gains `mcp.thewalletaudit.com`;
- `envVars` gains `MCP_API_KEYS` (`sync: false`) and
  `MCP_ALLOWED_HOSTS: mcp.thewalletaudit.com,thewalletaudit-api.onrender.com`;

No change to `healthCheckPath` or the start command. Keep-warm gains the D13-A7 probe.

**Docs:**

- `backend/README.md` gets a "MCP server" section, the runbook below. Its
  numeric tables stay out of the root README because of `test_readme_facts.py`.
- The root README's endpoints table gains one prose row:
  `POST https://mcp.thewalletaudit.com/mcp`, an MCP endpoint for AI agents, by
  API key.
- `main.py`'s `/` JSON gains `"mcp": "https://mcp.thewalletaudit.com/mcp"`.

**The site:** no UI change. Keys are hand-issued, and there is nothing for a
visitor to do. The only frontend diff is D6's refactor. The footer contradiction
is O9, a separate copy decision, not bundled.

**The runbook contents:**

- **Mint:** run in a real terminal; store the key in a password manager; append
  the record in Render, Environment, `MCP_API_KEYS`; save and deploy; confirm
  the `mcp_started` line shows the new key count.
- **Revoke and rotate:** as in D7.
- **Connect from Claude Code:**

  ```
  claude mcp add --transport http thewalletaudit https://mcp.thewalletaudit.com/mcp \
    --header "Authorization: Bearer ${TWA_MCP_KEY}"
  ```

  or a `.mcp.json` entry with `"type": "http"`, the `headers` block and
  `"timeout": 120000`. The timeout matters: a cold start (about 60 s) meets
  Claude Code's 60 s per-request floor.
- **Connect from Claude Desktop:** through the third-party bridge
  `npx mcp-remote https://mcp.thewalletaudit.com/mcp --header
  "Authorization:${TWA_AUTH}"` with `env: {"TWA_AUTH": "Bearer twa_..."}`. Keep
  no spaces inside `args`, per its README's Windows bug.
- **Connect from a generic client:** the Python SDK `Client` with
  `streamable_http_client(url, http_client=httpx2.AsyncClient(headers=...,
  timeout=120))`, or any Streamable HTTP client.
- **Fixtures:** regenerating the parity fixture, and updating the surface
  snapshot with a version bump.
- **Smoke:** running the smoke workflow.

### D13. Amendments from independent review (2026-11-06)

An independent review tested the decisions above against the catalog. Where this
section conflicts with earlier text, this section wins.

**A1. `verified` must not overclaim.** A card-level `verified` hid section-level
gaps: 24 cards (Citi, Capital One, Bilt) would have said `verified` with
`rates_and_fees` unchecked, covering 209 recorded rate values.

- `verification_status` is `verified` (no gap recorded), `partially_verified`
  (`not_checked` is non-empty) or `not_verified`.
- `ProvenanceRef` carries `not_checked[]`, so every tool shows the gap.

**A2. Insurance `level: "none"` is overloaded.** It appears on 266 rows across 78
cards, and many mean "unknown": `detail` reads "Not publicly documented for this
card" on 48 rows and "Not published for this card" on 19.

- Served `level` adds `unconfirmed`.
- A source `none` is served as `none` only when `detail` states absence and the
  card's verification covered insurance. Otherwise it is `unconfirmed`.
- "States absence" excludes details starting "Not" followed by publicly
  documented, published, confirmed, listed, advertised or disclosed.
- An empty `insurance` list means no coverage is recorded, not that the card has
  none. The schema and server instructions say so.

**A3. Tie the date to the content, and give it an end.**

- `VerificationRecord.facts_sha256` hashes the card's factual fields. Excluded as
  editorial or unserved: `verdict`, `effective_cost`, `accent_color`, `timeline`,
  `official_url`, `is_affiliate_link`, `welcome_bonus`, and each credit's `tips`,
  `default_value`, `tier` and `subtitle`.
- On a mismatch the card degrades to `not_verified` at snapshot build, and a pin
  fails CI. A factual edit must record a new verification or clear the date.
- `review_due_on` is `verified_on` plus 180 days. It is a fixed date, not a
  server-clock computation, so responses stay deterministic. It tells agents when
  to stop relying on the date, and CI never fails on the calendar.

**A4. Say when evidence is issuer-level.** For 10 of the 86 cards, the evidence
commit neither changes the card's file nor names it. A finding of no errors is
plausible, but the commit does not show it per card.

- `VerificationRecord.evidence_scope` is `card` or `issuer_pass`, exposed in full
  provenance. The 10 cards are `issuer_pass`, pinned by the ledger.
- ADR 0001 decision 5 forbids proxies for this date. An issuer-level recorded pass
  is an event, not a proxy, and this label keeps it from reading as more.

**A5. Follow `Card` naming.** `editorial` serves `verdict: {status, text,
short_tag}` plus `effective_cost`. `verdict_text` is the storage name `CLAUDE.md`
warns about. List items keep the flat `verdict_status`.

**A6. Retry the snapshot.** The build gets 3 attempts, 1 s and 3 s apart, before
the endpoint disables itself, so a transient failure does not mean 503s until the
next restart. The SDK is imported inside `run()`, so an SDK import failure also
disables MCP rather than stopping the site from booting.

**A7. Probe it continuously.** Keep-warm sends a keyless `POST /mcp` on its
readiness cadence and fails the run on anything but 401. This costs no Neon query
and detects a disabled endpoint, which `/healthz` cannot see.

**A8. Neon boot dependency, accepted for now.** Tool calls do not touch
the database, but the start command runs `alembic` and the seed before `uvicorn`,
so a Neon outage stops MCP at the next boot. That happened from 2026-08-22 to
2026-08-27. Revisit before anyone relies on this server in production.

**A9. Disclaimer.** `meta.disclaimer` states that this is informational data, not
financial advice, and to confirm terms with the issuer. A `terms_url` is added as a
minor version once a terms page exists (O8).

**A10. Specified limits.** The failed-auth budgets are 20 per minute per client and
200 per minute globally. A deprecation window is 90 days. `KeyRecord` gains an
optional `contact`, so key holders can be told about changes.

**A11. Integrator documentation.** `docs/mcp-server.md` covers connection, tools,
limits and how to read provenance.

**A12. Credit defaults are not estimates (found during implementation).** 149 of
151 active credits have `default_value: 0`, so D5's `realistic_credit_value` would
tell agents Amex Gold is realistically worth $0 in credits. The methodology page and
README call these hand-estimated realistic defaults, which is not what the content
holds. Publishing "realistic" here would be false, and field names are one-way.

- `realistic_credit_value` and `realistic_net` become `applied_credit_value` and
  `applied_net`. The site's arithmetic is unchanged.
- `effortless_credit_value` is not served. It is the same empty data, and adding it
  later is cheap where removing it is not.
- `credits_at_zero` counts credits sitting at $0 with no usage given. Tool
  descriptions tell agents to pass real usage.
- The content and the site's copy disagree. That is a separate owner decision.

**A13. Setup facts found during rollout.**

- **Order.** Render's docs add the domain in Render first, then the DNS record. That
  reverses O1 and O2.
- **Cost.** The Hobby plan includes 2 custom domains and this is the third, at $0.25 a
  month. That requires a card on the workspace.
- **What the card changes.** Outbound bandwidth over the plan's 5 GB is then billed at
  $0.15/GB instead of suspending services, and no spend limit is documented for it. Build
  minutes are billed too, but those can take a spend limit. Watch usage on the Billing page.
- **Reachability so far.** From Google Cloud Shell, with curl, python-httpx and node user
  agents, `GET /healthz` on the hostname returned 200 and `POST /mcp` returned 404. Both reached
  `uvicorn` with no challenge. The 404 is expected because MCP is not deployed yet, so this
  proves the path, not the endpoint. AWS and GitHub-hosted runners are not yet tested.

**A14. No `checksPass` deploys, and no calendar test in CI.**

- **`checksPass` is not used.** D11 assumed only CI checks sit on a `main` commit. In fact
  `main`'s latest commit carries 100 or more keep-warm `ping` check runs, some still running.
  Render waits for checks and skips the deploy if any fail, and its docs do not say how
  scheduled runs count. So deploys could stall behind 50-minute runs, and a keep-warm failure
  during an outage could block the fix.
- **The gate is branch protection.** It requires `backend` and `frontend` on an up-to-date
  branch, covers admins and blocks force pushes (read from the GitHub API on 2026-11-06), so
  `checksPass` would only repeat a check that already passed.
- **`TERMS_AS_OF` age left CI.** A date passing 75 days failed the required `frontend` check
  with no code change. `terms-freshness.yml` now opens an issue weekly instead.

**A15. Rankings use a best case, so the wording says so.** `best_cpp` is the value of the
redemption option flagged as best, and the methodology page calls it the "best realistic
outcome, not a guarantee". Served text now says "best realistic cents per point". The same
reasoning as A12 applies: without "best", a best case reads as a typical result. Version 1.0.0
had not been published, so its digest was updated in place.

**A16. Keys sent in a URL stayed out of our logs but not uvicorn's.** A pre-release check against
a real server found that `POST /mcp?key=...` got its 401, and uvicorn's access log then recorded
the full URL. `TestClient` never runs that log, so the log-scan test could not see it.

- A filter on `uvicorn.access` now drops the query on `/mcp` and masks anything shaped like a key
  on other routes. `test_access_log.py` pins this against a real uvicorn server.
- This covers only logs this process writes. Render's and Cloudflare's own request logs are outside
  it, so a key sent in a URL should still be treated as exposed and be rotated.
- The access log's client address field is unchanged, so D7's "never an IP" holds for the
  `backend.mcp_server` logger only.

**A17. Corrections from a pre-release code review.**

- **Busy before quota.** D8's steps 6 and 7 swap. A 503 did no work, so it no longer spends the
  key's quota, and a client retrying as told cannot talk itself into a 429.
- **Blank searches.** A `find_cards` query with nothing left after normalizing, such as spaces or
  `®`, matches no cards. It used to match all 109 and report them as results.
- **Logging survives odd input.** A non-string tool name is logged as `<unknown>` and no longer
  raises after the response. `client` is null unless both name and version are strings.
- **Reading card files.** Staging is judged relative to the cards folder, so a parent folder named
  `staging` cannot empty the digests and mark every card `not_verified`. Files are read as UTF-8.

**A18. "Sign-up offers are not served" was too broad.** D5 withholds the `welcome_bonus` field, and
that still holds. But free text also carries offers: `services` rows such as "60,000-point welcome
bonus" on `bofa-premium-rewards`, plus some credit descriptions and timeline entries.

- Served text now says the field is not served, and that free text may mention an offer that may
  be out of date.
- The card data is unchanged. The site's card page shows `services` too, so these rows are live
  there. Removing them is a separate content job: under A3 `services` is a verified fact, so editing
  a row resets that card's date until it is re-checked.

**A19. Keep-warm runs around the clock (O10).** The service stays awake at all hours, using up to
744 of the 750 free hours, so a caller never meets an overnight cold start. Exhausting the hours
suspends every free service for the rest of the month, so watch usage on Render's dashboard.

- The `/mcp` probe runs at all hours. `/health` still skips 04:00-10:59 UTC, because it wakes Neon
  and the cold-start problem is Render's, so this adds no overnight Neon compute. A database outage
  in those hours is noticed at 11:00 UTC, as it was before.

**A20. The site's copy now matches the data.** This settles what A12 left open. `default_value`
stays $0 on almost every credit, and the Methodology page, the crawlable page text, the feedback form
and the README now say credits count at what you say you'd use.

**A21. `has_lounge_access` is not served.** This overrides D5's `get_card` and `compare_cards`
outputs. The site derives the flag by finding the word "lounge" in a perk's name or note, and that
is wrong on 10 of 109 cards: "None on its own" reads as true, and a Priority Pass note without the
word reads as false. Agents read `status_perks` in `get_card` until a checked `lounge_access` field
ships with the next catalog refresh as contract 1.1.0. Version 1.0.0 had never been released, so
its surface was corrected in place.

**A22. A recorded `false` is not a checked one.** D5 calls `foreign_transaction_fee: false` a
positive "none". That describes what the content says, not that anyone checked it: 33 of the 73
cards recording `false` have no check, or a check that left `rates_and_fees` unconfirmed. The
schema and docs no longer call it confirmed. The value stays recorded, because every tool that
serves it also serves the provenance showing the gap.

**A24. `lounge_access` replaces A21's removal.** Cards now carry an authored `lounge_access`, and
`get_card` and `compare_cards` serve it, or `unconfirmed` where nothing is recorded or a stored
`none` has no perks check. The site's `has_lounge_access` derives from it, true for `included` and
`passes`. Version 1.0.0 is still unreleased, so its surface was corrected in place again.

**A23. Outcomes tell client mistakes from server faults.** This extends D9's list. A notification
the SDK accepts with a 202 logs as `ok`. A `tools/call` naming a tool the server doesn't have logs
as `unknown_tool`, decided from the request and not from SDK wording. Any other 4xx logs as
`http_<status>`. `internal_error` now only means a server fault. A client that drops the connection
while sending its body logs as `disconnected` with a null `http_status`, and its quota stays charged.

**A25. The November 2026 refresh supersedes A18's caveat.** The refresh (PR #268) took sign-up
offers out of all served free text, keeping current ones in `welcome_bonus`, and
`test_sign_up_offers_stay_out_of_served_text` now fails CI if one comes back. Served text no longer
says free text may mention an offer. It still makes no promise that none does: a few first-year
terms, such as a first-year fee waiver, remain as card terms. The same refresh re-checked 89 cards
on 2026-11-07. Each record cites the commit that last changed the card's facts, so no record is
`issuer_pass` any more. Version 1.0.0 is still unreleased, so its surface was corrected in place.

**A26. Requests without a key are served, under one shared limit.** This reverses D7's key-only
gate. The trigger is the one named under "The evolution path": a client platform that won't send
a pre-shared key. Claude's custom connectors accept only OAuth or no auth, so on a 401 they try
OAuth registration, find no metadata and fail. Regular users can't run a local `mcp-remote`
bridge. OAuth was not chosen, because Claude's flow is the authorization code grant with dynamic
client registration, not the client-credentials path above, and an authorization server is
far more new security surface than this read-only catalog needs. The same data is already public
at `/api/cards`, so a key guarded capacity, not content.

- `MCP_ANONYMOUS_ACCESS=true` serves a request with no `Authorization` header. Any value other
  than `true` or `false` disables MCP rather than guessing. A broken `MCP_API_KEYS` still
  disables MCP, so the mistake gets noticed.
- Keyless requests share one pool, 120 a minute and 5,000 a day, logged as `key_id: anonymous`.
  The pool is not split by address, because Claude's connectors arrive from a few Anthropic
  addresses. One heavy user can exhaust it for everyone, and the switch is the remedy.
- A key keeps its own limit. A wrong key still gets 401 with `invalid_token`, and still counts
  against the failed-auth limiter. The 401 for a missing key now happens only with the switch off.
- Keep-warm probes with a deliberately invalid key, so it still expects 401. `mcp-smoke` also
  calls a tool with no key.
- There is still no OAuth metadata, and `/.well-known/oauth-protected-resource` stays 404.
- Unproven: whether Claude's connector sends an `Origin` header. The SDK refuses browser origins,
  so a connector that sends one would get 403, logged as `http_403`.

**A27. An outside review's ranking and freshness findings.**

- **A rate counts toward a category only if most purchases in it earn it.** `LIMITED_RATE`, in
  both rankings and pinned by the parity fixture, drops rates limited to a partner network
  (Bilt), certain hours (Citi Nights), one merchant (Costco gas, Amazon and Whole Foods), one
  website (Disney+, Hulu and ESPN) or online orders (Sapphire Preferred's groceries). The card's
  broad rate competes instead, as `BRAND_EXCLUDES` already did for single-brand travel. Dining
  had ranked Bilt Obsidian, Bilt Palladium and Strata Elite above Amex Gold on such rates. The
  rule matches words, so a reworded card could slip past it: `winning_rates.json` lists the rate
  every card competes on in every category, and CI fails until a change to it is regenerated and
  read. CI also fails on a new "Up to" rate or website-only everyday rate the rule doesn't cover.
- **Kept, on the owner's call:** travel portal rates still count, since any flight or hotel can
  be booked that way, and a choose-your-category rate counts in each category it offers. Both
  are now stated on the Methodology page and in `rank_by_category`'s limitations.

**Defaults taken while owner decisions are open.** Each can change before release:

- **Hosting:** free tier, as in D1.
- **`rank_by_category` wallet mode:** kept, as in D5.
- **`verified_only` filter:** deferred. It is a new optional input, so a minor
  version can add it.
- **Re-verification of the 5 unverified cards in top-3 slots and the 10
  `issuer_pass` cards:** the November 2026 refresh (A25) re-checked the
  `issuer_pass` cards. It left out retail co-brands, so the cards still unverified
  in top-3 slots are all retail: Costco, Wayfair, Key Rewards and both BJ's cards.

### Product and business-model calls this makes

- **Serving the analysis to agents is a product decision.** The API host's
  `robots.txt` exists because the prerendered pages withhold the analysis
  (verdicts, realistic values, tiers) that the API serves.
  - Keyed MCP access deliberately hands that analysis to agents acting for
    users, under keys the owner controls.
  - It does not change what is exposed. The data is in a public MIT repository,
    and `robots.txt` says it is not a security control.
  - It changes the distribution channel, which is the decision.
- **It sits on the open side of the open-core line.** It serves the same data
  and the same deterministic arithmetic the open site computes: no
  personalization, no model, no new recommendation logic. Keys are an access
  and abuse control, not a product tier.
  - The corollary binds: everything in `backend/mcp_server/` is MIT. The future
    private recommendation engine must not be built in it, and must call it as a
    client if it uses it.
- **Terms and regulatory posture are a gate, not code.** Settle the terms under
  which keys are issued (attribution, caching, redistribution) before issuing
  any key to a consumer-facing product.
  - Whether redistributing rate and fee data to third-party agents that present
    it to consumers creates obligations, for The Wallet Audit or the integrator,
    needs qualified advice.
  - That advice is due before any paid or self-serve distribution. This ADR does
    not estimate the answer (O8).

---

## Consequences

**Easier:**

- An agent can get hand-sourced figures together with exactly how fresh each
  one is, and can tell "unknown" from "none".
- "Which cards have not been checked since September" becomes a one-line query
  over `backend/data/refresh/`.
- ADR 0001's pipeline inherits a populated, strict, pinned state directory
  instead of an empty one.
- Ranking drift between the site and any second consumer becomes impossible to
  merge, and every ranking change becomes a reviewable diff.

**Harder:**

- Any card edit that moves a ranking input needs a three-command fixture
  regeneration.
- Every new card needs a sidecar; the pin enforces it, and `card-author` must
  learn it.
- Any surface change needs a version entry.
- MCP shares fate with the site's API process. A flood degrades both, bounded
  by D8's limits.
- Revocation takes a redeploy.

**No longer possible:**

- changing ranking in TypeScript without Python following;
- giving the Python ranking a path to `is_affiliate_link` without failing CI;
- an MCP call that queries Neon, short of deleting a test;
- a truncated response;
- a backfilled verification date that no evidence supports;
- minting a key from an agent's shell.

**Explicitly preserved:**

- **JSON is the source of truth.**
- **The database stays derived and rebuildable from the repo.** Verification
  state and credentials are both outside it.
- **The prerender, routes and sitemap are untouched.**

## Migration path

The cards already in the catalog are not edited. No card id, slug, filename or
route changes, and no indexed URL moves. The new host serves the existing
`robots.txt` (`Disallow: /`) and the guarded `/mcp`. One branch,
`feat/mcp-server`, into `development`.

1. **Dependency.** `uv add "mcp>=2.3.0,<3"`, then `uv lock` (`httpx2` moves to
   2.16.0). Run `uv lock --check` and `uv run pytest` (expect 988).
2. **Sidecars.** `backend/refresh/state.py`, the 109 files from the D4 table,
   and `test_verification_sidecars.py`. No MCP code yet. This step stands alone
   as ADR 0001's first slice.
3. **Ranking.** The TS refactor, `rankingParity.test.ts` with its fixtures, the
   Python port, and the parity, blindness and invariant tests.
4. **Tools.** The snapshot, schemas, values, tools, contract, in-memory tool
   tests, the eval, budgets and the surface snapshot.
5. **Keys, guard and wiring.** `keys.py`, `config.py`, `guard.py`,
   `observability.py`, the `main.py` wiring, `mcp_keys` with its tests, and the
   HTTP and logging tests.
6. **Docs and config.** `render.yaml`, the READMEs, the `CLAUDE.md` entry and
   `card-author.md`.
7. **Owner.** DNS, domain, `MCP_API_KEYS` with a smoke key, and the
   `MCP_SMOKE_KEY` repository secret.
8. **Merge and release** to `main` through the normal path. Branch protection requires
   `backend` and `frontend` before the merge, and Render deploys what lands on `main` (D13-A14).
9. **Run `mcp-smoke`.** Record its results in `backend/README.md`. If
   `mcp.thewalletaudit.com` is challenged, stop: assumption 1 failed, and the
   hostname decision reopens before any key goes to someone else.
10. **First external key.** Mint a key with an expiry for the first outside user, and connect it once
    from Claude Code with `timeout: 120000`.

## Alternatives rejected

**A separate Render service for the MCP.** It would exceed 750 instance hours
when kept warm, or cold-start into a 60 s client floor when not. Revisit on a
paid instance, or if MCP failures must be isolated from the site.

**`api.thewalletaudit.com/mcp`, proxied.** Bot Fight Mode cannot be skipped
per path on the free plan, and agents run in datacenters. Revisit if the zone
gains per-path bot exceptions; then the record can be orange-clouded too.

**Publishing the raw `onrender.com` URL.** It ties integrators to a Render service
name. It is kept only as an undocumented fallback. It is not revisitable while
a branded name costs nothing.

**A TypeScript MCP server reusing `computeTopPicks`.** It needs a Node runtime,
either a second service or two runtimes in one free instance. Revisit if the
frontend moves to a Node server, or if the ranking grows enough that a port
costs more than a runtime.

**A Python port without a cross-language pin.** It would drift silently. The
codepoint-versus-`localeCompare` divergence at position 25 is the measured
proof. Not revisitable.

**Per-call database reads.** A Neon wake per call, and a site/MCP split only
under the unsupported `drafts promote` path. Revisit only if the MCP must serve
data written at run time.

**Stateful sessions or SSE.** Memory, long connections, and state lost on
nightly sleep, for tools that need none of it. Revisit if a tool needs
progress, streaming or server-to-client requests.

**Keys hashed in a Postgres table.** A per-call read or cache, and credential
state in a derived database, to gain instant revocation. Revisit beyond about
20 keys, with self-serve issuance, or if a revocation must beat a deploy.

**The SDK's `TokenVerifier`/`AuthSettings` path for keys.** It needs a fake
`issuer_url` and sits one setting away from false OAuth metadata. Revisit with
real OAuth.

**Slow password hashing for keys.** It costs CPU per request and protects
nothing a 256-bit key does not already. Not revisitable.

**Rejecting unknown arguments through SDK middleware.** The API is provisional,
and the refusal reaches the client application, not the model. The `query` echo
is the replacement. Revisit when the SDK offers a stable strict-arguments
option.

**Truncating oversize responses at run time.** It is the exact failure the
budgets exist to prevent. Not revisitable.

**Serving welcome bonuses.** The site withholds them for staleness. Revisit
only if the site renders them.

**Verification dates from git last-edit, from `LAST_AUDITED`, or inside card
JSON.** Rejected by ADR 0001 decisions 1 and 5 and by commit `6961e9d`. Not
revisitable.

**Host-scoped routing on the MCP host.** The raw origin already exposes every
route unproxied. Revisit if the raw origin ever stops being publicly reachable.

**A `served_at` timestamp.** It suggests an as-of-now date for September
facts. Not revisitable for facts.

**A full-catalog list tool.** It would be about 30–60 KB per call. Paginated
`find_cards` replaces it. Not revisitable.

**LLM-judged evals as the CI gate.** Nondeterministic and costly. Revisit with
a recorded-answer harness that is deterministic.

**A site UI or self-serve key portal.** Blocked on O8. Revisit after the
first outside users, and after the advice.

---

## Implementation plan

Code comments are 1–2 lines at most, so put rationale in this ADR, in docstrings
kept to two lines, and in test failure messages. No em-dashes in any
agent-facing string.

### Module layout

```
backend/
  refresh/
    __init__.py
    state.py              # SectionKey, DocumentKind, VerificationRecord, VerificationState, degraded(), load_all()
  mcp_server/             # not "backend/mcp": that name would shadow the SDK if backend/ were ever on sys.path
    __init__.py           # exports mcp_endpoint (the McpEndpoint instance main.py wires)
    contract.py           # CONTRACT_VERSION, PUBLISHED_SURFACES, INSTRUCTIONS, REPO_URL, SITE_URL
    config.py             # McpConfig, Limits (constants in D8), load_config() -> McpConfig (never raises)
    keys.py               # KEY_RE, KeyRecord, KeyStore.verify(header_value) -> key_id | None, mint_key()
    snapshot.py           # CatalogSnapshot (frozen), build_snapshot() via services.cards + refresh.state.load_all
    ranking.py            # RankInput, RANK_INPUT_FIELDS, CATEGORIES, matchers, rank_category(), collation_key()
    values.py             # credit_values(card, overrides) -> applied credits + totals
    schemas.py            # Meta, Fact, ProvenanceRef, Provenance, per-tool output models
    errors.py             # ErrorCode StrEnum, tool_error(code, message) -> CallToolResult
    tools.py              # create_server(load_snapshot) -> MCPServer with the five tools
    guard.py              # McpEndpoint: run() lifespan context + ASGI __call__ (D8 order)
    observability.py      # logger setup, request line, rejection aggregator, boot lines
backend/scripts/mcp_keys.py   # mint (tty-gated), check
backend/data/refresh/{card_id}.json  # 109 files
```

### Files changed

- **`backend/main.py`:**
  - the lifespan becomes `get_card_summaries()` then `async with
    mcp_endpoint.run(): yield`;
  - after the routes, add `app.router.routes.append(Route("/mcp",
    endpoint=mcp_endpoint))` and the same for `"/mcp/"`;
  - `/` gains the `mcp` key.
- **`pyproject.toml` and `uv.lock`:** step 1.
- **`render.yaml`:** D12.
- **`frontend/src/utils/topPickCategories.ts`:** D6 exports and `rankCategory`.
- **`README.md`, `backend/README.md`:** D12.
- **`CLAUDE.md`:** a short entry on the parity fixture, sidecars and RankInput.
  - Check every claim against the merged code.
  - Call it out in the PR body, per the repo's rule for this file.
- **`.claude/agents/card-author.md`:** a new card needs a null sidecar.
- **`.github/workflows/mcp-smoke.yml`** (new, `workflow_dispatch` only):
  - For each of `mcp.`, the raw origin and `api.`: POST `initialize`,
    `tools/list` and `tools/call get_card amex-gold` with `MCP_SMOKE_KEY`.
    Record the status, `server`, `cf-ray` and `cf-mitigated` headers.
  - Assert success on `mcp.` and the raw origin. Report, without failing, on
    `api.`, where a 421 or a Cloudflare challenge is expected.
  - Spoof checks:
    - one request to `mcp.` with a forged `CF-Connecting-IP`, expecting
      Cloudflare's 403 or error 1000;
    - 25 bad-key requests with forged and rotating `True-Client-IP` and
      `X-Forwarded-For`, expecting 429 by the 21st;
    - if either fails, assumption 2 failed, and the failed-auth limiter keys on
      the peer address only.

### Wiring details the tests rely on

- **`McpEndpoint.run()`** runs in this order:
  1. `load_config()`;
  2. if enabled, `snapshot = await anyio.to_thread.run_sync(build_snapshot)`
     inside `try/except Exception`, where any failure means disabled;
  3. `server = create_server(lambda: snapshot)`, fresh each lifespan;
  4. `app = server.streamable_http_app(streamable_http_path="/mcp",
     stateless_http=True, json_response=True, max_request_body_size=32768,
     transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True,
     allowed_hosts=config.allowed_hosts, allowed_origins=[]))`;
  5. `async with server.session_manager.run():` set state, yield, and clear
     state in `finally`.
- **`create_server`** builds `MCPServer(..., lifespan=...)`, whose lifespan
  yields `{"snapshot": load_snapshot()}`. Tools take `ctx: Context` and read
  `ctx.request_context.lifespan_context["snapshot"]`.
- **`MCP_ALLOWED_HOSTS`** is comma-separated and defaults to
  `localhost:*,127.0.0.1:*`. Tests use `testserver`.
- **The snapshot digest** is SHA-256 of `json.dumps({"summaries", "cards",
  "verification"}, sort_keys=True, separators=(",", ":"))` over model dumps,
  truncated to 12 hex characters.
- **HTTP tests:**
  - use `with TestClient(app, follow_redirects=False)` inside
    `pytest.MonkeyPatch.context()`, setting `MCP_API_KEYS` (a test key minted
    with `mint_key()`) and `MCP_ALLOWED_HOSTS=testserver` before entering;
  - send `accept: application/json, text/event-stream` and
    `content-type: application/json`;
  - the official-client test enters `app.router.lifespan_context(app)` and uses
    `httpx2.ASGITransport(app=app)`.
- **In-memory tests** use `Client(create_server(lambda: SESSION_SNAPSHOT))`,
  with a session-scoped snapshot built from the conftest-seeded database.

### Tests and what each asserts

Python tests live under `tests/backend/`, MCP ones in `mcp_server/` with its
own `conftest.py`. Fixtures live under `tests/fixtures/ranking_parity/`.

| File | Asserts |
|---|---|
| `test_verification_sidecars.py` | D4 pins 1–6: stems equal ids both ways; strict validation; the `BACKFILL` ledger, membership and dates (86 ids across seven evidence keys, 23 null); no future dates; null only when null; degraded on hostile inputs; no em-dash. |
| `mcp_server/test_ranking_parity.py` | D6: fixture currency, exact equality with `expected.json`, definitions, collation, non-vacuity, and update mode refused under `CI`. |
| `mcp_server/test_ranking_blindness.py` | D6: the `RankInput` allowlist is exact and lacks `is_affiliate_link`; affiliate flips leave output identical. |
| `test_matcher_input_invariants.py` | D6: no non-ASCII letters or whitespace in matcher inputs; matching multipliers are finite; names are unique. |
| `mcp_server/test_tools_contract.py` | Each tool's structured content validates against its published `outputSchema` (`jsonschema` ships with `mcp`); the text equals the compact JSON; every error code's shape and 400-character bound; a one-typo id gets the right suggestion; partial unknowns refuse the whole call; override clamping is reported; `query` is echoed; `withheld` and `omitted_sections` are correct; `not_recorded` never carries a value. |
| `mcp_server/test_eval_against_content.py` | D11, including the `ast` import restriction. |
| `mcp_server/test_size_budgets.py` | D5's exhaustive budgets. |
| `mcp_server/test_tool_surface.py` | D10: snapshot equality, published digest, bounded inputs, annotations, no `_cents`, no em-dash, refusal under `CI`. |
| `mcp_server/test_keys.py` | Mint round trip; secrets containing `_` parse; accepts only the exact key; rejects a wrong secret, unknown id, malformed or expired key, a non-Bearer scheme or a query-string key; `compare_digest` is used (a spy); config validation (malformed JSON, duplicate ids or hashes, more than 50 records, unknown keys) disables the MCP rather than raising. |
| `mcp_server/test_mcp_keys_cli.py` | `mint` refuses without a TTY; its printed record verifies the printed key; `check` validates. |
| `mcp_server/test_guard_http.py` | Every D8 rule (described below). |
| `mcp_server/test_no_db_per_call.py` | After lifespan start, a battery of every tool over HTTP executes zero SQL statements (`event.listen(engine, "before_cursor_execute", ...)`). |
| `mcp_server/test_observability.py` | One valid JSON line per authenticated request with the D9 fields; unknown tool names logged as `<unknown>`; rejections aggregated; across the whole HTTP battery, the captured logs contain no key secret, no `Authorization` value and no IP-looking string. |
| `frontend/tests/utils/rankingParity.test.ts` | Writes and checks `expected.json`; the first three `rankCategory` entries equal `computeTopPicks`'s slots for every scenario and category. |

`test_guard_http.py` covers:

- **Auth responses:** a 401 with and without a credential, the
  `WWW-Authenticate` shape, no `resource_metadata`, and the well-known 404.
- **Path and method:** `POST /mcp` returns 200 with no redirect; `/mcp/` gets a
  404 with the hint; GET, DELETE and PUT get 405 with `Allow`.
- **Body and parsing:** 413 by header and by stream; 408 on a slow body (a
  short deadline through config); a depth-5,000 body gets 400 and never a 500.
- **Transport checks:** a bad Host gets 421; any Origin gets 403; a `text/plain`
  content type gets 400.
- **Limits:** a per-key 429 with `Retry-After`, while another key is
  unaffected; the failed-auth 429 while a valid key from the same client still
  passes; the in-flight limit gets 503 (a fake slow inner app).
- **Disabled states:** with no keys, `/mcp` gets 503 while `/healthz` and
  `/api/cards` still return 200; invalid key config and a forced snapshot
  failure both boot with the MCP disabled.
- **Existing behaviour and headers:** `POST /api/cards` still returns 405 and
  unknown paths keep JSON 404; gzip applies over 1,024 bytes; `X-Request-Id` is
  present.
- **The official client:** the 2.3.0 `Client` completes initialize, list and
  call over `httpx2.ASGITransport`.

### Order of work

The work follows migration steps 1–6, one commit each. Each step leaves the
suite green on its own. Step 2 is shippable alone, and steps 3 and 4 can be
reviewed before any network surface exists.

### Owner actions

- **O1.** Done 2026-11-06. In Cloudflare DNS, add a CNAME from `mcp` to
  `thewalletaudit-api.onrender.com`, with proxy status set to DNS only.
- **O2.** Done 2026-11-06. In Render, add `mcp.thewalletaudit.com` to `thewalletaudit-api`
  (Blueprint sync or the dashboard) and wait for the certificate.
- **O3.** In Render, set `MCP_API_KEYS`. Confirm an env-var save redeploys, and
  time a revocation once.
- **O4.** Removed. `checksPass` is not used (D13-A14).
- **O5.** Mint a dedicated smoke key, add the `MCP_SMOKE_KEY` repository
  secret, and run `mcp-smoke` after the first deploy.
- **O6.** Consider requiring `backend` and `frontend` on `development`. It is
  unprotected today, which is verified.
- **O7.** Mint keys only in a real terminal, deliver them over a secure channel,
  and set an expiry.
- **O8.** Decide the key-issuance terms, and get qualified advice before any
  use by a consumer-facing product.
- **O9.** Done 2026-11-06. Before `fix/footer-audit-dates` merges, change "full
  issuer-by-issuer re-check" so it does not cover the 23 unchecked cobrand cards, for
  example "86 of 109 cards".
- **O10.** Done 2026-11-06 (D13-A19). Decide whether keep-warm should run around the clock:
  744 h against 750 h, versus overnight cold starts for callers.
- **O11.** Never run `drafts promote` against the production `DATABASE_URL`
  (D3).

### Open risks

- **Datacenter reachability** is proven from Google Cloud only (D13-A13). GitHub-hosted
  runners wait for step 9 (assumption 1), and AWS is untested.
- **The client-IP header assumption** (assumption 2) affects only the
  failed-auth limiter, and step 9 tests it.
- **Cold starts** against clients that keep the 60 s default, now only if keep-warm fails or
  the free hours run out (D13-A19).
- **Shared fate with the site's API** under abuse, bounded by D8.
- **Parity guarantees agreement, not correctness.** A deliberate TS rule
  change, regenerated with `-u`, makes both sides wrong consistently.
- **The 78 cards with `not_recorded` intro APRs** make the server less useful
  for 0% offer questions. The cause is the content, and fixing it is a separate
  decision.
- **Provisional SDK surfaces and future 2.x changes.** These are mitigated by
  the lock pin and by the surface and HTTP tests.
- **The terms and regulatory gate (O8)** is open by design.
