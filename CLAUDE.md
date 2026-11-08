# CLAUDE.md

Project notes for Claude Code. The three READMEs (root, `backend/`, `frontend/`)
are the real documentation; this file is for behaviour that is load-bearing,
non-obvious, and not written down anywhere else.

## Non-obvious behaviour

**Content and storage are different shapes. Take field names from `Card`, never
from the ERD.**

Card content lives in JSON files shaped by the `Card` model in
`backend/models.py`. The database is a separate shape defined by
`backend/db_models.py`, and `upsert_card()` maps one to the other. Anything that
reads or writes card files derives its paths from `Card.model_fields` or from a
real card file. Nothing derives them from the schema documentation.

The trap is that `backend/README.md` carries the ERD and the CARDS table, which
makes it the most authoritative-looking document in the repo. It describes the
layer nobody authoring content ever touches. Working from it produces names that
match nothing in any file:

| Content (what you author) | Storage (what the ERD documents) |
|---|---|
| `annual_fee`, `max_annual`, `default_value`, whole dollars | `annual_fee_cents`, `max_annual_cents`, `default_value_cents` |
| `credits[].removed`, a boolean | `is_removed` plus a `removed_on` date |
| array position | `sort_order` |
| `verdict.text`, `points.note`, `transfer_partners.highlight` | `verdict_text`, `points_note`, `transfer_highlight` |
| `timeline[]` with `date` / `type` / `badge` / `text` | `timeline_events` with `event_date` / `description` |
| `transfer_partners.partners[]` | `card_transfer_partners` |

No card JSON has ever contained a `_cents` key. Writing one costs either a
rejected draft or a value a hundred times too large, and the second failure is
quiet.

Two properties make this worth stating here rather than in the tools that hit
it. It is invisible on inspection: a wrong path doesn't raise, it resolves to
nothing, so a reader that never finds a field looks exactly like a catalog with
nothing to report. And it catches people, not just agents. Four of the eight
subagents in `.claude/agents/` were authored from the ERD and shipped with the
wrong names, including one whose entire audit divided two fields that exist in
no file.

`tests/backend/test_catalog_schema.py` pins the content side: a key the `Card`
model would ignore fails CI, so a `_cents` field in a card file is caught rather
than silently dropped.

**Points pooling is opt-in, and the default ranking never pools.**
`computeTopPicks` takes `applyPointsPooling`, which defaults to `false`.
`TopPickPage` turns it on only once the user has actually selected cards
(`selectedIds.size > 0`), because pooling a real Ultimate Rewards or ThankYou
balance requires holding both cards, which a whole-catalog ranking has no way to
know. So the default Top Picks ordering values every card on its own `best_cpp`.

Two further details are easy to get wrong when reasoning about this:

- Pooling keys on `points_pool_id`, an authored field on the card, **not** on
  `points_program`. The two agree one-for-one today, which makes them easy to
  conflate, but they are separate fields and the seam is deliberate.
- Only a card flagged `points_pool_receiver` can be the *source* of a boost.
  Two feeder cards sharing a pool id must not lift each other, since
  transfer-partner access needs an actual premium account in the mix.

All of it lives in `effectiveCppFor` in `frontend/src/utils/topPickCategories.ts`.

**The MCP server's data rules are pinned, and three kinds of edit trip them.**

`backend/mcp_server/` serves the catalog to AI agents from a snapshot built at boot.
[ADR 0003](docs/adr/0003-public-mcp-server.md) has the design, and D13 overrides earlier
sections where they conflict.

- **A factual card edit fails CI** until its `backend/data/refresh/<id>.json` records a
  new check or goes null. The file hashes what was verified. Updating only the hash claims
  a check nobody did. Editorial fields such as `verdict` are outside the hash.
- **A ranking input or rule change fails CI** until the fixture in
  `tests/fixtures/ranking_parity/` is regenerated. A card edit or Python rule change fails
  the backend job, and a TypeScript rule change fails the frontend job. Python and TypeScript
  must agree down to exact floats, so a rule belongs in both. The steps are in
  `backend/README.md`.
- **A tool contract change fails CI** until `CONTRACT_VERSION` and `PUBLISHED_SURFACES` in
  `backend/mcp_server/contract.py` are updated.

Two details are easy to get wrong. `RankInput` has no affiliate field on purpose, so never
add one. And `default_value` is 0 on 149 of 151 active credits, so the served totals say
`applied`, never `realistic`.
