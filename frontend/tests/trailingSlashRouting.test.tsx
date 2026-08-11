import { describe, it, expect } from "vitest";
import { matchPath } from "react-router-dom";

// render.yaml now redirects /cards/x to /cards/x/, so the trailing-slash form
// is what a visitor's browser actually holds after following a shared link.
// If React Router did not match it, the redirect would fix a blank page for
// unknown ids by breaking every real card page instead — a strictly worse
// trade. Pinned rather than assumed.
describe("the router matches the trailing-slash form the server redirects to", () => {
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
