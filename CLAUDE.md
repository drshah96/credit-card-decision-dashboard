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
