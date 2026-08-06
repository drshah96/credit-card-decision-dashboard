import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allRouteMeta,
  cardRouteMeta,
  issuerRouteMeta,
  maxCreditValue,
  pageTitle,
  STATIC_ROUTE_META,
  SEO_ISSUERS,
} from "@/utils/routeMeta.js";

const CARD = {
  id: "chase-sapphire-reserve",
  name: "Sapphire Reserve",
  issuer: "Chase",
  annual_fee: 795,
  credits: [
    { max_annual: 300, removed: false },
    { max_annual: 500, removed: false },
    { max_annual: 100, removed: true }, // discontinued, must not count
  ],
};

describe("routeMeta", () => {
  it("builds a card route from the card's own data", () => {
    const meta = cardRouteMeta(CARD);
    expect(meta.path).toBe("/cards/chase-sapphire-reserve");
    expect(meta.title).toBe("Sapphire Reserve — Chase | The Wallet Audit");
    expect(meta.description).toContain("$795 annual fee");
    expect(meta.description).toContain("$800 in statement credits");
  });

  it("ignores discontinued credits in the advertised total", () => {
    expect(maxCreditValue(CARD)).toBe(800);
  });

  it("builds an issuer route", () => {
    const meta = issuerRouteMeta("amex", "American Express");
    expect(meta.path).toBe("/issuer/amex");
    expect(meta.title).toBe("American Express Credit Cards | The Wallet Audit");
  });

  it("gives every route a distinct title — the whole point of the change", () => {
    const routes = allRouteMeta([CARD, { ...CARD, id: "other", name: "Other Card" }]);
    const titles = routes.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("covers static routes, every issuer, and every card", () => {
    const routes = allRouteMeta([CARD]);
    expect(routes).toHaveLength(STATIC_ROUTE_META.length + SEO_ISSUERS.length + 1);
  });

  it("pageTitle suffixes the site name", () => {
    expect(pageTitle("Compare Cards")).toBe("Compare Cards | The Wallet Audit");
  });

  // The prerender script rewrites these exact tags in the built shell. If
  // index.html stops shipping one, prerendered pages would silently keep the
  // generic value, so pin the contract here as well as in the script.
  it("index.html still ships every tag the prerender pass rewrites", () => {
    const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf-8");
    for (const pattern of [
      /<title>[\s\S]*?<\/title>/,
      /<meta\s+name="description"[\s\S]*?\/>/,
      /<meta\s+property="og:url"[^>]*\/>/,
      /<meta\s+property="og:title"[^>]*\/>/,
      /<meta\s+property="og:description"[\s\S]*?\/>/,
      /<meta\s+name="twitter:title"[^>]*\/>/,
      /<meta\s+name="twitter:description"[\s\S]*?\/>/,
    ]) {
      expect(html).toMatch(pattern);
    }
  });
});
