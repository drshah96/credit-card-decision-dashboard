"""Tests for GET /robots.txt on the API host.

`api.thewalletaudit.com` is a separate origin from the site, so the frontend's
robots.txt has never applied to it. Before this endpoint existed the only
robots.txt answering there came from Cloudflare's content-signals feature and
contained no directives at all, which tells a crawler nothing.

The reason it matters is the split the prerendered pages implement: they
publish the issuer's facts and withhold the analysis, and this API serves that
analysis as clean JSON. Whatever the front door withholds, the side door hands
over in a format a crawler prefers.

None of this is a security control and these tests do not treat it as one. The
repository is public and a client that ignores robots.txt is unaffected. What
is being pinned is that the host makes the standard, honest request.
"""

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_robots_txt_is_served_as_plain_text() -> None:
    response = client.get("/robots.txt")
    assert response.status_code == 200
    # A crawler that receives application/json here may ignore the body.
    assert response.headers["content-type"].startswith("text/plain")


def test_robots_txt_disallows_every_crawler() -> None:
    """The two directives that carry the whole meaning. Asserted separately
    from the parse test below because a file that parses cleanly but allows
    everything would be worse than no file: it looks deliberate."""
    body = client.get("/robots.txt").text
    assert "User-agent: *" in body
    assert "Disallow: /" in body
    assert "Allow: /" not in body


def test_robots_txt_has_no_directive_other_than_the_disallow() -> None:
    """Guards against a future edit adding a carve-out that quietly reopens
    the host. Comments and the sitemap line are fine; another rule is not."""
    lines = [
        line.strip()
        for line in client.get("/robots.txt").text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    assert lines == [
        "User-agent: *",
        "Disallow: /",
        "Sitemap: https://thewalletaudit.com/sitemap.xml",
    ]


def test_robots_txt_points_at_the_site_rather_than_only_refusing() -> None:
    """The point is to redirect a crawler to where the readable content is,
    not merely to shut the door. A bare Disallow would be a dead end.

    Checked in the comments specifically, not anywhere in the file: the
    Sitemap directive also carries the domain, so a whole-body search passes
    even with the explanation deleted. That is what the first version of this
    test did, and removing the explanation left it green.
    """
    comments = [
        line for line in client.get("/robots.txt").text.splitlines() if line.startswith("#")
    ]
    assert any("https://thewalletaudit.com" in line for line in comments)


def test_robots_txt_is_not_in_the_openapi_schema() -> None:
    """It is not part of the API surface, and listing it in /docs alongside
    the real endpoints would imply it is."""
    assert "/robots.txt" not in client.get("/openapi.json").json()["paths"]


def test_the_analysis_this_protects_really_is_served_by_the_api() -> None:
    """The premise, pinned. If a future change stopped serving the withheld
    fields here, this file's reasoning would be stale rather than wrong, and
    a stale reason is how a rule survives past its purpose. This failing is a
    prompt to re-read the comment on ROBOTS_TXT, not necessarily to restore
    anything."""
    card = client.get("/api/cards/amex-platinum").json()
    assert card["verdict"]["text"]
    credits = card["credits"]
    assert any(c.get("tier") for c in credits)
    assert any("default_value" in c for c in credits)
