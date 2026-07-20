import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_CARDS_FILTER,
  CLASSIFICATION,
  brandTagsForCards,
  classify,
  detailTags,
  groupCardsForAllView,
  orderChips,
  summaryTags,
} from "@/utils/cardTaxonomy";
import type { Card, CardSummary } from "@/types/cards";

// ─── Real-catalog completeness ─────────────────────────────────────────────────
// The classification table is hand-authored (no reliable heuristic distinguishes
// e.g. Amex's own Cash Back cards from Chase's Amazon Prime Visa, which also
// reports "Cash Back"), so a new card added to the backend catalog without a
// matching entry here would silently fall back to "personal" — these tests
// catch that instead of letting it happen quietly.

const CARDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../backend/data/cards",
);

function realCardIds(): string[] {
  const ids: string[] = [];
  for (const entry of fs.readdirSync(CARDS_DIR)) {
    const full = path.join(CARDS_DIR, entry);
    if (entry === "staging" || !fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      const data = JSON.parse(fs.readFileSync(path.join(full, file), "utf-8"));
      ids.push(data.id);
    }
  }
  return ids;
}

describe("CLASSIFICATION vs. the real card catalog", () => {
  it("has an explicit entry for every card currently in backend/data/cards", () => {
    const missing = realCardIds().filter((id) => !(id in CLASSIFICATION));
    expect(missing).toEqual([]);
  });

  it("doesn't carry stale entries for cards that no longer exist", () => {
    const realIds = new Set(realCardIds());
    const stale = Object.keys(CLASSIFICATION).filter((id) => !realIds.has(id));
    expect(stale).toEqual([]);
  });
});

// ─── classify ───────────────────────────────────────────────────────────────────

describe("classify", () => {
  it("returns the recorded group and brand for a known card", () => {
    expect(classify("amex-hilton-honors-aspire")).toEqual({
      group: "hotel",
      brand: "Hilton Honors",
    });
  });

  it("falls back to personal (no brand) for an unrecognized id", () => {
    expect(classify("some-future-card")).toEqual({ group: "personal" });
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "amex-platinum",
    name: "The Platinum Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
    accent_color: "#C4CBD8",
    annual_fee: 895,
    effective_cost: "Depends on usage",
    verdict: { status: "situational", text: "Keep if you use the credits" },
    total_easy_credits: 0,
    total_max_credits: 2984,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "amex-platinum",
    name: "The Platinum Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
    accent_color: "#C4CBD8",
    annual_fee: 895,
    effective_cost: "Depends on usage",
    verdict: { status: "situational", text: "Keep if you use the credits" },
    earn_rates: [],
    earn_note: "",
    points: { currency: "Membership Rewards", redemption_options: [], per_100k: "", note: "" },
    transfer_partners: { airline_count: 0, hotel_count: 0, highlight: "", recent_changes: "" },
    credits: [],
    insurance: [],
    protection_note: "",
    rental_note: "",
    status_perks: [],
    services: [],
    additional_cards: { title: "", options: [], note: "" },
    timeline: [],
    ...overrides,
  };
}

// ─── groupCardsForAllView ───────────────────────────────────────────────────────

describe("groupCardsForAllView", () => {
  it("keeps a single-brand airline group flat but splits hotels with 2+ brands", () => {
    const cards = [
      makeSummary({ id: "amex-platinum" }), // flagship
      makeSummary({ id: "amex-delta-skymiles-gold" }), // airline: Delta SkyMiles (only airline brand)
      makeSummary({ id: "amex-hilton-honors-aspire" }), // hotel: Hilton Honors
      makeSummary({ id: "amex-marriott-bonvoy-bevy" }), // hotel: Marriott Bonvoy
    ];

    const sections = groupCardsForAllView(cards);

    expect(sections.map((s) => s.label)).toEqual([
      "Flagship Cards",
      "Airline Cards", // only one airline brand present -> stays flat, not "Delta SkyMiles Cards"
      "Hilton Honors Cards",
      "Marriott Bonvoy Cards",
    ]);
    expect(sections[0].cards).toHaveLength(1);
    expect(sections[2].cards[0].id).toBe("amex-hilton-honors-aspire");
  });

  it("splits airline cards into one section per brand once an issuer has 2+ airline brands", () => {
    const cards = [
      makeSummary({ id: "chase-united-explorer", name: "United Explorer", annual_fee: 150 }),
      makeSummary({ id: "chase-southwest-rapid-rewards-plus", name: "Southwest Plus", annual_fee: 99 }),
    ];

    const sections = groupCardsForAllView(cards);

    expect(sections.map((s) => s.label)).toEqual([
      "Southwest Rapid Rewards Cards",
      "United MileagePlus Cards",
    ]);
  });

  it("omits sections with no matching cards", () => {
    const sections = groupCardsForAllView([makeSummary({ id: "amex-platinum" })]);
    expect(sections).toEqual([{ label: "Flagship Cards", cards: [makeSummary()] }]);
  });

  it("puts retail/carrier co-brands in Other Co-Branded Cards", () => {
    const sections = groupCardsForAllView([makeSummary({ id: "chase-amazon-prime-visa" })]);
    expect(sections).toEqual([
      { label: "Other Co-Branded Cards", cards: [makeSummary({ id: "chase-amazon-prime-visa" })] },
    ]);
  });

  it("sorts cards within a section by annual fee descending, then name ascending on ties", () => {
    const cards = [
      makeSummary({ id: "amex-platinum", name: "The Platinum Card", annual_fee: 895 }),
      makeSummary({ id: "amex-gold", name: "Gold Card", annual_fee: 325 }),
      makeSummary({ id: "amex-green", name: "American Express Green Card", annual_fee: 150 }),
      makeSummary({ id: "amex-blue-cash-preferred", name: "Blue Cash Preferred", annual_fee: 150 }),
    ];

    const sections = groupCardsForAllView(cards);

    expect(sections[0].cards.map((c) => c.name)).toEqual([
      "The Platinum Card", // 895
      "Gold Card", // 325
      "American Express Green Card", // 150, name asc tiebreak
      "Blue Cash Preferred", // 150
    ]);
  });
});

// ─── summaryTags / detailTags ──────────────────────────────────────────────────

describe("summaryTags", () => {
  it("tags a no-fee card", () => {
    expect(summaryTags(makeSummary({ annual_fee: 0 }))).toContain("No Annual Fee");
  });

  it("tags an airline co-brand with both the group and the brand name", () => {
    const tags = summaryTags(makeSummary({ id: "amex-delta-skymiles-gold" }));
    expect(tags).toEqual(expect.arrayContaining(["Airline", "Delta SkyMiles"]));
  });

  it("tags a hotel co-brand with both the group and the brand name", () => {
    const tags = summaryTags(makeSummary({ id: "chase-world-of-hyatt" }));
    expect(tags).toEqual(expect.arrayContaining(["Hotel", "World of Hyatt"]));
  });

  it("tags a retail co-brand with just the brand name", () => {
    const tags = summaryTags(makeSummary({ id: "capital-one-tmobile" }));
    expect(tags).toContain("T-Mobile");
    expect(tags).not.toContain("Airline");
    expect(tags).not.toContain("Hotel");
  });
});

describe("detailTags", () => {
  it("tags the issuer's own currency as Travel for a personal rewards card", () => {
    const tags = detailTags(makeCard());
    expect(tags).toEqual(expect.arrayContaining(["Travel", "Membership Rewards"]));
  });

  it("tags Cash Back cards without a Travel/currency tag", () => {
    const tags = detailTags(
      makeCard({
        id: "amex-blue-cash-everyday",
        points: { currency: "Cash Back", redemption_options: [], per_100k: "", note: "" },
      }),
    );
    expect(tags).toContain("Cash Back");
    expect(tags).not.toContain("Travel");
  });

  it("does not fabricate a currency tag for a genuinely no-rewards card", () => {
    // Regression test: the full Card detail's points.currency is the bare
    // string "None" for no-rewards cards — a naive check against the
    // friendlier "None — no rewards program" summary label (a different
    // field entirely) would miss this and leak "None" out as a fake tag.
    const tags = detailTags(
      makeCard({
        id: "chase-slate-edge",
        points: { currency: "None", redemption_options: [], per_100k: "", note: "" },
      }),
    );
    expect(tags).not.toContain("None");
    expect(tags).not.toContain("Travel");
    expect(tags).not.toContain("Cash Back");
  });

  it("tags Dining and Gas from earn rate categories", () => {
    const tags = detailTags(
      makeCard({
        earn_rates: [
          { emoji: "🍽️", multiplier: "3x", category: "Restaurants worldwide", highlight: true, is_base: false },
          { emoji: "⛽", multiplier: "3x", category: "U.S. gas stations", highlight: true, is_base: false },
        ],
      }),
    );
    expect(tags).toEqual(expect.arrayContaining(["Dining", "Gas"]));
  });

  it("tags Lounge Access from status perks", () => {
    const tags = detailTags(
      makeCard({
        status_perks: [{ name: "Centurion Lounge Access", strength: 5, note: "Unlimited visits." }],
      }),
    );
    expect(tags).toContain("Lounge Access");
  });

  it("tags 0% Intro APR, No Foreign Transaction Fee, and Balance Transfer from free text", () => {
    const tags = detailTags(
      makeCard({
        protection_note: "This card has no foreign transaction fee on any purchase.",
        earn_note: "0% intro APR for 21 months on balance transfers.",
      }),
    );
    expect(tags).toEqual(
      expect.arrayContaining(["0% Intro APR", "No Foreign Transaction Fee", "Balance Transfer"]),
    );
  });

  it("doesn't tag Dining/Gas/Lounge/APR/FTF/BT when nothing in the data supports them", () => {
    const tags = detailTags(makeCard());
    expect(tags).not.toEqual(
      expect.arrayContaining(["Dining", "Gas", "Lounge Access", "0% Intro APR", "No Foreign Transaction Fee", "Balance Transfer"]),
    );
  });
});

// ─── orderChips ────────────────────────────────────────────────────────────────

describe("orderChips", () => {
  it("always starts with All Cards", () => {
    expect(orderChips(new Set(["Cash Back"]), new Set())[0]).toBe(ALL_CARDS_FILTER);
  });

  it("slots the issuer's currency tag in right after Cash Back", () => {
    const chips = orderChips(
      new Set(["Cash Back", "Membership Rewards", "No Annual Fee"]),
      new Set(),
    );
    expect(chips).toEqual([ALL_CARDS_FILTER, "Cash Back", "Membership Rewards", "No Annual Fee"]);
  });

  it("puts brand-specific chips after structural ones, alphabetically", () => {
    const chips = orderChips(
      new Set(["Hotel", "Marriott Bonvoy", "Airline", "Delta SkyMiles"]),
      new Set(["Marriott Bonvoy", "Delta SkyMiles"]),
    );
    expect(chips).toEqual([ALL_CARDS_FILTER, "Airline", "Hotel", "Delta SkyMiles", "Marriott Bonvoy"]);
  });

  it("never emits a chip that wasn't in the input tag set", () => {
    const chips = orderChips(new Set(["Dining"]), new Set());
    expect(chips).toEqual([ALL_CARDS_FILTER, "Dining"]);
  });
});

// ─── brandTagsForCards ──────────────────────────────────────────────────────────

describe("brandTagsForCards", () => {
  it("collects every distinct brand among a set of cards", () => {
    const brands = brandTagsForCards([
      makeSummary({ id: "amex-hilton-honors-aspire" }),
      makeSummary({ id: "amex-hilton-honors" }),
      makeSummary({ id: "amex-marriott-bonvoy-bevy" }),
      makeSummary({ id: "amex-platinum" }),
    ]);
    expect(brands).toEqual(new Set(["Hilton Honors", "Marriott Bonvoy"]));
  });
});
