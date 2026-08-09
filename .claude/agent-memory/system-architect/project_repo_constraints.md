---
name: repo-architectural-constraints
description: Load-bearing constraints verified in the code that bound most architecture decisions here (boot-path blast radius, glob reach, tty gate, CI bot-blocking)
metadata:
  type: project
---

Constraints verified by reading the code on 2026-08-08. Re-verify before relying
on any of them; they are claims about that date.

- **`seed_catalog` runs on the API's critical boot path.** `render.yaml`
  `startCommand` chains `alembic upgrade head && seed_catalog && uvicorn`, and
  `seed_catalog` `sys.exit()`s on the first file failing `Card(**data)`. A
  malformed card JSON is a service-down event, not a bad row. Any design that
  writes card JSON inherits this blast radius.
- **`seed_catalog`'s default glob is `backend/data/cards/**/*.json`, recursive.**
  Any `.json` file anywhere under `backend/data/cards/` is fed to the `Card`
  model at boot. Sidecar/state/metadata files must live outside that tree.
- **KNOWN GAP (verified 2026-08-08, unfixed): the catalog tests glob `*/*.json`
  (one level) while `seed_catalog` globs `**/*.json` (recursive).** Identical
  results today, but a card file nested at `cards/{issuer}/sub/x.json` is loaded
  at boot and invisible to `test_catalog_schema.py` and `test_catalog_files.py`.
  CI green, API down. Flagged as an independent `chore/` fix in ADR 0001 §7f.
  Trap in the obvious fix, verified on a scratch tree: the tests exclude staging
  via `p.parent.name != "staging"`, and under a recursive glob
  `cards/staging/nested/n.json` has `parent.name == "nested"` and would be
  validated as a live card. The filter must become `"staging" not in p.parts` in
  the same change as the glob.
- **`drafts promote` and `reject` are tty-gated** (`_require_interactive` in
  `backend/scripts/drafts.py`) and additionally denied by a `PreToolUse` hook in
  `.claude/settings.json`. No automated path can promote a draft. The drafts
  queue is for new cards only; updates to live cards are reviewed as git diffs.
- **GitHub Actions runners get bot-challenged.** `keep-warm.yml` documents that
  this project's own Cloudflare zone JS-challenges Actions runner traffic, which
  is why it pings the raw `onrender.com` origin. Assume issuer WAFs behave at
  least as aggressively for any outbound-fetch job run from CI.
- **No HTTP client in production dependencies.** `pyproject.toml` default deps
  are alembic/fastapi/psycopg/pydantic/sqlalchemy/uvicorn; `httpx2` is dev-only.
  Render builds with `uv sync --frozen --no-group dev`, so a new non-default
  group is the place for any scraping/fetching stack.
- **`enforce-main-source.yml` constrains only PRs into `main`** (must come from
  `development` or `fixes`). PRs into `development` are unconstrained by CI.
- **108 of 109 cards have `official_url`.** The exception is
  `backend/data/cards/amex/amex-green.json`. Any design touching issuer sources
  must say what happens to it.
- **The drift-pin pattern this repo uses** is a bidirectional whole-array
  equality assertion, e.g. `SEO_ISSUERS` vs `ISSUERS` in
  `frontend/tests/utils/routeMeta.test.ts`, and `CLASSIFICATION` vs the real
  catalog in `frontend/tests/utils/cardTaxonomy.test.ts`. If a proposal creates a
  second copy of anything, it ships with a pin in that style or it does not ship.

**Why:** These are the constraints that most often invalidate an
otherwise-reasonable design, and they are not obvious from the READMEs. The ERD
in `backend/README.md` is the most authoritative-looking document in the repo and
describes a layer content authoring never touches.

**How to apply:** Check a proposal against this list before writing it up.
Related: [[adr-log]].
