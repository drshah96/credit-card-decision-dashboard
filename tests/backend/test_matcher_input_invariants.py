"""Catalog facts the Python ranking port relies on to stay equal to the TypeScript one."""

import json
import math
import re
import unicodedata
from pathlib import Path

from backend.mcp_server.ranking import _LIMITED_RATE, CATEGORY_KEYS, RateInput, _matches_category
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


# Bilt Housing Rewards earns on rent by a published sliding scale and is the only rent rate in
# the catalog, so its "Up to" ceiling doesn't let one card jump another's everyday rate.
_UP_TO_ALLOWED = re.compile(r"Bilt Housing Rewards")


def test_every_up_to_rate_is_kept_out_of_broad_rankings_or_explained():
    """An "Up to" rate is an advertised ceiling. Ranking on one is the bug an outside review found
    in dining, so a new one fails here until LIMITED_RATE covers it or it is allowed above."""
    checked = 0
    for card_id, rate in _rates():
        if not rate["multiplier"].lower().startswith("up to"):
            continue
        checked += 1
        allowed = _UP_TO_ALLOWED.search(rate["category"])
        limited = _LIMITED_RATE.search(rate["category"])
        assert allowed or limited, (card_id, rate)
        if limited:
            for key in CATEGORY_KEYS:
                assert not _matches_category(
                    RateInput(rate["category"], rate["multiplier"], False), key
                ), (card_id, key)
    assert checked >= 6, "the catalog's known Up to rates are missing, so this proves nothing"


_WEBSITE = re.compile(r"\b[a-z0-9-]+\.com\b", re.IGNORECASE)
_EVERYDAY = ("dining", "groceries", "gas-ev", "streaming")


def test_a_website_only_rate_never_ranks_in_an_everyday_category():
    """A rate earned on one website isn't a dining, grocery, gas or streaming rate, so naming one
    in those categories means LIMITED_RATE has to cover it."""
    named = 0
    for card_id, rate in _rates():
        if not _WEBSITE.search(rate["category"]):
            continue
        named += 1
        for key in _EVERYDAY:
            assert not _matches_category(
                RateInput(rate["category"], rate["multiplier"], False), key
            ), (card_id, key, rate["category"])
    assert named >= 5, "the catalog's known website rates are missing, so this proves nothing"
