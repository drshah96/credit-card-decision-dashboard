"""Pins the filename chain that card art depends on.

frontend/src/utils/cardImages.ts auto-discovers card art by globbing
assets/cards/ and using each filename minus its extension as the card id. That
makes three names one contract:

    backend/data/cards/{issuer}/{stem}.json
      -> the "id" inside that file
        -> frontend/src/assets/cards/{stem}.{ext}

Break any link and the card renders with no art. Nothing raises: the glob just
doesn't match, CARD_IMAGES has no entry, and the component falls back. An
extension outside the glob's list is invisible the same way, which is why the
list here is parsed out of cardImages.ts rather than copied — a second
hand-maintained copy of it would be one more thing to drift.

Orphaned art matters for a separate reason. frontend/src/assets/ holds issuer
logos and card images that NOTICE explicitly excludes from this repo's MIT
licence. An image for a card that no longer exists is a third-party trademark
sitting in a public repo serving no purpose.
"""

import json
import re
from pathlib import Path

REPO = Path(__file__).parent.parent.parent
CARDS_DIR = REPO / "backend" / "data" / "cards"
ART_DIR = REPO / "frontend" / "src" / "assets" / "cards"
CARD_IMAGES_TS = REPO / "frontend" / "src" / "utils" / "cardImages.ts"


def card_files() -> list[Path]:
    files = sorted(p for p in CARDS_DIR.glob("*/*.json") if p.parent.name != "staging")
    assert files, f"no card files found under {CARDS_DIR} — the glob is wrong, not the catalog"
    return files


def globbed_extensions() -> set[str]:
    """The extensions cardImages.ts will actually match, read from its source."""
    source = CARD_IMAGES_TS.read_text()
    match = re.search(r"assets/cards/\*\.\{([a-z0-9,]+)\}", source)
    assert match, (
        f"couldn't find the card-art glob in {CARD_IMAGES_TS.name}. If the pattern moved or "
        "changed shape, update this parser — don't hardcode the extension list here, it is "
        "exactly the sort of copy that goes stale silently."
    )
    return {f".{ext}" for ext in match.group(1).split(",")}


def art_files() -> list[Path]:
    return sorted(p for p in ART_DIR.iterdir() if p.is_file() and not p.name.startswith("."))


def test_every_card_file_is_named_after_the_id_inside_it() -> None:
    mismatched = {
        f"{p.parent.name}/{p.name}": json.loads(p.read_text())["id"]
        for p in card_files()
        if json.loads(p.read_text())["id"] != p.stem
    }
    assert mismatched == {}, (
        f"card files whose name doesn't match their id: {mismatched}. "
        "The filename is what card art is looked up by, so a mismatch drops the image silently."
    )


def test_every_card_has_art_the_glob_will_find() -> None:
    extensions = globbed_extensions()
    have_art = {p.stem for p in art_files() if p.suffix.lower() in extensions}
    missing = sorted({p.stem for p in card_files()} - have_art)
    assert missing == [], (
        f"cards with no art the glob can reach: {missing}. Either the image is absent, or its "
        f"name doesn't match the card id, or its extension is outside {sorted(extensions)}."
    )


def test_no_card_art_uses_an_extension_the_glob_ignores() -> None:
    extensions = globbed_extensions()
    ignored = sorted(p.name for p in art_files() if p.suffix.lower() not in extensions)
    assert ignored == [], (
        f"card art the glob will never match: {ignored}. Convert it, or add the extension to "
        f"the glob in {CARD_IMAGES_TS.name}."
    )


def test_no_orphaned_card_art() -> None:
    ids = {json.loads(p.read_text())["id"] for p in card_files()}
    orphaned = sorted({p.stem for p in art_files()} - ids)
    assert orphaned == [], (
        f"card art with no matching card: {orphaned}. These are third-party marks excluded from "
        "the MIT licence by NOTICE, so an unused one in a public repo serves no purpose — delete "
        "it, or restore the card it belongs to."
    )
