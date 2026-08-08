"""Validates every committed card file against the Pydantic Card model.

Both write paths into the catalog already validate: `drafts add` and
`drafts promote` run Card(**raw), and `seed_catalog` does the same before it
upserts. That made the catalog look schema-checked from every angle. It wasn't
checked by CI, though, because the only path CI exercises skips validation
entirely: tests/backend/conftest.py calls upsert_card() directly on every file,
and upsert_card reads raw dict keys without going through the model.

So a green build has never meant the catalog parses. It does today, all of it,
but nothing said so. This says so.

Asserting against the model directly rather than reworking the fixture is
deliberate: the invariant is "every committed card file is a valid Card", which
is true independently of how any fixture happens to seed the database.
"""

import json
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from backend.models import Card

CARDS_DIR = Path(__file__).parent.parent.parent / "backend" / "data" / "cards"


def card_files() -> list[Path]:
    files = sorted(p for p in CARDS_DIR.glob("*/*.json") if p.parent.name != "staging")
    assert files, f"no card files found under {CARDS_DIR} — the glob is wrong, not the catalog"
    return files


def ids(paths: list[Path]) -> list[str]:
    return [f"{p.parent.name}/{p.name}" for p in paths]


FILES = card_files()


@pytest.mark.parametrize("path", FILES, ids=ids(FILES))
def test_card_file_matches_the_model(path: Path) -> None:
    try:
        Card(**json.loads(path.read_text()))
    except ValidationError as exc:
        pytest.fail(f"{path.name} is not a valid Card:\n{exc}")


def unknown_keys(model: type[BaseModel], data: object, prefix: str = "") -> list[str]:
    """Keys present in the JSON that the model would silently drop.

    Card sets no model_config, so Pydantic's default extra='ignore' applies: a
    misspelled or renamed field doesn't fail validation, it just never reaches
    the database. That is the realistic way this catalog drifts, and the
    validation test above cannot see it, so it gets its own walk.
    """
    if not isinstance(data, dict):
        return []
    found = []
    for key, value in data.items():
        field = model.model_fields.get(key)
        if field is None:
            found.append(f"{prefix}{key}")
            continue
        args = getattr(field.annotation, "__args__", None) or [field.annotation]
        nested = [a for a in args if isinstance(a, type) and issubclass(a, BaseModel)]
        if not nested:
            continue
        if isinstance(value, dict):
            found += unknown_keys(nested[0], value, f"{prefix}{key}.")
        elif isinstance(value, list):
            for i, item in enumerate(value):
                found += unknown_keys(nested[0], item, f"{prefix}{key}[{i}].")
    return found


@pytest.mark.parametrize("path", FILES, ids=ids(FILES))
def test_card_file_carries_no_keys_the_model_ignores(path: Path) -> None:
    ignored = unknown_keys(Card, json.loads(path.read_text()))
    assert ignored == [], (
        f"{path.name} has keys the Card model silently drops: {ignored}. "
        "Either the field belongs in backend/models.py or the key is a typo — "
        "as written, whatever is in it never reaches the database."
    )


def test_the_unknown_key_walk_actually_detects_something() -> None:
    """Guards the test above from passing vacuously if the walk breaks."""
    sample = json.loads(FILES[0].read_text())
    assert unknown_keys(Card, {**sample, "definitely_not_a_field": 1}) == ["definitely_not_a_field"]
    assert unknown_keys(Card, {**sample, "credits": [{**sample["credits"][0], "nope": 1}]}) == [
        "credits[0].nope"
    ]
