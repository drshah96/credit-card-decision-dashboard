---
name: feedback-question-model
description: The card-feedback second-iteration ADR (reference/adr-feedback-question-model.md) — what it decided about multi-select, both branches, the option set, and the site-helpful question
metadata:
  type: project
---

Written 2026-08-12 to `reference/adr-feedback-question-model.md` (gitignored;
the user asked for it there, alongside `architecture-review-2026-08.md`, rather
than in `docs/adr/`). Status proposed, unnumbered; would be 0002 if promoted.
Replaces the schema half of PR #243 (`feat/feedback-interested-respondents`,
green, unmerged).

**The four calls:**

1. **Keep "what appeals to you most" single-choice**, but move storage to a
   child table `card_feedback_features(feedback_id FK CASCADE, feature,
   UNIQUE(feedback_id, feature))`. Deciding factor was measured, not stylistic:
   `availableFeatures()` offers a mean of **4.07** options per card across 109
   cards, so multi-select converges on the availability distribution we already
   have in the JSON. The child table makes multi-select later a UI change plus
   one integer.
2. **Ask holders the same question**, different wording ("which part actually
   pays off"), optional for holders / required for interested, one option
   domain, disambiguated by the parent's `respondent_type` via join. Rejected a
   denormalised `asked_as` column as speculative — it is exactly derivable now
   and backfillable later; trigger to add it is the first design where one
   submission answers both framings.
3. **Nine options.** Drop `welcome_bonus`. Add `redemption_rate` (gated on
   best-flagged cpp > 1.0, 36 cards) and `intro_apr_balance_transfer` (35).
   Rename `intro_apr` → `intro_apr_purchases` (33 cards carry both intro types).
   Drop "0%" from both intro labels — it is false on 5 cards.
4. **Site-level "was this helpful"** goes to `page_views` as
   `event_type='site_helpful_rated'`, `value='yes'|'no'`, thumbs only, no free
   text, rendered outside the feedback form, shipped as a separate later PR.
   Rejected `card_feedback` (makes `card_slug` ambiguous, consumes the session's
   one row per card) and a dedicated table (disproportionate).

**Why:** These are the decisions a follow-up run should build on rather than
reopen. The measured numbers are the part that would be expensive to recompute.

**How to apply:** Read the ADR before touching the feedback form, its schema, or
the option list. Re-verify the counts if the catalog has grown past 109 cards
(`python3` over `backend/data/cards/**/*.json` excluding `staging`).

Related: [[feedback-migration-constraints]], [[adr-log]], [[adr-rigor]].
