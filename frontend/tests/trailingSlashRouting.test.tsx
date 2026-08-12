import { describe, it, expect } from "vitest";
import { matchPath } from "react-router-dom";

// The router must match a card path with or without a trailing slash.
//
// render.yaml rewrites rather than redirects today, so nothing sends a visitor
// to the slash form on purpose. This is pinned anyway because the slash form
// still arrives from outside: a shared link someone typed with one, a crawler
// normalising, a referrer that added it. And because the redirect approach was
// tried once and will be considered again (backlog #20) — if the router
// stopped matching, that attempt would fix a blank page for unknown ids by
// breaking all 109 real card pages instead, which is worse than the bug.
describe("the router matches a card path with or without a trailing slash", () => {
  it.each([
    ["/cards/:id", "/cards/amex-platinum/", "amex-platinum"],
    ["/issuer/:issuerSlug", "/issuer/chase/", "chase"],
  ])("matches %s against %s", (pattern, pathname, expected) => {
    const match = matchPath(pattern, pathname);
    expect(match).not.toBeNull();
    expect(Object.values(match!.params)[0]).toBe(expected);
  });

  it("still matches the form without the slash, for links already in the wild", () => {
    expect(matchPath("/cards/:id", "/cards/amex-platinum")).not.toBeNull();
  });

  it.each(["/compare/", "/top-picks/", "/methodology/", "/"])("matches the static route %s", (p) => {
    expect(matchPath(p.replace(/(.)\/$/, "$1"), p)).not.toBeNull();
  });

  it("does not treat a trailing slash as a card id of its own", () => {
    // "/cards/" must not match with an empty id and render a broken detail page.
    const match = matchPath("/cards/:id", "/cards/");
    expect(match).toBeNull();
  });
});
