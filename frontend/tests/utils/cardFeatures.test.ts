import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { availableFeatures, LIKED_FEATURE_LABELS } from "@/utils/cardFeatures";
import type { Card } from "@/types/cards";

// availableFeatures decides which options the feedback form offers, from the
// card's own data. A wrong field path here resolves to undefined rather than
// raising, so a feature would silently never be offered and nothing would fail
// — which is why this runs against real card files rather than a fixture.

const DIR = join(__dirname, "..", "..", "..", "backend", "data", "cards");

function card(id: string): Card {
  for (const dir of readdirSync(DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === "staging") continue;
    for (const f of readdirSync(join(DIR, dir.name))) {
      if (f === `${id}.json`) {
        const raw = JSON.parse(readFileSync(join(DIR, dir.name, f), "utf-8"));
        // has_lounge_access is derived by the API, not stored, so mirror the
        // server's rule here rather than inventing a value.
        const lounge = (raw.status_perks ?? []).some((p: { name?: string; note?: string }) =>
          `${p.name ?? ""} ${p.note ?? ""}`.toLowerCase().includes("lounge"),
        );
        return { ...raw, has_lounge_access: lounge } as Card;
      }
    }
  }
  throw new Error(`no card ${id}`);
}

function allCards(): Card[] {
  const out: Card[] = [];
  for (const dir of readdirSync(DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === "staging") continue;
    for (const f of readdirSync(join(DIR, dir.name))) {
      if (f.endsWith(".json")) out.push(card(f.replace(".json", "")));
    }
  }
  return out;
}

describe("availableFeatures against real cards", () => {
  it("offers a premium card its credits, insurance and lounge access", () => {
    const f = availableFeatures(card("amex-platinum"));
    expect(f).toContain("credits");
    expect(f).toContain("insurance");
    expect(f).toContain("lounge_access");
    expect(f).toContain("earn_rates");
    expect(f).not.toContain("no_annual_fee");
  });

  it("offers a no-fee card its fee and withholds credits it does not have", () => {
    const f = availableFeatures(card("discover-it-chrome"));
    expect(f).toContain("no_annual_fee");
    expect(f).not.toContain("credits");
    expect(f).not.toContain("lounge_access");
  });

  it("never offers the welcome bonus, which the page does not render", () => {
    // The block is disabled on CardDetailPage, so nobody could have seen one.
    // The enum still allows the value; this is the gate that stops it.
    const withBonus = allCards().filter((c) => c.welcome_bonus);
    expect(withBonus.length).toBeGreaterThan(50);
    for (const c of withBonus) expect(availableFeatures(c)).not.toContain("welcome_bonus");
  });

  it("offers only labelled features, and every label is reachable", () => {
    const labelled = new Set(Object.keys(LIKED_FEATURE_LABELS));
    const seen = new Set<string>();
    for (const c of allCards()) {
      for (const f of availableFeatures(c)) {
        expect(labelled.has(f)).toBe(true);
        seen.add(f);
      }
    }
    // A label no card can produce is a dead option; a feature with no label
    // would render blank.
    expect([...labelled].filter((l) => !seen.has(l))).toEqual([]);
  });

  it("gives every card at least one option, so the question is never empty", () => {
    const empty = allCards().filter((c) => availableFeatures(c).length === 0).map((c) => c.id);
    expect(empty).toEqual([]);
  });
});
