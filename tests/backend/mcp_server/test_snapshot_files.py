"""Which card files feed the verification hashes, wherever the repo happens to be checked out."""

import json
from pathlib import Path

from backend.mcp_server.snapshot import CARDS_DIR, _read_facts_digests


def _a_real_card() -> dict:
    live = (p for p in sorted(CARDS_DIR.glob("**/*.json")) if "staging" not in p.parts)
    return json.loads(next(live).read_text(encoding="utf-8"))


def test_the_real_catalog_is_read_in_full():
    live = [
        p for p in CARDS_DIR.glob("**/*.json") if "staging" not in p.relative_to(CARDS_DIR).parts
    ]
    assert live
    assert len(_read_facts_digests()) == len(live)


def test_a_parent_folder_named_staging_does_not_hide_the_catalog(tmp_path):
    card = _a_real_card()
    cards_dir = tmp_path / "staging" / "app" / "cards"
    (cards_dir / "staging").mkdir(parents=True)
    (cards_dir / "live.json").write_text(json.dumps(card), encoding="utf-8")
    (cards_dir / "staging" / "draft.json").write_text(
        json.dumps({**card, "id": "a-draft"}), encoding="utf-8"
    )
    assert set(_read_facts_digests(cards_dir)) == {card["id"]}


def test_card_files_are_read_as_utf8_whatever_the_locale(tmp_path, monkeypatch):
    (tmp_path / "live.json").write_text(json.dumps(_a_real_card()), encoding="utf-8")
    encodings = []
    original = Path.read_text

    def spy(self, *args, **kwargs):
        encodings.append(kwargs.get("encoding"))
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", spy)
    _read_facts_digests(tmp_path)
    assert encodings == ["utf-8"]
