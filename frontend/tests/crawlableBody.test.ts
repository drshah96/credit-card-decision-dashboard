import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bodyForRoute, esc } from "../scripts/crawlableBody.mjs";
import { ISSUERS } from "@/utils/cardTaxonomy";

// The prerendered pages ship static body content so clients that never run
// JavaScript — most AI crawlers and LLM fetchers — can read what a page is
// about. Google runs JS and indexes the real page regardless, so this content
// exists for everyone else.
//
// What it contains is a deliberate split: issuer-sourced facts and a
// description of the method go in, the analysis itself stays out, and the
// reader is pointed at the site for it. That split is a policy, and a policy
// nothing checks is a policy that erodes one convenient exception at a time.
// These tests are the check.

const CARDS_DIR = join(__dirname, "..", "..", "backend", "data", "cards");

function cards() {
  const out: Record<string, unknown>[] = [];
  for (const dir of readdirSync(CARDS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === "staging") continue;
    for (const f of readdirSync(join(CARDS_DIR, dir.name))) {
      if (f.endsWith(".json")) out.push(JSON.parse(readFileSync(join(CARDS_DIR, dir.name, f), "utf-8")));
    }
  }
  return out;
}

const ALL = cards();
const render = (path: string) =>
  bodyForRoute({ path } as never, { cards: ALL, issuers: ISSUERS })?.body ?? "";

describe("the crawlable body withholds the analysis", () => {
  it("never emits a card's verdict", () => {
    const leaked = ALL.filter((c) => {
      const verdict = (c.verdict as { text?: string })?.text;
      return verdict && render(`/cards/${c.id}`).includes(verdict);
    }).map((c) => c.id);
    expect(leaked).toEqual([]);
  });

  it("never emits a credit's realistic value or its tier", () => {
    const leaked: string[] = [];
    for (const c of ALL) {
      const body = render(`/cards/${c.id}`);
      for (const credit of (c.credits ?? []) as Record<string, unknown>[]) {
        // The advertised ceiling is public and deliberately included; the
        // realistic estimate is the product. They differ on most credits, so
        // only compare where a leak would be unambiguous.
        const dv = credit.default_value as number;
        const max = credit.max_annual as number;
        if (dv && dv !== max && body.includes(`$${dv.toLocaleString("en-US")}`)) {
          leaked.push(`${c.id}: default_value ${dv}`);
        }
        if (credit.tier && body.includes(`"${credit.tier}"`)) leaked.push(`${c.id}: tier`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it("never emits editorial prose: notes or credit tips", () => {
    const leaked: string[] = [];
    for (const c of ALL) {
      const body = render(`/cards/${c.id}`);
      const prose = [
        (c.points as { note?: string })?.note,
        c.earn_note,
        c.protection_note,
        c.rental_note,
        ...((c.credits ?? []) as Record<string, unknown>[]).flatMap((x) => (x.tips ?? []) as string[]),
      ].filter((s): s is string => typeof s === "string" && s.length > 25);
      for (const p of prose) if (body.includes(p.slice(0, 25))) leaked.push(`${c.id}: ${p.slice(0, 40)}`);
    }
    expect(leaked).toEqual([]);
  });
});

describe("the crawlable body says enough to be worth crawling", () => {
  // Compared against the escaped name: three cards contain "&"
  // (Bass Pro Shops & Cabela's, AT&T Points Plus) and the body correctly emits
  // "&amp;". Asserting on the raw name failed for exactly those three, which
  // was the test being naive rather than the body being wrong.
  it("gives every card its name, issuer and fee", () => {
    const thin = ALL.filter((c) => {
      const b = render(`/cards/${c.id}`);
      return !b.includes(esc(c.name)) || !b.includes(esc(c.issuer)) || b.length < 200;
    }).map((c) => c.id);
    expect(thin).toEqual([]);
  });

  it("explains the method on every page type, since that is the pitch", () => {
    for (const path of ["/", "/methodology", "/compare", "/top-picks", "/cards/amex-platinum", "/issuer/chase"]) {
      expect(render(path)).toMatch(/actually captures rather than at their advertised ceiling/);
    }
  });

  it("points every page back at the site", () => {
    for (const path of ["/", "/methodology", "/compare", "/top-picks", "/cards/amex-platinum"]) {
      expect(render(path)).toContain("https://thewalletaudit.com");
    }
  });

  it("escapes card names rather than injecting raw HTML", () => {
    const body = bodyForRoute({ path: "/cards/x" } as never, {
      cards: [{ id: "x", name: '<script>alert(1)</script> & "quoted"', issuer: "Test", annual_fee: 0 }],
      issuers: ISSUERS,
    })?.body;
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script>alert");
  });

  it("returns nothing for a route it has no content for", () => {
    expect(bodyForRoute({ path: "/no-such-route" } as never, { cards: ALL, issuers: ISSUERS })).toBeNull();
  });
});
