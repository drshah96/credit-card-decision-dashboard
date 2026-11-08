"""Catalog facts the Python ranking port relies on to stay equal to the TypeScript one."""

import json
import math
import unicodedata
from pathlib import Path

from backend.mcp_server.ranking import CATEGORY_KEYS, RateInput, _matches_category
from backend.mcp_server.ranking import parse_multiplier_value as parse

CARDS_DIR = Path(__file__).parent.parent.parent / "backend" / "data" / "cards"


def _cards() -> list[dict]:
    paths = CARDS_DIR.glob("**/*.json")
    return [json.loads(p.read_text()) for p in paths if "staging" not in p.parts]


def _rates():
    for card in _cards():
        for rate in card["earn_rates"]:
            yield card["id"], rate


def test_no_non_ascii_letters_or_whitespace_reach_the_regexes():
    # JS and Python regex engines treat these differently, so none may appear.
    for card_id, rate in _rates():
        for text in (rate["category"], rate["multiplier"]):
            for char in text:
                if ord(char) < 128:
                    continue
                kind = unicodedata.category(char)
                assert not kind.startswith("L"), f"{card_id}: letter {char!r} in {text!r}"
                assert not kind.startswith("Z"), f"{card_id}: space {char!r} in {text!r}"
                # JS \s also matches U+FEFF, the one such character outside category Z.
                assert char != "﻿", f"{card_id}: U+FEFF in {text!r}"


def test_every_rankable_multiplier_parses_to_a_finite_number():
    for card_id, rate in _rates():
        rate_input = RateInput(rate["category"], rate["multiplier"], rate.get("is_base", False))
        if any(_matches_category(rate_input, key) for key in CATEGORY_KEYS):
            assert math.isfinite(parse(rate["multiplier"])), f"{card_id}: {rate['multiplier']!r}"


def test_card_names_are_unique_so_input_order_cannot_affect_ranking():
    names = [card["name"] for card in _cards()]
    assert len(names) == len(set(names))
