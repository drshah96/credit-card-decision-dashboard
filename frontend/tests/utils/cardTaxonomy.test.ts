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
  excludeHiddenSecuredCards,
  groupCardsForAllView,
  groupCardsForPicker,
  hiddenSecuredIds,
  orderChips,
  parseMultiplierValue,
  sortFilteredCards,
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
    categories: [],
    best_cpp: 1,
    secured_variant_id: null,
    is_secured_variant_of: null,
    points_pool_id: null,
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
    secured_variant_id: null,
    is_secured_variant_of: null,
    points_pool_id: null,
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
  it("names every airline/hotel section after its brand, even with a single brand", () => {
    const cards = [
      makeSummary({ id: "amex-platinum" }), // flagship
      makeSummary({ id: "amex-delta-skymiles-gold" }), // airline: Delta SkyMiles (only airline brand)
      makeSummary({ id: "amex-hilton-honors-aspire" }), // hotel: Hilton Honors
      makeSummary({ id: "amex-marriott-bonvoy-bevy" }), // hotel: Marriott Bonvoy
    ];

    const sections = groupCardsForAllView(cards);

    expect(sections.map((s) => s.label)).toEqual([
      "Flagship Cards",
      "Delta SkyMiles Cards", // named after its brand even though it's the only airline program
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

  it("tags the issuer's own currency as Travel for a personal rewards card", () => {
    const tags = summaryTags(makeSummary());
    expect(tags).toEqual(expect.arrayContaining(["Travel", "Membership Rewards"]));
  });

  it("tags Cash Back cards without a Travel/currency tag", () => {
    const tags = summaryTags(makeSummary({ id: "amex-blue-cash-everyday", points_program: "Cash Back" }));
    expect(tags).toContain("Cash Back");
    expect(tags).not.toContain("Travel");
  });

  it("does not fabricate a currency tag for a genuinely no-rewards card", () => {
    // Regression test: a no-rewards card's points_program is the bare string
    // "None" — a naive check against the friendlier "None — no rewards
    // program" detail-page label (a different field entirely) would miss
    // this and leak "None" out as a fake tag.
    const tags = summaryTags(makeSummary({ id: "chase-slate-edge", points_program: "None" }));
    expect(tags).not.toContain("None");
    expect(tags).not.toContain("Travel");
    expect(tags).not.toContain("Cash Back");
  });

  it("tags Dining and Gas from earn rate categories", () => {
    const tags = summaryTags(
      makeSummary({
        categories: [
          { category: "Restaurants worldwide", multiplier: "4x", is_base: false },
          { category: "U.S. gas stations", multiplier: "3x", is_base: false },
        ],
      }),
    );
    expect(tags).toEqual(expect.arrayContaining(["Dining", "Gas"]));
  });

  it("doesn't tag Dining/Gas when nothing in the categories supports them", () => {
    const tags = summaryTags(makeSummary({ categories: [] }));
    expect(tags).not.toEqual(expect.arrayContaining(["Dining", "Gas"]));
  });
});

describe("detailTags", () => {
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

  it("doesn't tag Lounge/APR/FTF/BT when nothing in the data supports them", () => {
    const tags = detailTags(makeCard());
    expect(tags).not.toEqual(
      expect.arrayContaining(["Lounge Access", "0% Intro APR", "No Foreign Transaction Fee", "Balance Transfer"]),
    );
  });
});

// ─── groupCardsForPicker ────────────────────────────────────────────────────────

// All fixtures below default to issuer "American Express" (see makeSummary),
// so unless a test overrides `issuer`, everything lands in one group and
// `onlyGroup` pulls out just its cards for a flat, easy-to-assert list.
function onlyGroup(sections: ReturnType<typeof groupCardsForPicker>) {
  expect(sections).toHaveLength(1);
  return sections[0].cards;
}

describe("groupCardsForPicker", () => {
  it("ranks a single selected category by multiplier, descending", () => {
    const cards = [
      makeSummary({ id: "a", name: "A", categories: [{ category: "Dining", multiplier: "3x", is_base: false }] }),
      makeSummary({ id: "b", name: "B", categories: [{ category: "Dining", multiplier: "5x", is_base: false }] }),
      makeSummary({ id: "c", name: "C", categories: [{ category: "Dining", multiplier: "4x", is_base: false }] }),
    ];
    const sorted = onlyGroup(groupCardsForPicker(cards, new Set(["Dining"])));
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("with multiple categories selected, ranks by the best multiplier across any of them", () => {
    const cards = [
      // Best rate is in Gas (2x) — lower than B's best (Dining, 4x).
      makeSummary({
        id: "a",
        name: "A",
        categories: [
          { category: "Dining", multiplier: "1x", is_base: false },
          { category: "Gas", multiplier: "2x", is_base: false },
        ],
      }),
      makeSummary({ id: "b", name: "B", categories: [{ category: "Dining", multiplier: "4x", is_base: false }] }),
    ];
    const sorted = onlyGroup(groupCardsForPicker(cards, new Set(["Dining", "Gas"])));
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("breaks ties alphabetically by name", () => {
    const cards = [
      makeSummary({ id: "z", name: "Zebra", categories: [{ category: "Gas", multiplier: "3x", is_base: false }] }),
      makeSummary({ id: "a", name: "Alpha", categories: [{ category: "Gas", multiplier: "3x", is_base: false }] }),
    ];
    const sorted = onlyGroup(groupCardsForPicker(cards, new Set(["Gas"])));
    expect(sorted.map((c) => c.id)).toEqual(["a", "z"]);
  });

  it("puts cards with no computable multiplier for the selected filters last, alphabetically", () => {
    const cards = [
      makeSummary({ id: "b", name: "Bravo", categories: [] }), // "Travel" has no per-category rate
      makeSummary({ id: "g", name: "Golf", categories: [{ category: "Gas", multiplier: "3x", is_base: false }] }),
      makeSummary({ id: "a", name: "Alpha", categories: [] }),
    ];
    const sorted = onlyGroup(groupCardsForPicker(cards, new Set(["Gas", "Travel"])));
    expect(sorted.map((c) => c.id)).toEqual(["g", "a", "b"]);
  });

  it("sorts alphabetically by name when no category filter is selected", () => {
    const cards = [
      makeSummary({ id: "z", name: "Zebra", categories: [{ category: "Gas", multiplier: "5x", is_base: false }] }),
      makeSummary({ id: "a", name: "Alpha", categories: [{ category: "Gas", multiplier: "1x", is_base: false }] }),
    ];
    const sorted = onlyGroup(groupCardsForPicker(cards, new Set()));
    expect(sorted.map((c) => c.id)).toEqual(["a", "z"]);
  });

  it("groups by issuer before ranking within each group", () => {
    const cards = [
      makeSummary({
        id: "chase-card",
        name: "Chase Card",
        issuer: "Chase",
        categories: [{ category: "Dining", multiplier: "2x", is_base: false }],
      }),
      makeSummary({
        id: "amex-card",
        name: "Amex Card",
        issuer: "American Express",
        categories: [{ category: "Dining", multiplier: "5x", is_base: false }],
      }),
    ];
    const sections = groupCardsForPicker(cards, new Set(["Dining"]));
    // Two separate issuer groups, not one flat cross-issuer ranking — the
    // higher Dining multiplier (Chase, 2x < Amex, 5x) does NOT pull the Amex
    // card into a different position relative to Chase's own group.
    expect(sections.map((s) => s.label)).toEqual(["American Express", "Chase"]);
    expect(sections[0].cards.map((c) => c.id)).toEqual(["amex-card"]);
    expect(sections[1].cards.map((c) => c.id)).toEqual(["chase-card"]);
  });

  it("omits empty issuer groups", () => {
    const cards = [makeSummary({ id: "a", name: "A", issuer: "American Express" })];
    const sections = groupCardsForPicker(cards, new Set());
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("American Express");
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

// ─── parseMultiplierValue ───────────────────────────────────────────────────────

describe("parseMultiplierValue", () => {
  it("extracts the leading number regardless of suffix", () => {
    expect(parseMultiplierValue("5×")).toBe(5);
    expect(parseMultiplierValue("3%")).toBe(3);
    expect(parseMultiplierValue("15¢/gal")).toBe(15);
    expect(parseMultiplierValue("Up to 4×")).toBe(4);
    expect(parseMultiplierValue("2.5×")).toBe(2.5);
  });

  it("treats an unparseable multiplier as lowest-priority rather than throwing", () => {
    expect(parseMultiplierValue("Points on Star Money Days")).toBe(-Infinity);
  });
});

// ─── sortFilteredCards ──────────────────────────────────────────────────────────

describe("sortFilteredCards", () => {
  it("puts flagship cards before airline/hotel co-brands before other co-brands", () => {
    const cards = [
      makeSummary({ id: "chase-amazon-prime-visa", name: "Amazon Prime Visa", annual_fee: 0 }),
      makeSummary({ id: "chase-united-explorer", name: "United Explorer", annual_fee: 150 }),
      makeSummary({ id: "chase-sapphire-reserve", name: "Sapphire Reserve", annual_fee: 795 }),
    ];

    const sorted = sortFilteredCards(cards, "Travel", new Map());

    expect(sorted.map((c) => c.id)).toEqual([
      "chase-sapphire-reserve", // personal (flagship)
      "chase-united-explorer", // airline
      "chase-amazon-prime-visa", // cobrand
    ]);
  });

  it("within a group, ranks by the filter category's highest multiplier first", () => {
    const low = makeSummary({ id: "amex-gold", name: "Gold Card", annual_fee: 325 });
    const high = makeSummary({ id: "amex-platinum", name: "The Platinum Card", annual_fee: 895 });
    const detailsById = new Map([
      [
        low.id,
        makeCard({
          id: low.id,
          earn_rates: [{ emoji: "🍽️", multiplier: "1×", category: "Restaurants", highlight: false, is_base: false }],
        }),
      ],
      [
        high.id,
        makeCard({
          id: high.id,
          earn_rates: [{ emoji: "🍽️", multiplier: "4×", category: "Dining", highlight: true, is_base: false }],
        }),
      ],
    ]);

    // Lower annual fee listed first in the input — a plain fee-descending
    // sort would keep `high` first anyway, so this specifically proves the
    // ordering comes from the Dining multiplier, not from the fee tiebreak.
    const sorted = sortFilteredCards([low, high], "Dining", detailsById);

    expect(sorted.map((c) => c.id)).toEqual(["amex-platinum", "amex-gold"]);
  });

  it("falls back to fee descending, then name, when the filter has no multiplier to rank by", () => {
    const cards = [
      makeSummary({ id: "amex-gold", name: "Gold Card", annual_fee: 325 }),
      makeSummary({ id: "amex-platinum", name: "The Platinum Card", annual_fee: 895 }),
    ];

    // "Travel" is a structural tag, not an earn-rate category — there's no
    // multiplier to compare, so cards should fall back to fee-descending.
    const sorted = sortFilteredCards(cards, "Travel", new Map());

    expect(sorted.map((c) => c.id)).toEqual(["amex-platinum", "amex-gold"]);
  });

  it("puts a card with no loaded detail after one with a known multiplier in the same group", () => {
    const noDetail = makeSummary({ id: "amex-gold", name: "Gold Card", annual_fee: 895 });
    const withDetail = makeSummary({ id: "amex-platinum", name: "The Platinum Card", annual_fee: 325 });
    const detailsById = new Map([
      [
        withDetail.id,
        makeCard({
          id: withDetail.id,
          earn_rates: [{ emoji: "🍽️", multiplier: "1×", category: "Dining", highlight: false, is_base: false }],
        }),
      ],
      // noDetail intentionally has no entry in detailsById — simulates its
      // per-card fetch not having resolved yet.
    ]);

    const sorted = sortFilteredCards([noDetail, withDetail], "Dining", detailsById);

    expect(sorted.map((c) => c.id)).toEqual(["amex-platinum", "amex-gold"]);
  });
});

describe("hiddenSecuredIds / excludeHiddenSecuredCards", () => {
  it("collects every secured_variant_id present in the catalog", () => {
    const cards = [
      makeSummary({ id: "us-bank-cash-plus", secured_variant_id: "us-bank-cash-plus-secured" }),
      makeSummary({ id: "us-bank-cash-plus-secured" }),
      makeSummary({ id: "amex-gold" }),
    ];

    expect(hiddenSecuredIds(cards)).toEqual(new Set(["us-bank-cash-plus-secured"]));
  });

  it("drops a secured card from the list when its unsecured sibling is present", () => {
    const primary = makeSummary({
      id: "us-bank-cash-plus",
      secured_variant_id: "us-bank-cash-plus-secured",
    });
    const secured = makeSummary({ id: "us-bank-cash-plus-secured" });
    const other = makeSummary({ id: "amex-gold" });

    expect(excludeHiddenSecuredCards([primary, secured, other]).map((c) => c.id)).toEqual([
      "us-bank-cash-plus",
      "amex-gold",
    ]);
  });

  it("keeps a secured card whose unsecured sibling isn't in the current list", () => {
    // e.g. a "My Cards" selection that includes only the secured variant —
    // it must not vanish just because the pairing exists in the full catalog.
    const secured = makeSummary({ id: "us-bank-cash-plus-secured" });
    const other = makeSummary({ id: "amex-gold" });

    expect(excludeHiddenSecuredCards([secured, other]).map((c) => c.id)).toEqual([
      "us-bank-cash-plus-secured",
      "amex-gold",
    ]);
  });

  it("leaves a card with no pairing at all untouched", () => {
    const cards = [makeSummary({ id: "amex-gold" }), makeSummary({ id: "chase-freedom-flex" })];

    expect(hiddenSecuredIds(cards)).toEqual(new Set());
    expect(excludeHiddenSecuredCards(cards)).toHaveLength(2);
  });
});
