"""Bulk-seed (or resync) the card catalog straight from backend/data/cards/.

    uv run python -m backend.scripts.seed_catalog [--pattern GLOB]

Unlike `drafts.py`, this skips the review queue entirely — it's for the
JSON files already committed to this repo, which went through review as
part of their PR, not for introducing new unreviewed cards. Use it to set
up a fresh local database, or to resync an existing one after a data or
schema change (e.g. a new field added to every card's JSON).

Each file is validated against the same Pydantic Card schema the API
returns before it's written, so a malformed file fails loudly instead of
silently corrupting the catalog.

`staging/` is excluded. A file there is a draft awaiting human review, and
this script runs on every API boot (see render.yaml's startCommand), so
without the exclusion the act of writing a draft would publish it at the
next restart, with no promotion and no review. Everything else that walks
this tree already skips staging; this is the one that writes to the live
database, so it matters most here.
"""

import argparse
import glob
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from backend.db import session_scope
from backend.db_models import CardModel
from backend.models import Card
from backend.scripts.upsert import upsert_card

DEFAULT_PATTERN = "backend/data/cards/**/*.json"

# The directory name marking a card as drafted-but-not-promoted. Matched against
# every path segment rather than just the parent, so a nested draft is excluded
# too and a card whose own filename contains the word is not.
STAGING_DIR = "staging"


def is_staged(path: str) -> bool:
    return STAGING_DIR in Path(path).parts


def select_files(pattern: str) -> list[str]:
    """The files `seed_catalog` will actually upsert, for `pattern`.

    Selection is its own function so tests can assert on it directly. Asserting
    against a private glob expression instead is what allowed the staging gap to
    sit here unnoticed while every other consumer of this tree filtered it out.
    """
    matched = sorted(glob.glob(pattern, recursive=True))
    files = [p for p in matched if not is_staged(p)]
    if not files and matched:
        sys.exit(
            f"error: every file matching {pattern!r} is under {STAGING_DIR}/ — "
            "those are drafts awaiting human review and are never seeded"
        )
    return files


def seed_catalog(pattern: str, deactivate_missing: bool | None = None) -> int:
    """Upsert every JSON file matching `pattern`. Returns how many were seeded;
    exits the process on the first file that isn't a valid Card.

    deactivate_missing controls whether a previously-seeded card whose slug
    no longer appears in this run gets CardModel.is_active flipped to False
    (upsert_card always flips it back True the moment its file reappears).
    Defaults to on only when `pattern` is the full-catalog DEFAULT_PATTERN —
    a caller resyncing a narrower subset (a single issuer's files, a test
    fixture's tmp_path glob) almost certainly doesn't mean "everything else
    in the catalog just got discontinued," so it stays off unless the whole
    catalog is actually in view, or a caller opts in explicitly."""
    files = select_files(pattern)
    if not files:
        sys.exit(f"error: no files matched {pattern!r}")
    if deactivate_missing is None:
        deactivate_missing = pattern == DEFAULT_PATTERN

    with session_scope() as session:
        seen_slugs = set()
        for path in files:
            with open(path) as f:
                data = json.load(f)
            if not isinstance(data, dict):
                sys.exit(
                    f"error: {path} does not contain a JSON object (got {type(data).__name__})"
                )
            try:
                Card(**data)
            except ValidationError as exc:
                sys.exit(f"error: {path} does not match the Card schema:\n{exc}")
            upsert_card(session, data)
            seen_slugs.add(data["id"])

        if deactivate_missing:
            session.query(CardModel).filter(
                CardModel.is_active.is_(True), CardModel.slug.notin_(seen_slugs)
            ).update({"is_active": False}, synchronize_session=False)

    return len(files)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-seed the card catalog from JSON files")
    parser.add_argument(
        "--pattern",
        default=DEFAULT_PATTERN,
        help=f"glob of JSON files to seed (default: {DEFAULT_PATTERN})",
    )
    args = parser.parse_args()

    count = seed_catalog(args.pattern)
    print(f"seeded {count} cards from {args.pattern!r}")


if __name__ == "__main__":
    main()
