import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  availableFeatures,
  featuresForRespondent,
  LIKED_FEATURE_LABELS,
  NOT_ASKED_OF_HOLDERS,
} from "@/utils/cardFeatures";
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
        const lounge = (raw.status_perks ?? []).some(
          (p: { name?: string; note?: string }) =>
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

  it("has no welcome bonus option at all", () => {
    // The block is disabled on CardDetailPage, so nobody could have seen one.
    // It is gone from the option set entirely now, not merely ungated.
    expect(Object.keys(LIKED_FEATURE_LABELS)).not.toContain("welcome_bonus");
  });

  it("offers the redemption value only above a cent, where it means something", () => {
    // A point worth exactly 1.0 is cash back, so "the redemption value" cannot
    // be what distinguishes the card.
    const cpp = (c: Card) =>
      Math.max(
        0,
        ...(c.points?.redemption_options ?? [])
          .filter((o) => o.best)
          .map((o) => o.cpp ?? 0),
      );
    const offered = allCards().filter((c) =>
      availableFeatures(c).includes("redemption_rate"),
    );
    const withheld = allCards().filter(
      (c) => !availableFeatures(c).includes("redemption_rate"),
    );
    expect(offered.length).toBeGreaterThan(20);
    for (const c of offered) expect(cpp(c)).toBeGreaterThan(1.0);
    for (const c of withheld) expect(cpp(c)).toBeLessThanOrEqual(1.0);
  });

  it("labels the two intro APRs distinctly, since 33 cards carry both", () => {
    const both = allCards().filter((c) => {
      const f = availableFeatures(c);
      return (
        f.includes("intro_apr_purchases") &&
        f.includes("intro_apr_balance_transfer")
      );
    });
    expect(both.length).toBeGreaterThan(20);
    expect(LIKED_FEATURE_LABELS.intro_apr_purchases).not.toBe(
      LIKED_FEATURE_LABELS.intro_apr_balance_transfer,
    );
    // "0%" is false on five cards (three Bilt at 10%, two Discover student at
    // 10.99%), so neither label claims a rate.
    for (const label of Object.values(LIKED_FEATURE_LABELS))
      expect(label).not.toContain("0%");
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
    const empty = allCards()
      .filter((c) => availableFeatures(c).length === 0)
      .map((c) => c.id);
    expect(empty).toEqual([]);
  });
});

describe("status & perks", () => {
  it("offers it on a card whose perks are elite status rather than a lounge", () => {
    // Marriott Bonvoy Silver Elite, no lounge anywhere on the card.
    const f = availableFeatures(card("chase-marriott-bonvoy-boundless"));
    expect(f).toContain("status_perks");
    expect(f).not.toContain("lounge_access");
  });

  it("withholds it when every perk is the lounge, so the two never split one answer", () => {
    // Lounge access is itself a status perk and renders under the same tab. If
    // this card offered both, a respondent meaning "the lounges" could pick
    // either and the aggregate would show two different answers.
    const f = availableFeatures(card("amex-hilton-honors-aspire"));
    expect(f).toContain("lounge_access");
    expect(f).not.toContain("status_perks");
  });

  it("offers both when the card has a lounge and other perks besides", () => {
    const f = availableFeatures(card("chase-sapphire-reserve"));
    expect(f).toContain("lounge_access");
    expect(f).toContain("status_perks");
  });

  it("offers neither on a card with no status perks at all", () => {
    const f = availableFeatures(card("chase-sapphire-preferred"));
    expect(f).not.toContain("status_perks");
    expect(f).not.toContain("lounge_access");
  });
});

describe("featuresForRespondent", () => {
  it("does not ask a holder about an intro APR, which has expired by then", () => {
    // The longest intro period in the catalog is 21 months and held_for runs to
    // "over 5 years", so this is asking about something the card no longer has.
    const all = availableFeatures(card("amex-blue-cash-everyday"));
    expect(all).toContain("intro_apr_purchases");
    expect(all).toContain("intro_apr_balance_transfer");

    const asked = featuresForRespondent(all, "holder");
    expect(asked).not.toContain("intro_apr_purchases");
    expect(asked).not.toContain("intro_apr_balance_transfer");
  });

  it("still asks someone interested, for whom an intro APR is a real reason to apply", () => {
    const all = availableFeatures(card("amex-blue-cash-everyday"));
    expect(featuresForRespondent(all, "interested")).toEqual(all);
  });

  it("changes nothing else, so the branches stay comparable on every shared option", () => {
    for (const c of allCards()) {
      const all = availableFeatures(c);
      const holder = featuresForRespondent(all, "holder");
      const dropped = all.filter((f) => !holder.includes(f));
      expect(dropped.every((f) => NOT_ASKED_OF_HOLDERS.includes(f))).toBe(true);
      // Order is preserved; the form renders in this order.
      expect(holder).toEqual(
        all.filter((f) => !NOT_ASKED_OF_HOLDERS.includes(f)),
      );
    }
  });
});

describe("every card offers at least one option", () => {
  it("holds for the whole catalog, because the API requires one of an interested respondent", () => {
    // CardFeedbackIn rejects an interested submission naming no feature, and it
    // cannot make that conditional: "when the card offers any" is a fact about
    // the catalog the payload has no access to. So a card that offered nothing
    // would render the interested branch, invite a comment, and 422 on submit
    // with no way for the visitor to clear it.
    //
    // Reaching zero needs a card with no earn rates, no insurance above "none",
    // a non-zero annual fee, no live credits, neither intro APR, a best flagged
    // cpp at or below a cent, no transfer partners, no lounge and no other
    // status perk. Nothing like that exists today; this is what keeps it that
    // way, since the failure would otherwise reach a visitor before a test.
    const bare = allCards().filter((c) => availableFeatures(c).length === 0);
    expect(bare.map((c) => c.id)).toEqual([]);
  });
});
