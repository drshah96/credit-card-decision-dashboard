---
name: voice-conventions
description: The editorial register of backend/data/cards prose, plus boilerplate/sentinel phrases that look like findings but are deliberate
metadata:
  type: project
---

The catalog's register, inferred from ~6,300 prose values across 109 cards.

**What the voice does**
- Plain, specific, numeric. Prose leads with a dollar figure, a cap, or a date rather than an adjective.
- Unimpressed by marketing. It routinely undercuts the issuer's own framing ("Compare against face value; resale markups can erase the 'credit.'", "a rounding error by comparison", "the single biggest reason people underuse this card").
- Names its sources when a number is contested: "per Chase", "NerdWallet pegged it around 1.8¢ in 2026", "confirmed on Citi's official transfer page", "weren't published on Citi's public page at the time of writing".
- States absence plainly instead of hedging: "There is nothing here, and that is the honest answer rather than a gap in our research."
- No em-dashes (see the repo-level user preference). Uses commas and colons instead.

**Deliberate boilerplate — do NOT flag these**
- `chase-sapphire-reserve` `status_perks[].note`: "Explorist is the weakest of the four". Reviewed and kept 2026-08-10. The four are the four perks named in that same sentence (IHG Diamond, Hyatt Explorist, Southwest A-List, Shops at Chase), not the four-card catalog, so it is bounded by its own sentence and cannot decay. It survives a grep for "of the four" after the catalog-scoped instances were fixed. Flag it again only if the perk list in that sentence changes length without the phrase being updated.
- `transfer_partners.recent_changes` = `"Not applicable."` on all 71 cards with no transfer program. A sentinel, not thin prose.
- `insurance[]` empty *with* a protection_note that says so explicitly (7 cards: capital-one-platinum, capital-one-platinum-secured, citi-aadvantage-mileup, citi-aadvantage-platinum-select, citi-diamond-preferred, citi-secured, citi-simplicity). Prose and structure agree.
- A `removed: true` credit whose name carries "(Removed)" and whose description/tips say it is gone (amex-platinum Saks). This is the intended pattern, not a contradiction.
- Shared timeline blocks repeated verbatim across a family (BofA Preferred Rewards rename x5, Citi ThankYou sharing end x4, Discover/Capital One migration x6, Barclays AAdvantage exit x3). Intentional duplication; audit the sentence once, not per card.
- Word "Premier"/"Premium"/"Elite" inside a product name (United Premier, Strata Premier, Premier Collection) is not a superlative.

**Scope words that ARE load-bearing**
"here", "of the four", "of any bank", "of any card program" scope a claim to the catalog and go stale silently. "of the three" scoped to a named family (Southwest, United, Bilt tiers) is bounded and much safer.

See [[project_pre_compare_prose_cluster]] and [[extraction-method]].
