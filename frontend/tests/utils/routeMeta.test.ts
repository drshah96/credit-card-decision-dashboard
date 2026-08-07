import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  allRouteMeta,
  cardRouteMeta,
  CARDS_AUDITED,
  issuerRouteMeta,
  LAST_AUDITED,
  maxCreditValue,
  pageTitle,
  STATIC_ROUTE_META,
  SEO_ISSUERS,
  TERMS_AS_OF,
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
    expect(meta.title).toBe("Sapphire Reserve (Chase) | The Wallet Audit");
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

  // Titles and descriptions here are exactly what a shared link preview and a
  // search result display, so they're the most public copy on the site. Em and
  // en dashes are deliberately not used anywhere in that copy; this pins it,
  // because the previous card-title format ("Name — Issuer") put one in front
  // of every card link that got shared.
  it("uses no em or en dashes in any route title or description", () => {
    const routes = allRouteMeta([CARD]);
    const offenders = routes
      .flatMap((r) => [
        { field: `${r.path} title`, value: r.title },
        { field: `${r.path} description`, value: r.description },
      ])
      .filter((f) => /[—–]/.test(f.value));
    expect(offenders).toEqual([]);
  });

  it("index.html ships no em or en dashes in its shell metadata", () => {
    const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf-8");
    const metaLines = html
      .split("\n")
      .filter((l) => /<title>|<meta\s+(name|property)="(description|og:|twitter:)/.test(l));
    // Guard against the filter silently matching nothing and the assertion
    // below passing vacuously if index.html's tag formatting ever changes.
    expect(metaLines.length).toBeGreaterThanOrEqual(7);
    expect(metaLines.filter((l) => /[—–]/.test(l))).toEqual([]);
  });

  it("gives every route a distinct title, the whole point of the change", () => {
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

describe("TERMS_AS_OF", () => {
  // The footer's freshness claim went stale by hand once already ("July
  // 2026" in August). This alarm fails the build when the claim falls ~2
  // months behind, forcing either a data re-verification or a deliberate
  // bump — never silent drift. (issue #154)
  it("is no more than about two months behind today", () => {
    const parsed = new Date(`1 ${TERMS_AS_OF}`);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    const ageDays = (Date.now() - parsed.getTime()) / 86_400_000;
    expect(ageDays).toBeLessThan(75);
  });
});

describe("LAST_AUDITED / CARDS_AUDITED", () => {
  // The footer's audit-trail line names a date and a card count. Both are
  // hand-maintained, and a wrong count is worse than no count: it asserts
  // coverage the audit never had. These lock both to reality the same way
  // TERMS_AS_OF is locked to the clock.
  const cardsDir = join(__dirname, "..", "..", "..", "backend", "data", "cards");

  const countCardFiles = () =>
    readdirSync(cardsDir, { withFileTypes: true })
      .filter((issuer) => issuer.isDirectory() && issuer.name !== "staging")
      .reduce(
        (total, issuer) =>
          total +
          readdirSync(join(cardsDir, issuer.name)).filter((f) => f.endsWith(".json")).length,
        0,
      );

  it("counts every card in the catalogue", () => {
    expect(CARDS_AUDITED).toBe(countCardFiles());
  });

  it("is a parseable date that is not in the future", () => {
    const parsed = new Date(LAST_AUDITED);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    // Date-only strings parse as UTC midnight; allow a day of slack so a
    // late-in-the-day audit in a behind-UTC timezone doesn't read as future.
    expect(parsed.getTime() - Date.now()).toBeLessThan(86_400_000);
  });
});
