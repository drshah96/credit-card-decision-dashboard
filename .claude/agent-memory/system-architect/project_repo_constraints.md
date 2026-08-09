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
- **FIXED 2026-08-09 in PR #192 (was: catalog tests globbed one level while
  `seed_catalog` globbed recursively).** Now pinned by
  `tests/backend/test_seed_catalog_boundary.py::test_ci_validates_exactly_what_seed_catalog_seeds`,
  both directions. `seed_catalog` grew `select_files()` and `is_staged()`, and
  the catalog tests glob `**/*.json` with `"staging" not in p.parts`. Two real
  bugs were behind this: a *valid* staging draft was silently published to the
  live catalog on next API boot, and an *incomplete* one broke the boot. That
  pair is the demonstrated blast radius of writing into `backend/data/cards/`.
  Re-check: read `backend/scripts/seed_catalog.py` for `is_staged`.
- **Pattern to copy for any new catalog/state pin: drive the real selection
  function, never reimplement its filter in the test.** The boundary test's
  docstring records that an earlier draft of it reimplemented the filter and
  passed against a mutated seeder.
- **`uv --frozen` does not verify the lockfile is current** (uv 0.11.28):
  `--locked` asserts `uv.lock` is unchanged, `--frozen` syncs without updating
  it. `render.yaml` and `ci.yml` both use `--frozen`, so a dependency added
  without committing the regenerated lock installs silently-incomplete and
  surfaces as a run-time ImportError. `uv lock --check` is the guard; it passes
  as of 2026-08-09 and is not yet wired into CI. Re-check: `uv sync --help`.
- **Agent "read-only" is advisory, not mechanical (verified 2026-08-09).**
  `card-verifier`, `editorial-auditor`, `tier-auditor`, `frontend-reviewer`,
  `schema-reviewer`, `migration-reviewer` all grant `Bash` alongside
  `disallowedTools: Write, Edit, NotebookEdit`. Denying the Write *tool* does not
  stop `echo > file`. `.claude/settings.local.json` has only `allow` entries (no
  `deny`/`ask`) and is gitignored, so on a runner the only committed mechanical
  gate is the single `PreToolUse` hook for `drafts (promote|reject)`. Do not cite
  agent frontmatter as containment. Prefer asserting the *outcome*
  (`git status --porcelain` empty after a read-only stage) over the capability,
  since an outcome check survives a tool grant being added back. Re-check:
  `grep -E "^(tools|disallowedTools):" .claude/agents/*.md`. The user was
  tightening these grants as of 2026-08-09, so re-read before relying either way.
- **Headless subagent invocation works** (claude 2.1.226):
  `claude -p --agent <name> --output-format json "<prompt>"`, exit 0, parseable
  JSON with `result`/`num_turns`/`total_cost_usd`/`usage`/`session_id`. Project
  agents are discovered without registration. Measured $0.05-$0.19 and 5-15s for
  trivial prompts — a floor, not an estimate for real work. Untested on a runner:
  auth (needs an explicit secret; local subscription auth does not travel) and
  `--allowedTools`/`--permission-mode`.
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
