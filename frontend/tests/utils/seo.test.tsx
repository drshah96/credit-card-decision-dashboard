import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useSeo, pageTitle, SITE_URL } from "@/utils/seo";
import { canonicalUrl } from "@/utils/routeMeta.js";

function head(selector: string, attr = "content") {
  return document.head.querySelector(selector)?.getAttribute(attr) ?? null;
}

describe("useSeo", () => {
  beforeEach(() => {
    document.head.querySelectorAll("meta, link[rel=canonical]").forEach((el) => el.remove());
    document.title = "";
  });

  it("sets title, description and canonical for a route", () => {
    renderHook(() =>
      useSeo({ title: "Sapphire Reserve — Chase", description: "A card.", path: "/cards/csr" }),
    );

    expect(document.title).toBe("Sapphire Reserve — Chase");
    expect(head('meta[name="description"]')).toBe("A card.");
    expect(head('link[rel="canonical"]', "href")).toBe(`${SITE_URL}/cards/csr`);
  });

  it("mirrors title and description into the social tags", () => {
    renderHook(() => useSeo({ title: "T", description: "D", path: "/x" }));

    expect(head('meta[property="og:title"]')).toBe("T");
    expect(head('meta[name="twitter:title"]')).toBe("T");
    expect(head('meta[property="og:description"]')).toBe("D");
    expect(head('meta[name="twitter:description"]')).toBe("D");
    expect(head('meta[property="og:url"]')).toBe(`${SITE_URL}/x`);
  });

  it("updates tags in place rather than appending duplicates", () => {
    const { rerender } = renderHook((props: Parameters<typeof useSeo>[0]) => useSeo(props), {
      initialProps: { title: "First", description: "One", path: "/a" },
    });
    rerender({ title: "Second", description: "Two", path: "/b" });

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll("link[rel=canonical]")).toHaveLength(1);
    expect(head('meta[name="description"]')).toBe("Two");
    expect(head('link[rel="canonical"]', "href")).toBe(`${SITE_URL}/b`);
  });

  it("leaves tags untouched while a page is still loading its data", () => {
    renderHook(() => useSeo({ title: "Loaded", description: "Real", path: "/a" }));
    // A second page mounts before its query resolves — undefined must not
    // blank out what's already there
    renderHook(() => useSeo({ title: undefined, description: undefined, path: undefined }));

    expect(document.title).toBe("Loaded");
    expect(head('meta[name="description"]')).toBe("Real");
  });

  it("pageTitle suffixes the site name", () => {
    expect(pageTitle("Compare Cards")).toBe("Compare Cards | The Wallet Audit");
  });
});

// ─── robots / noindex ─────────────────────────────────────────────────────────
// Unknown card ids, unknown issuer slugs and unmatched paths all serve the SPA
// shell with HTTP 200, so search engines see a live page. The shell carries no
// canonical, which is what put them in Search Console as "duplicate without
// user-selected canonical". noindex is the client-side fix; these pin it.

describe("useSeo noindex", () => {
  beforeEach(() => {
    document.head.querySelectorAll("meta, link[rel=canonical]").forEach((el) => el.remove());
    document.title = "";
  });

  it("adds a robots noindex tag when asked", () => {
    renderHook(() => useSeo({ title: "Page not found", noindex: true }));
    expect(head('meta[name="robots"]')).toBe("noindex");
  });

  it("ships no robots tag on an ordinary route", () => {
    renderHook(() => useSeo({ title: "A card", path: "/cards/csr" }));
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  // The failure this guards is the expensive one. Every other field in useSeo
  // is skipped when undefined so a loading page doesn't blank the previous
  // route's tags. If robots followed that rule, navigating from a 404 to a real
  // card would carry the noindex along and deindex a page that should rank.
  it("removes a stale noindex when the next route doesn't want one", () => {
    const { rerender } = renderHook((props: { noindex?: boolean }) => useSeo(props), {
      initialProps: { noindex: true } as { noindex?: boolean },
    });
    expect(head('meta[name="robots"]')).toBe("noindex");

    rerender({ noindex: false });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();

    rerender({});
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("is idempotent rather than appending a second tag", () => {
    const { rerender } = renderHook((props: { noindex?: boolean }) => useSeo(props), {
      initialProps: { noindex: true } as { noindex?: boolean },
    });
    rerender({ noindex: true });
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
  });
});

// setRobots removes any robots tag it finds, which is only safe while nothing
// else ships one. If that changes, this fails instead of the tag being silently
// deleted at runtime.
describe("the robots tag has exactly one writer", () => {
  it("index.html ships no robots tag", () => {
    const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf-8");
    expect(html).not.toMatch(/name=["']robots["']/);
  });

  it("the prerender pass adds no robots tag", () => {
    const script = readFileSync(join(__dirname, "..", "..", "scripts", "prerender.mjs"), "utf-8");
    expect(script).not.toMatch(/name=["']robots["']/);
  });
});

// Published URLs carry no trailing slash, and every place that publishes one
// goes through the same helper, so the runtime tag, the prerendered tag and the
// sitemap cannot disagree about a single URL.
//
// This briefly published the trailing-slash form. That existed only to support
// redirecting /cards/:id to /cards/:id/, so canonical would not point at a URL
// that 301s elsewhere. The redirect looped on unknown ids and was reverted,
// leaving canonical pointing somewhere the app's own links never went: internal
// links said one form, canonical said the other, and both served 200 with
// identical content on all 122 pages.
describe("canonical URLs match the form the app links to", () => {
  it("adds no trailing slash to a route", () => {
    for (const path of ["/cards/x", "/issuer/chase", "/compare", "/top-picks", "/methodology"]) {
      expect(canonicalUrl(path)).toBe(`${SITE_URL}${path}`);
      expect(canonicalUrl(path).endsWith("/")).toBe(false);
    }
  });

  it("still publishes the root as a single slash", () => {
    expect(canonicalUrl("/")).toBe(`${SITE_URL}/`);
  });

  it("matches the form the app's own internal links use", () => {
    // A canonical the site never links to is a canonical Google has to be
    // told about twice. CardDetailPage, TopPickPage, IssuerCardsPage and
    // ComparePage all link to `/cards/${id}`.
    const page = readFileSync(
      join(__dirname, "..", "..", "src", "pages", "IssuerCardsPage.tsx"),
      "utf-8",
    );
    expect(page).toContain("to={`/cards/${card.id}`}");
    expect(canonicalUrl("/cards/amex-platinum")).toBe(`${SITE_URL}/cards/amex-platinum`);
  });

  it("matches what the prerendered pages and the sitemap publish", () => {
    const sitemap = readFileSync(join(__dirname, "..", "..", "public", "sitemap.xml"), "utf-8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(100);
    // Only the root ends in a slash.
    expect(locs.filter((l) => l.endsWith("/"))).toEqual([`${SITE_URL}/`]);
    expect(locs).toContain(canonicalUrl("/cards/amex-platinum"));
  });
});
