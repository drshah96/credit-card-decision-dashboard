---
name: feedback-migration-constraints
description: Verified SQLite/Postgres migration constraints and two live data defects found while writing the feedback ADR — batch mode reflection, alembic FK enforcement, and best_cpp using max() instead of the best flag
metadata:
  type: project
---

Verified by reading code and running a full migration chain on a scratch SQLite
file, 2026-08-12. Re-check before relying on any of them.

**Batch-mode reflection carries indexes but not CHECK constraints.** SQLAlchemy
cannot reflect CHECKs from SQLite, so `batch_alter_table` without `copy_from`
silently drops every CHECK it did not explicitly recreate — but indexes survive.
`copy_from` bypasses reflection entirely, so it must enumerate columns, indexes
*and* constraints, and indexes still need manual recreation afterwards. Postgres
alters in place and rebuilds nothing, so an unconditional `create_index` in the
migration fails there with `DuplicateTable`. All of this is written up in
`alembic/versions/17bf796f577f_*`'s docstrings, which are the best reference in
the repo. Re-check: build a fresh SQLite DB with `DATABASE_URL=sqlite:///...
uv run alembic upgrade head`, then `PRAGMA index_list(<table>)`.

**Measured cost asymmetry between the two enum-bearing tables** (fresh chain,
2026-08-12): `page_views` has 1 CHECK and 5 indexes; `card_feedback` has 10
CHECKs, 3 indexes plus a unique autoindex, and 14 columns. Widening the
`page_views` event-type CHECK is a five-line migration done correctly twice
(`f5e891bf35ba`, `a1c4d7e92f30`). Changing a `card_feedback` CHECK means a
`copy_from` describing all of the above. Treat "which table does this enum live
on" as a migration-cost decision, not a modelling preference.

**`ON DELETE CASCADE` does not fire during SQLite migrations.**
`backend/db.py` attaches its `PRAGMA foreign_keys=ON` listener to *its* engine;
`alembic/env.py` builds a separate one via `engine_from_config` and never sees
it. Any migration deleting parent rows must delete child rows explicitly.
Re-check: `grep -n engine_from_config alembic/env.py` and
`grep -n _enable_sqlite_fk backend/db.py`.

**Defect, unfiled: `CardSummary.best_cpp` uses `max(cpp)`, not the authored
`best: true` flag.** `backend/services/cards.py:244`. The two disagree on 16
cards, always in the inflating direction: Amex Delta ranked at 2.2¢ instead of
the authored realistic 1.15¢, United at 2.5¢ instead of 1.3¢, AAdvantage at
2.0-2.2¢ instead of 1.4¢, Southwest at 1.5¢ instead of 1.3¢. `topPickCategories`
ranks on `multiplier × best_cpp`, so airline cards are ranked on their
aspirational sweet-spot rung. This is a hit on the honest-valuation claim in the
opposite direction from monetization bias. Re-check: compare `max(o.cpp)` with
`max(o.cpp for o in options if o.best)` per card file.

**Defect, being fixed by the feedback ADR: `welcome_bonus` is offered as a
feedback option on 79 of 109 cards for a block that is not rendered.** The
render is commented out at `frontend/src/pages/CardDetailPage.tsx:1038-1058`;
`availableFeatures()` in `frontend/src/utils/cardFeatures.ts` still gates on
`Boolean(card.welcome_bonus)`.

**The feedback option list exists in five places with no pin:** the TS union in
`frontend/src/api/feedback.ts`, `LIKED_FEATURE_LABELS` + the `present` map in
`cardFeatures.ts`, the Pydantic `Literal` in `backend/models.py`, the CHECK text
in `backend/db_models.py`, and a hand-typed list in
`tests/backend/test_feedback_api.py`. The cross-language pin precedent is
`tests/backend/test_catalog_files.py`, which parses `cardImages.ts` with a regex
rather than copying its extension list.

**Why:** Each of these invalidated or reshaped a draft recommendation while
writing the feedback ADR, and none is visible from the READMEs.

**How to apply:** Check any schema proposal touching `card_feedback` or
`page_views` against the cost asymmetry first. Do not cite `best_cpp` as "the
card's honest rate" until `services/cards.py:244` is fixed.

Related: [[feedback-question-model]], [[repo-architectural-constraints]].
