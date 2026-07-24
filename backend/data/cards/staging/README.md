# Staging

New card JSON files live here first, not directly in an issuer folder.

Workflow:

1. Research the card and write `backend/data/cards/staging/{slug}.json`.
2. Add it to the review queue:
   ```bash
   uv run python -m backend.scripts.drafts add <slug> "<source url>" backend/data/cards/staging/<slug>.json
   ```
3. Review and promote (or reject) via `drafts show` / `drafts promote` / `drafts reject`.
4. Once promoted, move the file out of staging into its issuer folder:
   ```bash
   git mv backend/data/cards/staging/<slug>.json backend/data/cards/{issuer}/<slug>.json
   ```

A file sitting in an issuer folder (`amex/`, `chase/`, `capital-one/`, ...) means "this card is live in
`card_catalog.db`." A file sitting here means "drafted, not yet promoted": the test fixture in
`tests/backend/conftest.py` skips this folder for exactly that reason, keeping the promoted/pending
boundary visible in the file tree itself, not just in the `card_drafts` table.
