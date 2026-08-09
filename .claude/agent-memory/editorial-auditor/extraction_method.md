---
name: extraction-method
description: How to re-derive the prose field list from Card.model_fields and the per-field extraction floors a healthy audit run must hit
metadata:
  type: project
---

Re-derive the field list every run by walking `Card.model_fields` in
`backend/models.py` recursively for `str`-typed leaves. Do not take names from
`backend/README.md` (that is the storage ERD, a different shape).

**Why:** a wrong JSON path does not raise. It resolves to nothing, and a field
that comes back empty everywhere is indistinguishable from prose with nothing
wrong in it. Zero is a tooling failure, never a clean result.

**How to apply:** run the walk, then compare against the audit's listed set.
The 2026-08-08 walk found 63 str leaves; the listed prose set covered 23 of
them. Fields the model has that the brief's list omits, in rough prose order:
`welcome_bonus.bonus` / `.requirement` / `.estimated_value`,
`penalty_apr_trigger`, `points.per_100k`, `earn_rates[].category`,
`status_perks[].name`, `services[].name`, `additional_cards.options[].name`,
`transfer_partners.partners[].name`, `points.currency`. The welcome_bonus trio
is the real gap: it is free text quoted from issuer terms and is the most
likely place for reproduced marketing language.

**Floors as of 2026-08-08** (109 files, staging excluded, ~6,342 values). Any
run materially below these on a field means a broken path, not a quiet catalog:
109 each for verdict.text/short_tag, earn_note, protection_note, rental_note,
effective_cost, points.note, transfer_partners.highlight/recent_changes,
additional_cards.title/note, points.per_100k, points.currency; 592 each for
insurance[].coverage/detail; 348 services[].detail; 327
additional_cards.options[].benefits[].text; 228 credits[].tips[]; 201
points.redemption_options[].method; 170 timeline[].text; 150 each
credits[].name/subtitle/description; 108 partners[].notes; 79
status_perks[].note.

Known-positive control: chase-sapphire-reserve's
`transfer_partners.highlight` ("World of Hyatt is the crown jewel...") and
`transfer_partners.recent_changes` ("...the strongest of any bank."). If those
two do not surface, extraction is broken regardless of counts.

Card art is pinned by `tests/backend/test_catalog_files.py` (both directions
plus the extension glob, verified present 2026-08-08). Issuer logos under
`frontend/src/assets/logos/` are not covered by any test and stay a manual check.
