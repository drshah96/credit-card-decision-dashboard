"""Structural checks on render.yaml's routing rules.

The rules exist because Render serves a directory's index.html only for a path
that ends in a slash, and the URLs we publish do not. Something has to bridge
that, and how it bridges it is the whole point of this file.

It used to be a rewrite: `/cards/:id` onto `/cards/:id/index.html`. That also
matched ids with no file behind them, and Render answers a rewrite onto a
missing file with HTTP 200 and an empty body — not a 404, and not a
fall-through to the next rule. A stale or mistyped card link rendered a blank
white page, and the app, which handles the case correctly, was never served the
shell it needed to run.

A redirect has no such failure mode: `/cards/nope` redirects to `/cards/nope/`,
which matches no file and reaches the catch-all, which serves the app.

So the invariant these tests defend is narrow and specific: **the catch-all is
the only rewrite.** Every other rule is a redirect. A rewrite anywhere else is
a rewrite that can point at a file that does not exist, which is the bug.
"""

import pathlib

import yaml

RENDER_YAML = pathlib.Path(__file__).resolve().parents[2] / "render.yaml"


def _static_service() -> dict:
    config = yaml.safe_load(RENDER_YAML.read_text())
    services = [s for s in config["services"] if s.get("runtime") == "static"]
    assert len(services) == 1, "expected exactly one static site service"
    return services[0]


ROUTES: list[dict] = _static_service()["routes"]


def test_render_yaml_is_valid_yaml() -> None:
    """The floor. Everything below reads parsed YAML, so if this fails the
    rest are meaningless rather than passing."""
    assert _static_service()["staticPublishPath"] == "frontend/dist"


def test_every_route_is_well_formed() -> None:
    assert ROUTES, "no routes declared at all"
    for route in ROUTES:
        assert set(route) == {"type", "source", "destination"}, route
        assert route["type"] in {"redirect", "rewrite"}, route
        assert route["source"].startswith("/"), route
        assert route["destination"].startswith("/"), route


def test_the_catch_all_is_the_only_rewrite() -> None:
    """The invariant this whole file exists for.

    Any other rewrite can name a file that does not exist, and Render answers
    that with 200 and an empty body rather than a 404 — a blank page, served
    silently, with the app never loading to say otherwise.
    """
    rewrites = [r for r in ROUTES if r["type"] == "rewrite"]
    assert len(rewrites) == 1, f"expected only the catch-all to be a rewrite, got {rewrites}"
    assert rewrites[0]["source"] == "/*"
    assert rewrites[0]["destination"] == "/index.html"


def test_the_catch_all_is_last() -> None:
    """Render evaluates top down. A catch-all above the redirects would shadow
    every one of them, taking all 109 card pages down at once."""
    assert ROUTES[-1]["source"] == "/*"
    assert [r["source"] for r in ROUTES].count("/*") == 1


def test_every_redirect_points_at_its_own_slash_form() -> None:
    """`/cards/:id` -> `/cards/:id/` and nothing more creative. The destination
    is the same path Render serves natively, so the redirect lands on a real
    file for a real card and on nothing for an unknown one."""
    for route in ROUTES:
        if route["type"] == "rewrite":
            continue
        assert route["destination"] == f"{route['source']}/", route


def test_no_redirect_targets_a_file() -> None:
    """A redirect to `…/index.html` would put that suffix in the address bar
    and in every shared link, and canonical would disagree with it."""
    assert [r for r in ROUTES if r["destination"].endswith(".html") and r["source"] != "/*"] == []


def test_no_source_is_declared_twice() -> None:
    sources = [r["source"] for r in ROUTES]
    assert sorted(s for s in set(sources) if sources.count(s) > 1) == []


def test_the_dynamic_shapes_are_routed() -> None:
    """Cards and issuers are the two parameterised shapes the site publishes,
    and they are the two that carry unknown-id risk. frontend's
    routeMeta.test.ts checks the full route list against these patterns; this
    only pins that neither shape lost its rule outright."""
    sources = {r["source"] for r in ROUTES}
    assert "/cards/:id" in sources
    assert "/issuer/:slug" in sources
