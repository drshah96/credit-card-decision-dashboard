"""Structural checks on render.yaml's routing rules.

frontend/tests/renderRoutes.test.ts already pins these rules against the route
list the prerender step builds. This file checks a different thing with a
different tool: that the committed file is valid YAML with the shape Render
expects, parsed by a real YAML parser rather than by the regexes that generated
it. A generator and a test that both read the file the same way agree with each
other whether or not either is right.

The rules are enumerated, one per real page, rather than written as
`/cards/:id`. A pattern also matches ids that are not cards, and Render answers
a rewrite onto a missing file with 200 and an empty body — not a 404, and not a
fall-through to the next rule. So an unknown card id served a blank page while
the app, which handles the case correctly, never got to run.
"""

import pathlib

import pytest
import yaml

RENDER_YAML = pathlib.Path(__file__).resolve().parents[2] / "render.yaml"
CARDS_DIR = pathlib.Path(__file__).resolve().parents[2] / "backend" / "data" / "cards"


@pytest.fixture(scope="module")
def static_service() -> dict:
    """The static site service block, found by role rather than by position."""
    config = yaml.safe_load(RENDER_YAML.read_text())
    services = [s for s in config["services"] if s.get("runtime") == "static"]
    assert len(services) == 1, "expected exactly one static site service"
    return services[0]


@pytest.fixture(scope="module")
def routes(static_service: dict) -> list[dict]:
    return static_service["routes"]


def test_render_yaml_is_valid_yaml(static_service: dict) -> None:
    """The generator splices text into this file. Valid YAML is the floor."""
    assert static_service["staticPublishPath"] == "frontend/dist"


def test_every_route_is_a_well_formed_rewrite(routes: list[dict]) -> None:
    assert len(routes) > 100
    for route in routes:
        assert set(route) == {"type", "source", "destination"}, route
        assert route["type"] == "rewrite", route
        assert route["source"].startswith("/"), route
        assert route["destination"].startswith("/"), route


def test_no_route_uses_a_parameter_pattern(routes: list[dict]) -> None:
    """`/cards/:id` is the bug. It matches ids with no file behind them."""
    assert [r["source"] for r in routes if ":" in r["source"]] == []


def test_the_catch_all_is_last_and_appears_once(routes: list[dict]) -> None:
    """Render matches top down, so a catch-all anywhere but last would shadow
    every rule after it — taking all 109 card pages down at once."""
    sources = [r["source"] for r in routes]
    assert sources.count("/*") == 1
    assert sources[-1] == "/*"
    assert routes[-1]["destination"] == "/index.html"


def test_no_source_is_declared_twice(routes: list[dict]) -> None:
    sources = [r["source"] for r in routes]
    assert sorted(s for s in set(sources) if sources.count(s) > 1) == []


def test_every_card_in_the_catalog_has_a_rule(routes: list[dict]) -> None:
    """The catalog is the source of truth, read here straight off disk rather
    than through the generator that wrote these rules."""
    ids = sorted(
        p.stem
        for p in CARDS_DIR.glob("*/*.json")
        if p.parent.name != "staging"  # drafts are not published
    )
    assert len(ids) > 100
    sources = {r["source"] for r in routes}
    assert [i for i in ids if f"/cards/{i}" not in sources] == []


def test_no_staged_draft_leaked_into_the_rules(routes: list[dict]) -> None:
    """A draft with a rule would be a page Render serves before anyone
    approved it — the same class of gap as seeding drafts into the catalog.

    Skipped rather than silently passing when staging is empty, which it
    usually is: iterating an empty list and asserting nothing was found looks
    identical to a real check that found nothing. The exclusion is exercised
    for real, against a written draft, in frontend/tests/renderRoutes.test.ts.
    """
    staged = sorted(p.stem for p in (CARDS_DIR / "staging").glob("*.json"))
    if not staged:
        pytest.skip("no drafts in staging; see renderRoutes.test.ts for the live check")
    sources = {r["source"] for r in routes}
    assert [s for s in staged if f"/cards/{s}" in sources] == []


def test_each_rule_points_at_its_own_directory_index(routes: list[dict]) -> None:
    """Render serves a directory's index.html only for paths ending in a
    slash, and none of ours do — mapping each path onto its own index.html is
    the whole reason these rules exist."""
    for route in routes:
        if route["source"] == "/*":
            continue
        assert route["destination"] == f"{route['source']}/index.html", route
