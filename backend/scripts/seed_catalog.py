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
"""

import argparse
import glob
import json
import sys

from pydantic import ValidationError

from backend.db import session_scope
from backend.models import Card
from backend.scripts.upsert import upsert_card

DEFAULT_PATTERN = "backend/data/cards/**/*.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-seed the card catalog from JSON files")
    parser.add_argument(
        "--pattern",
        default=DEFAULT_PATTERN,
        help=f"glob of JSON files to seed (default: {DEFAULT_PATTERN})",
    )
    args = parser.parse_args()

    files = sorted(glob.glob(args.pattern, recursive=True))
    if not files:
        sys.exit(f"error: no files matched {args.pattern!r}")

    with session_scope() as session:
        for path in files:
            with open(path) as f:
                data = json.load(f)
            try:
                Card(**data)
            except ValidationError as exc:
                sys.exit(f"error: {path} does not match the Card schema:\n{exc}")
            upsert_card(session, data)

    print(f"seeded {len(files)} cards from {args.pattern!r}")


if __name__ == "__main__":
    main()
