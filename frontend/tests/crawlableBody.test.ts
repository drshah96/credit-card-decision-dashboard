import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bodyForRoute, esc, escAttr, jsonForScript } from "../scripts/crawlableBody.mjs";
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
      const credits = ((c.credits ?? []) as Record<string, unknown>[]).filter((x) => !x.removed);
      // Every dollar figure the body is allowed to print: the annual fee, each
      // credit's advertised ceiling, and their total. A default_value equal to
      // one of these cannot be told apart from the published figure, so seeing
      // it proves nothing either way.
      const publishable = new Set<number>([
        (c.annual_fee as number) ?? 0,
        ...credits.map((x) => (x.max_annual as number) ?? 0),
        credits.reduce((sum, x) => sum + (((x.max_annual as number) ?? 0)), 0),
      ]);
      for (const credit of credits) {
        // `dv != null`, not `dv &&`. 149 of the catalog's 150 default_value
        // entries are exactly 0, which is falsy, so the truthy guard this
        // replaces exempted 99% of the data: the test covered one credit.
        const dv = credit.default_value as number | null | undefined;
        if (dv != null && !publishable.has(dv) && body.includes(`$${dv.toLocaleString("en-US")}`)) {
          leaked.push(`${c.id}: default_value ${dv}`);
        }
        // Labelled forms only. Tier values are short words — one is "plan",
        // which is a substring of the earn-rate line "5x Phone plans" — so a
        // bare substring search reports the catalog's own prose as a leak. A
        // real leak would carry a label; the structural test below is what
        // actually guarantees the field is never read.
        if (credit.tier) {
          const tier = String(credit.tier);
          if (new RegExp(`(tier|Tier)["'\\s:=]{1,4}"?${tier}\\b`).test(body)) leaked.push(`${c.id}: tier`);
        }
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

// Value-comparison tests can only catch a leak when the leaked value is
// distinguishable from something deliberately published. For default_value it
// usually is not: 149 of 150 entries are 0. So assert on the source instead —
// the generator must not read the withheld fields at all. That holds whatever
// the data happens to contain.
describe("the generator never reads the withheld fields", () => {
  // The whole module, not a slice between two function names. A slice looks
  // tighter and is worse in three ways: `String.slice(start, end)` with
  // start > end returns "", and `expect("").not.toMatch(x)` passes for every
  // pattern, so reordering the two functions would turn this entire block into
  // a silent no-op; a helper defined above the start anchor escapes it; and a
  // name like `cardBodyPreamble` moves a boundary. Scanning everything has no
  // boundary to get wrong.
  //
  // Comments are stripped because the header comment names the withheld fields
  // on purpose, in the course of explaining that they are withheld.
  const raw = readFileSync(join(__dirname, "..", "scripts", "crawlableBody.mjs"), "utf-8");
  const body = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Positive controls. Without these, an over-eager stripper or a moved file
  // would leave `body` empty or tiny and every assertion below would pass
  // while checking nothing — the exact failure this rewrite exists to remove.
  it("is actually scanning the generator's code", () => {
    expect(body.length).toBeGreaterThan(2000);
    for (const marker of ["max_annual", "annual_fee", "foreign_transaction_fee_rate", "escAttr"]) {
      expect(body).toContain(marker);
    }
  });

  // Field *access*, not the word. The visit line says "The verdict ... is on
  // the card's page", which is the one place the word belongs.
  it.each([
    ["verdict", /\.verdict\b/],
    ["default_value", /default_value/],
    ["tier", /\.tier\b/],
    ["best_cpp", /best_cpp/],
    ["points.note", /\.points\b/],
    ["earn_note", /earn_note/],
    ["protection_note", /protection_note/],
    ["rental_note", /rental_note/],
    ["credit tips", /\.tips\b/],
  ])("cardBody does not read %s", (_label, pattern) => {
    expect(body).not.toMatch(pattern);
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
      return (
        !b.includes(esc(c.name)) ||
        !b.includes(esc(c.issuer)) ||
        // A dollar sign with digits after it. `annual fee $` for the 60-odd
        // no-fee cards would otherwise read as complete.
        !new RegExp(`annual fee \\$${(c.annual_fee as number).toLocaleString("en-US")}\\b`).test(b) ||
        b.length < 200
      );
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

  // This shipped wrong: foreign_transaction_fee is a boolean flag, not the
  // rate, so interpolating it printed the literal word "true" on all 34 cards
  // that charge one. Nothing exercised the field.
  it("prints the foreign transaction rate, never the boolean flag", () => {
    const charging = ALL.filter((c) => c.foreign_transaction_fee === true);
    expect(charging.length).toBeGreaterThan(20);
    for (const c of charging) {
      const b = render(`/cards/${c.id}`);
      expect(b).not.toMatch(/Foreign transaction fee:\s*(true|false|undefined|null)/);
      if (c.foreign_transaction_fee_rate) expect(b).toContain(String(c.foreign_transaction_fee_rate));
    }
  });

  it.each([
    ["charges one, rate authored", { foreign_transaction_fee: true, foreign_transaction_fee_rate: "3%" }, "Foreign transaction fee: 3%"],
    ["charges one, no rate", { foreign_transaction_fee: true }, "This card charges a foreign transaction fee"],
    ["charges none", { foreign_transaction_fee: false }, "No foreign transaction fee"],
  ])("handles the foreign transaction fee when a card %s", (_l, fields, expected) => {
    const body = bodyForRoute({ path: "/cards/f" } as never, {
      cards: [{ id: "f", name: "F", issuer: "Test", annual_fee: 0, ...fields }],
      issuers: ISSUERS,
    })!.body;
    expect(body).toContain(expected);
  });

  // null is not false. Two Citi cards are genuinely unconfirmed, and claiming
  // either way would be a factual error rather than a missing sentence.
  it("stays silent when the foreign transaction fee is unconfirmed", () => {
    const unknown = ALL.filter((c) => c.foreign_transaction_fee == null);
    expect(unknown.length).toBeGreaterThan(0);
    for (const c of unknown) {
      const b = render(`/cards/${c.id}`);
      expect(b).not.toContain("foreign transaction fee");
      expect(b).not.toContain("Foreign transaction fee");
    }
  });

  it("says so plainly when a card charges no foreign transaction fee", () => {
    const free = ALL.filter((c) => c.foreign_transaction_fee === false);
    expect(free.length).toBeGreaterThan(20);
    expect(render(`/cards/${free[0].id}`)).toContain("No foreign transaction fee");
  });

  it("never renders a raw boolean, undefined or null anywhere", () => {
    const bad = ALL.filter((c) => /(?:^|[\s:>])(?:undefined|null|true|false)(?:[\s<.,]|$)/.test(render(`/cards/${c.id}`)))
      .map((c) => c.id);
    expect(bad).toEqual([]);
  });

  it("escapes values that land in an href, not just those between tags", () => {
    // The route path has to match the card id, or bodyForRoute finds no card
    // and returns null — which would make every assertion below run against
    // `undefined` and pass for the wrong reason.
    const id = 'x" onmouseover="alert(1)';
    const body = bodyForRoute({ path: `/cards/${id}` } as never, {
      cards: [{ id, name: "T", issuer: "Test", annual_fee: 0 }],
      issuers: ISSUERS,
    })?.body;
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/href="[^"]*" onmouseover/);
    expect(body).toContain("&quot;");
  });

  // The card page's href was covered and the issuer page's was not, so removing
  // escAttr from the issuer card links survived the whole suite.
  it("escapes hrefs on issuer pages too, not only card pages", () => {
    const id = 'y" onmouseover="alert(1)';
    const slug = ISSUERS[0].slug;
    const body = bodyForRoute({ path: `/issuer/${slug}` } as never, {
      cards: [{ id, name: "T", issuer: ISSUERS[0].issuerField, annual_fee: 0 }],
      issuers: ISSUERS,
    })?.body;
    expect(body).toContain("&quot;");
    expect(body).not.toMatch(/href="[^"]*" onmouseover/);
  });

  // Asserting the body contains esc(c.name) is circular: it calls the same
  // function under test, so breaking the escape breaks both sides equally and
  // the test still passes. Three catalog names contain "&"; pin the literal.
  it("escapes ampersands in real card names", () => {
    const amp = ALL.filter((c) => String(c.name).includes("&"));
    expect(amp.length).toBeGreaterThan(0);
    for (const c of amp) {
      const b = render(`/cards/${c.id}`);
      expect(b).toContain("&amp;");
      // No bare "&" survives: every one is the start of an entity.
      expect(b.replace(/&(amp|lt|gt|quot|#39|middot);/g, "")).not.toContain("&");
    }
  });

  it("escapes hrefs on the home page's issuer links", () => {
    const body = bodyForRoute({ path: "/" } as never, {
      cards: ALL,
      issuers: [{ slug: 'z" onmouseover="alert(1)', label: "Z", issuerField: "Z" }],
    })?.body;
    expect(body).not.toMatch(/href="[^"]*" onmouseover/);
    expect(body).toContain("&quot;");
  });

  // Synthetic, because the caps are set above the catalog's current maximum (8
  // earn rates, 11 credits) so nothing real is cut today. That is exactly why
  // this needs a test: the first card that crosses the line would otherwise
  // start truncating silently, and no existing page would change to show it.
  it("says how many list items it left out, rather than cutting silently", () => {
    const many = (n: number, make: (i: number) => unknown) =>
      Array.from({ length: n }, (_, i) => make(i));
    const body = bodyForRoute({ path: "/cards/big" } as never, {
      cards: [{
        id: "big", name: "Big", issuer: "Test", annual_fee: 0,
        earn_rates: many(11, (i) => ({ multiplier: `${i}x`, category: `Cat ${i}` })),
        credits: many(15, (i) => ({ name: `Credit ${i}`, max_annual: 10 })),
      }],
      issuers: ISSUERS,
    })!.body;
    expect(body).toContain("and 3 more");   // 11 earn rates, 8 shown
    expect(body).toContain("and 3 more");   // 15 credits, 12 shown
    expect(body).toContain("Advertised total $150"); // the true total, not 12 x 10
  });

  it("prints a complete list without an 'and more' line", () => {
    const whole = ALL.find((c) => ((c.earn_rates ?? []) as unknown[]).length <= 8 &&
      ((c.credits ?? []) as unknown[]).length <= 12)!;
    const body = render(`/cards/${whole.id}`);
    expect(body).not.toContain("more, on the card's page");
  });

  it("keeps the advertised total reconcilable with the credits it lists", () => {
    for (const c of ALL) {
      const live = ((c.credits ?? []) as Record<string, unknown>[]).filter((x) => !x.removed);
      if (live.length === 0) continue;
      const body = render(`/cards/${c.id}`);
      const total = live.reduce((s, x) => s + ((x.max_annual as number) ?? 0), 0);
      expect(body).toContain(`Advertised total $${total.toLocaleString("en-US")}`);
      // Either every credit is listed, or the body admits the shortfall.
      const listed = (body.match(/ a year<\/li>/g) ?? []).length;
      if (listed < live.length) expect(body).toContain(`and ${live.length - listed} more`);
    }
  });

  it("returns nothing for a route it has no content for", () => {
    expect(bodyForRoute({ path: "/no-such-route" } as never, { cards: ALL, issuers: ISSUERS })).toBeNull();
  });
});

// The escaping helpers, tested directly. Reached through bodyForRoute they are
// only exercised on whatever shapes today's catalog happens to contain, and
// jsonForScript was reachable by no test at all.
describe("the escaping helpers", () => {
  it("esc handles the three characters that change HTML meaning", () => {
    expect(esc('<b>&"')).toBe("&lt;b&gt;&amp;\"");
    expect(esc(null)).toBe("");
    expect(esc(0)).toBe("0"); // not "", which a falsy default would give
  });

  it("escAttr also closes both quote characters", () => {
    expect(escAttr('a" b\' c')).toBe("a&quot; b&#39; c");
    // & first, so an entity is never double-escaped into &amp;quot;
    expect(escAttr('&"')).toBe("&amp;&quot;");
  });

  it("jsonForScript neutralises a </script> breakout", () => {
    // JSON.stringify alone leaves this intact, and the HTML tokenizer ends the
    // element on it regardless of the JS string it sits inside.
    const out = jsonForScript({ name: "</script><img onerror=alert(1)>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
    expect(JSON.parse(out).name).toBe("</script><img onerror=alert(1)>");
  });
});
