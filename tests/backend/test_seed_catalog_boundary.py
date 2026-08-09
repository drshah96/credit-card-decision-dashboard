"""Pins who gets seeded into the live catalog, and who validates it.

Two failures, one cause: several places walk `backend/data/cards/` with their
own glob and their own staging filter, and nothing made them agree.

1. `seed_catalog` had no staging exclusion at all. It runs on every API boot
   (render.yaml chains it before uvicorn), so a draft written to
   `backend/data/cards/staging/` would have been upserted into the live catalog
   at the next restart, with no promotion and no review. `conftest.py`, the
   catalog tests and three frontend tests all honoured the boundary. The one
   consumer that writes to the live database did not.

2. The catalog tests globbed `*/*.json` (one directory level) while
   `seed_catalog` globs `**/*.json` (recursive). Same result for today's flat
   layout, but a card nested any deeper would be seeded into production with CI
   never validating it, and `seed_catalog` exits on the first invalid file, so
   "loaded but never validated" is a failure to boot.

Everything here calls `seed_catalog.select_files` rather than rebuilding the
glob, so a regression inside that function fails these tests. An earlier draft
of this file reimplemented the filter and passed happily against a mutated
seeder, which is the same vacuous-pass shape the catalog tests guard against.
"""

import json
from pathlib import Path

import pytest

from backend.scripts import seed_catalog as sc
from tests.backend.test_catalog_schema import card_files

REPO = Path(__file__).parent.parent.parent


def seeded_files() -> list[Path]:
    return [Path(p) for p in sc.select_files(str(REPO / sc.DEFAULT_PATTERN))]


def test_ci_validates_exactly_what_seed_catalog_seeds() -> None:
    validated = {p.resolve() for p in card_files()}
    seeded = {p.resolve() for p in seeded_files()}

    unvalidated = sorted(str(p.relative_to(REPO)) for p in seeded - validated)
    assert unvalidated == [], (
        f"seed_catalog would load these into production but CI never validates them: "
        f"{unvalidated}. seed_catalog exits on the first invalid file and runs before "
        "uvicorn, so an unvalidated card file is a failure to boot."
    )

    unseeded = sorted(str(p.relative_to(REPO)) for p in validated - seeded)
    assert unseeded == [], (
        f"CI validates these but seed_catalog would never load them: {unseeded}. "
        "Harmless, but the tests are then guarding something production ignores."
    )


def test_the_two_sets_are_not_both_empty() -> None:
    """Guards the test above from passing because both sides found nothing."""
    assert len(seeded_files()) >= 100
    assert len(card_files()) >= 100


def test_is_staged_matches_any_depth_not_just_the_parent() -> None:
    assert sc.is_staged("backend/data/cards/staging/draft.json")
    assert sc.is_staged("backend/data/cards/staging/nested/draft.json")
    assert not sc.is_staged("backend/data/cards/chase/chase-sapphire-reserve.json")
    # A card whose own filename contains the word must still be seeded.
    assert not sc.is_staged("backend/data/cards/chase/staging-area-card.json")


def _tree(tmp_path: Path, *, live: bool = True, draft: bool = True) -> str:
    cards = tmp_path / "cards"
    if live:
        (cards / "chase").mkdir(parents=True, exist_ok=True)
        (cards / "chase" / "live.json").write_text(json.dumps({"id": "live"}))
    if draft:
        (cards / "staging").mkdir(parents=True, exist_ok=True)
        (cards / "staging" / "draft.json").write_text(json.dumps({"id": "draft"}))
    return str(cards / "**" / "*.json")


def test_a_draft_in_staging_is_never_selected(tmp_path: Path) -> None:
    selected = [Path(p).name for p in sc.select_files(_tree(tmp_path))]
    assert selected == ["live.json"], (
        f"expected only the live card, got {selected} — a file in staging/ reached "
        "the seeder, so writing a draft would publish it on the next API boot"
    )


def test_a_nested_draft_is_never_selected(tmp_path: Path) -> None:
    pattern = _tree(tmp_path)
    nested = tmp_path / "cards" / "staging" / "nested"
    nested.mkdir(parents=True)
    (nested / "deep.json").write_text(json.dumps({"id": "deep"}))

    assert [Path(p).name for p in sc.select_files(pattern)] == ["live.json"]


def test_a_pattern_matching_only_drafts_is_an_error_not_an_empty_success(
    tmp_path: Path,
) -> None:
    """Filtering to nothing must fail loudly rather than report "seeded 0".

    Same rule the auditors follow: a zero result that could mean either "nothing
    to do" or "everything was excluded" is not a pass. Asserted on the staging
    wording specifically, because a bare SystemExit here would also be raised by
    schema validation on the draft and the test would pass for the wrong reason.
    """
    pattern = _tree(tmp_path, live=False)
    with pytest.raises(SystemExit) as exc:
        sc.select_files(pattern)
    assert "drafts awaiting human review" in str(exc.value)


def test_an_empty_tree_still_reports_no_matches(tmp_path: Path) -> None:
    (tmp_path / "cards").mkdir()
    assert sc.select_files(str(tmp_path / "cards" / "**" / "*.json")) == []
