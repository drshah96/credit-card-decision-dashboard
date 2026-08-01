import { describe, it, expect } from "vitest";
import { computeTopPicks, TOP_PICK_CATEGORIES } from "@/utils/topPickCategories";
import type { CardSummary, EarnCategorySummary } from "@/types/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "test-card",
    name: "Test Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
    accent_color: "#000000",
    annual_fee: 0,
    effective_cost: "Free",
    verdict: { status: "keep", text: "Keep it" },
    total_easy_credits: 0,
    total_max_credits: 0,
    categories: [],
    best_cpp: 1,
    secured_variant_id: null,
    is_secured_variant_of: null,
    points_pool_id: null,
    points_pool_receiver: false,
    ...overrides,
  };
}

function rate(category: string, multiplier: string, is_base = false): EarnCategorySummary {
  return { category, multiplier, is_base };
}

describe("TOP_PICK_CATEGORIES matchers (via computeTopPicks)", () => {
  // Real category strings pulled from the catalog — one card per string,
  // asserting it lands (or doesn't) in the expected category's ranking.
  const cases: Array<[category: string, text: string, multiplier: string]> = [
    ["dining", "Restaurants worldwide (incl. U.S. takeout/delivery)", "4×"],
    ["dining", "Select food delivery", "3×"],
    ["groceries", "U.S. supermarkets", "4×"],
    ["groceries", "Amazon.com, Audible.com & Whole Foods Market, with Prime membership", "5×"],
    ["gas-ev", "Gas stations/EV charging", "3×"],
    ["streaming", "Popular streaming services: Netflix, Hulu, Disney+", "6×"],
    ["hotels", "Hotels, booked direct", "5×"],
    ["flights", "Flights booked direct with airlines", "3×"],
    ["flights", "Flights, via Amex Travel or direct with airlines", "4×"],
    ["car-rentals", "Hotels & rental cars, via AAdvantage portals", "2×"],
    ["other-travel", "Chase Travel portal", "3×"],
    ["transit", "Local transit & commuting, incl. rideshare", "3×"],
    ["online-shopping", "U.S. online retail", "2×"],
    ["wholesale", "Costco & Costco.com purchases", "2%"],
    ["home-improvement", "Williams Sonoma, Williams Sonoma Home, Pottery Barn", "3×"],
    ["utilities", "Internet, cable & phone services", "3×"],
    ["rent", "Rent or mortgage (Bilt Housing Rewards)", "1×"],
    ["drugstores", "Drugstores", "3%"],
    ["entertainment", "Entertainment: movies, concerts, sporting events, amusement parks", "3%"],
    ["fitness", "Fitness clubs & gyms", "2×"],
  ];

  it.each(cases)("matches %s for %j", (categoryKey, text, multiplier) => {
    const card = makeSummary({ id: "x", categories: [rate(text, multiplier)] });
    const rows = computeTopPicks([card]);
    const row = rows.find((r) => r.key === categoryKey)!;
    expect(row.topChoice?.card.id).toBe("x");
  });

  it("doesn't file unrelated brand-specific rates into any of the categories", () => {
    const card = makeSummary({
      id: "x",
      categories: [rate("Kohl's & Kohls.com purchases", "5×"), rate("L.L.Bean purchases", "4%")],
    });
    const rows = computeTopPicks([card]);
    for (const row of rows) {
      if (row.key === "catch-all") continue;
      expect(row.topChoice?.card.id).not.toBe("x");
    }
  });

  it("doesn't count a Costco/BJ's gas-pump or travel-portal rate toward Wholesale Clubs", () => {
    // Regression test: "Gas at Costco" and "Eligible travel: ... Costco
    // Travel" both match the wholesale matcher's "costco" keyword too — the
    // real Costco Anywhere Visa has both, at a HIGHER rate than its actual
    // 2% in-club rate, which would otherwise misrepresent the card's
    // wholesale-club earning by showing a gas or travel rate instead.
    const card = makeSummary({
      id: "x",
      categories: [
        rate("Gas at Costco (worldwide): first $7,000/yr, then 1%", "5%"),
        rate("Eligible travel: airfare, hotels, car rentals, Costco Travel", "3%"),
        rate("Costco & Costco.com purchases", "2%"),
      ],
    });
    const rows = computeTopPicks([card]);
    expect(rows.find((r) => r.key === "gas-ev")?.topChoice?.multiplier).toBe("5%");
    expect(rows.find((r) => r.key === "flights")?.topChoice?.multiplier).toBe("3%");
    expect(rows.find((r) => r.key === "hotels")?.topChoice?.multiplier).toBe("3%");
    expect(rows.find((r) => r.key === "car-rentals")?.topChoice?.multiplier).toBe("3%");
    expect(rows.find((r) => r.key === "other-travel")?.topChoice?.multiplier).toBe("3%");
    expect(rows.find((r) => r.key === "wholesale")?.topChoice?.multiplier).toBe("2%");
  });

  it("doesn't let a single-airline-brand rate win the broad Flights ranking", () => {
    // Regression test: "Eligible United flights" at 11x is real, but only
    // for United — showing it as the Flights Top Choice implies 11x on any
    // airline, when this same card only earns 2x on non-United travel. The
    // card's broadly-applicable rate (if any) should compete instead.
    const united = makeSummary({
      id: "united-card",
      name: "United Card",
      categories: [
        rate("Eligible United flights", "11×"),
        rate("Other United purchases", "5×"),
        rate("Airline tickets, booked direct", "2×"),
      ],
    });
    const generic = makeSummary({
      id: "generic-card",
      name: "Generic Travel Card",
      categories: [rate("Flights booked direct with airlines", "3×")],
    });
    const row = computeTopPicks([united, generic]).find((r) => r.key === "flights")!;
    expect(row.topChoice?.card.id).toBe("generic-card");
    expect(row.runnerUp?.card.id).toBe("united-card");
    expect(row.runnerUp?.multiplier).toBe("2×");
  });

  it("doesn't let a single-hotel-brand rate win the broad Hotels ranking", () => {
    const hilton = makeSummary({
      id: "hilton-card",
      categories: [rate("Hilton portfolio hotels, direct", "14×"), rate("Everything else", "3×")],
    });
    const row = computeTopPicks([hilton]).find((r) => r.key === "hotels")!;
    expect(row.topChoice).toBeUndefined();
  });

  it("doesn't let a Lyft-only rate win the broad Transit ranking", () => {
    // Regression test: Chase Sapphire Reserve's 5x is Lyft-only, not transit
    // broadly — parking/tolls/trains/buses/Uber all earn its base 1x.
    const card = makeSummary({
      id: "sapphire-reserve",
      categories: [rate("Lyft (through Mar 2027)", "5×"), rate("Dining, worldwide", "3×")],
    });
    const row = computeTopPicks([card]).find((r) => r.key === "transit")!;
    expect(row.topChoice).toBeUndefined();
  });

  it("still ranks a generic rideshare rate (not brand-specific) for Transit", () => {
    const card = makeSummary({ id: "x", categories: [rate("Rideshare", "3×")] });
    const row = computeTopPicks([card]).find((r) => r.key === "transit")!;
    expect(row.topChoice?.card.id).toBe("x");
  });

  it("counts a multi-category rate toward every category it lists", () => {
    // Citi Custom Cash-style "choose one" rate.
    const card = makeSummary({
      id: "x",
      categories: [rate("Gas stations, grocery stores, home improvement stores, and phone plans", "5%")],
    });
    const rows = computeTopPicks([card]);
    for (const key of ["gas-ev", "groceries", "home-improvement", "utilities"]) {
      expect(rows.find((r) => r.key === key)?.topChoice?.card.id).toBe("x");
    }
  });

  it("finds Drugstores hidden inside a BofA-style choice-category rate, not just a standalone one", () => {
    const card = makeSummary({
      id: "x",
      categories: [
        rate(
          "Choice category: gas/EV, online shopping, dining, travel, drug stores, or home improvement",
          "3%",
        ),
      ],
    });
    const rows = computeTopPicks([card]);
    expect(rows.find((r) => r.key === "drugstores")?.topChoice?.card.id).toBe("x");
  });

  it("finds the categories inside a US Bank Cash+-style itemized choose-your-own rate", () => {
    // Regression test: this text used to just read "Two categories you
    // choose each quarter, first $2,000 combined, then 1%" — the actual
    // choices (fast food, home utilities, streaming, gyms, ...) only lived
    // in the card's earn_note prose, invisible to category matching. Now
    // itemized in the category field itself, like every other choice-
    // category card in the catalog.
    const card = makeSummary({
      id: "x",
      categories: [
        rate(
          "Two categories you choose each quarter: fast food, home utilities, streaming, department stores, cell phone, electronics, sporting goods, furniture, movie theaters, ground transportation, gyms, or select clothing (first $2,000 combined, then 1%)",
          "5%",
        ),
      ],
    });
    const rows = computeTopPicks([card]);
    for (const key of [
      "dining",
      "utilities",
      "streaming",
      "home-improvement",
      "transit",
      "fitness",
    ]) {
      expect(rows.find((r) => r.key === key)?.topChoice?.card.id).toBe("x");
    }
  });

  it("finds the categories inside a Citi Strata-style itemized self-select rate", () => {
    const card = makeSummary({
      id: "x",
      categories: [
        rate(
          "Self-Select category: fitness clubs, streaming, live entertainment, cosmetics/barber/salon, or pet supply stores (one choice, changeable quarterly)",
          "3×",
        ),
      ],
    });
    const rows = computeTopPicks([card]);
    for (const key of ["fitness", "streaming", "entertainment"]) {
      expect(rows.find((r) => r.key === key)?.topChoice?.card.id).toBe("x");
    }
  });

  it("counts a single travel rate toward every travel sub-category it names", () => {
    const card = makeSummary({
      id: "x",
      categories: [rate("Travel: airfare, hotels, car rentals, cruises", "3×")],
    });
    const rows = computeTopPicks([card]);
    for (const key of ["flights", "hotels", "car-rentals", "other-travel"]) {
      expect(rows.find((r) => r.key === key)?.topChoice?.card.id).toBe("x");
    }
  });

  it.each(["Chase Travel portal", "Chase Travel purchases"])(
    "counts an un-itemized travel-portal rate (%j) toward Flights, Hotels, AND Car Rentals",
    (text) => {
      // Regression test: "Chase Travel portal" doesn't spell out "flights/
      // hotels/car rentals" the way "Eligible travel: airfare, hotels, car
      // rentals, Costco Travel" does, but it functionally covers the same
      // ground — you can book any of those through it. Without this it was
      // silently only counted toward Other Travel, so e.g. Chase Sapphire
      // Reserve's actual best flights rate never showed up in Flights at all.
      const card = makeSummary({ id: "x", categories: [rate(text, "8×")] });
      const rows = computeTopPicks([card]);
      for (const key of ["flights", "hotels", "car-rentals"]) {
        expect(rows.find((r) => r.key === key)?.topChoice?.card.id).toBe("x");
      }
    },
  );
});

describe("Catch-All", () => {
  it("uses is_base, not text matching, regardless of how the rate is phrased", () => {
    const card = makeSummary({
      id: "x",
      categories: [
        rate("Everywhere else Mastercard is accepted", "1.5×", true),
        rate("Restaurants worldwide", "4×", false),
      ],
    });
    const rows = computeTopPicks([card]);
    const catchAll = rows.find((r) => r.key === "catch-all")!;
    expect(catchAll.topChoice?.card.id).toBe("x");
    expect(catchAll.topChoice?.multiplier).toBe("1.5×");
  });

  it("doesn't pick up a non-base rate even if it says 'everything'-ish text", () => {
    const card = makeSummary({
      id: "x",
      categories: [rate("Everything, first year only, then 1.5%", "5×", false)],
    });
    const rows = computeTopPicks([card]);
    expect(rows.find((r) => r.key === "catch-all")?.topChoice).toBeUndefined();
  });
});

describe("computeTopPicks ranking weighted by point value", () => {
  it("ranks a lower multiplier with a higher point value above a higher multiplier worth less", () => {
    // The exact scenario this was built for: 6x Hilton points at 0.5¢ each
    // (3.0¢/$1 effective) is worth less than 3x Chase points at 2.05¢ each
    // (6.15¢/$1 effective) — the raw "x" alone would rank these backwards.
    const hilton = makeSummary({
      id: "hilton",
      name: "Hilton Card",
      best_cpp: 0.5,
      categories: [rate("Restaurants", "6×")],
    });
    const chase = makeSummary({
      id: "chase",
      name: "Chase Card",
      best_cpp: 2.05,
      categories: [rate("Restaurants", "3×")],
    });
    const row = computeTopPicks([hilton, chase]).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("chase");
    expect(row.runnerUp?.card.id).toBe("hilton");
  });

  it("treats a flat cash-back rate's effective value as equal to its raw percentage", () => {
    const cashBack = makeSummary({ id: "cash", best_cpp: 1, categories: [rate("Dining", "3%")] });
    const row = computeTopPicks([cashBack]).find((r) => r.key === "dining")!;
    expect(row.topChoice?.effectiveValue).toBe(3);
  });

  it("doesn't multiply a % rate by the card's best_cpp, even when best_cpp isn't 1", () => {
    // Regression test: a "%" rate already directly states cents earned per
    // dollar — it should use a 1¢ statement-credit-equivalent rate, not the
    // card's best *points-transfer* cpp, which may come from a completely
    // different, higher-value redemption path that this specific %-labeled
    // rate has no relationship to.
    const card = makeSummary({
      id: "mixed",
      best_cpp: 2.05,
      categories: [rate("Dining", "5%")],
    });
    const row = computeTopPicks([card]).find((r) => r.key === "dining")!;
    // Without the fix this would be 5 * 2.05 = 10.25.
    expect(row.topChoice?.effectiveValue).toBe(5);
  });
});

describe("points pooling", () => {
  // A Freedom Flex/Unlimited-shaped fixture: %-labeled rate, best_cpp 1 on
  // its own, but carries a points_pool_id.
  function feeder(overrides: Partial<CardSummary> = {}): CardSummary {
    return makeSummary({
      id: "freedom",
      name: "Freedom Flex",
      best_cpp: 1,
      points_pool_id: "chase-ultimate-rewards-transferable",
      categories: [rate("Dining", "3%")],
      ...overrides,
    });
  }

  // A Sapphire Reserve-shaped fixture: the higher-cpp receiver account.
  function receiver(overrides: Partial<CardSummary> = {}): CardSummary {
    return makeSummary({
      id: "sapphire",
      name: "Sapphire Reserve",
      best_cpp: 2.05,
      points_pool_id: "chase-ultimate-rewards-transferable",
      points_pool_receiver: true,
      categories: [rate("Dining", "3×")],
      ...overrides,
    });
  }

  it("boosts a feeder card's effective value to the receiver's best_cpp when pooling is applied", () => {
    const row = computeTopPicks([feeder(), receiver({ categories: [] })], {
      applyPointsPooling: true,
    }).find((r) => r.key === "dining")!;
    // 3% raw -> reinterpreted as 3 points, boosted to 2.05cpp = 6.15.
    expect(row.topChoice?.effectiveValue).toBeCloseTo(6.15);
    expect(row.topChoice?.card.id).toBe("freedom");
    expect(row.topChoice?.isPooled).toBe(true);
  });

  it("leaves the feeder card at its own raw rate when applyPointsPooling isn't passed at all", () => {
    // Regression guard: the whole-catalog default ranking must never boost
    // a card just because a pool partner happens to exist somewhere in the
    // catalog — pooling requires actually holding both.
    const row = computeTopPicks([feeder(), receiver({ categories: [] })]).find(
      (r) => r.key === "dining",
    )!;
    expect(row.topChoice?.effectiveValue).toBe(3);
    expect(row.topChoice?.isPooled).toBe(false);
  });

  it("doesn't boost a feeder card when its pool partner isn't in the given set, even with pooling enabled", () => {
    // e.g. someone's My Cards selection includes Freedom Flex but not any
    // Sapphire card — nothing to pool with.
    const row = computeTopPicks([feeder()], { applyPointsPooling: true }).find(
      (r) => r.key === "dining",
    )!;
    expect(row.topChoice?.effectiveValue).toBe(3);
    expect(row.topChoice?.isPooled).toBe(false);
  });

  it("doesn't mark the receiver card itself as pooled — its own best_cpp is already the max", () => {
    const row = computeTopPicks([feeder({ categories: [] }), receiver()], {
      applyPointsPooling: true,
    }).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("sapphire");
    expect(row.topChoice?.isPooled).toBe(false);
  });

  it("takes the max across multiple pool partners, not just any one of them", () => {
    const weakerReceiver = makeSummary({
      id: "preferred",
      name: "Sapphire Preferred",
      best_cpp: 1.5,
      points_pool_id: "chase-ultimate-rewards-transferable",
      points_pool_receiver: true,
      categories: [],
    });
    const row = computeTopPicks([feeder(), weakerReceiver, receiver({ categories: [] })], {
      applyPointsPooling: true,
    }).find((r) => r.key === "dining")!;
    // Boosted to the Reserve's 2.05, not the weaker Preferred's 1.5.
    expect(row.topChoice?.effectiveValue).toBeCloseTo(6.15);
  });

  it("doesn't pool cards with different pool ids", () => {
    const otherPool = receiver({
      id: "other-issuer-card",
      points_pool_id: "some-other-pool",
      categories: [],
    });
    const row = computeTopPicks([feeder(), otherPool], { applyPointsPooling: true }).find(
      (r) => r.key === "dining",
    )!;
    expect(row.topChoice?.effectiveValue).toBe(3);
    expect(row.topChoice?.isPooled).toBe(false);
  });

  it("doesn't let one feeder boost another feeder with no receiver present, even when their best_cpp values differ", () => {
    // The exact bug this field was added to fix: Citi Double Cash (1.0cpp
    // alone) and plain Strata (1.2cpp alone) share a pool id but neither is
    // a receiver — Chase's two feeders happened to tie at the same best_cpp
    // (1.0 each), which masked this exact gap, since max(1, 1) looks
    // correct by coincidence. Citi's feeders don't tie, so a naive
    // "max across anyone sharing the pool id" would incorrectly boost
    // Double Cash to 1.2 with no premium account actually held.
    const doubleCash = makeSummary({
      id: "citi-double-cash",
      name: "Double Cash",
      best_cpp: 1.0,
      points_pool_id: "citi-thankyou-points-transferable",
      categories: [rate("Dining", "2%")],
    });
    const strata = makeSummary({
      id: "citi-strata",
      name: "Strata",
      best_cpp: 1.2,
      points_pool_id: "citi-thankyou-points-transferable",
      categories: [],
    });
    const row = computeTopPicks([doubleCash, strata], { applyPointsPooling: true }).find(
      (r) => r.key === "dining",
    )!;
    expect(row.topChoice?.effectiveValue).toBe(2);
    expect(row.topChoice?.isPooled).toBe(false);
  });

  it("boosts a Citi feeder to a Citi receiver's best_cpp, same as the Chase case", () => {
    const doubleCash = makeSummary({
      id: "citi-double-cash",
      name: "Double Cash",
      best_cpp: 1.0,
      points_pool_id: "citi-thankyou-points-transferable",
      categories: [rate("Dining", "2%")],
    });
    const strataElite = makeSummary({
      id: "citi-strata-elite",
      name: "Strata Elite",
      best_cpp: 1.7,
      points_pool_id: "citi-thankyou-points-transferable",
      points_pool_receiver: true,
      categories: [],
    });
    const row = computeTopPicks([doubleCash, strataElite], { applyPointsPooling: true }).find(
      (r) => r.key === "dining",
    )!;
    expect(row.topChoice?.card.id).toBe("citi-double-cash");
    expect(row.topChoice?.effectiveValue).toBeCloseTo(3.4);
    expect(row.topChoice?.isPooled).toBe(true);
  });

  it("two receivers in the same pool can still boost each other (a real pooled balance blends to the best account)", () => {
    // Not a bug: if someone holds both Sapphire Preferred and Reserve and
    // combines everything into the Reserve account, all of it — including
    // points Preferred itself earned — redeems at Reserve's better rate.
    const preferred = makeSummary({
      id: "sapphire-preferred",
      name: "Sapphire Preferred",
      best_cpp: 2.0,
      points_pool_id: "chase-ultimate-rewards-transferable",
      points_pool_receiver: true,
      categories: [rate("Dining", "3×")],
    });
    const row = computeTopPicks([preferred, receiver({ categories: [] })], {
      applyPointsPooling: true,
    }).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("sapphire-preferred");
    expect(row.topChoice?.effectiveValue).toBeCloseTo(6.15);
    expect(row.topChoice?.isPooled).toBe(true);
  });
});

describe("catch-all fallback fill", () => {
  it("fills a remaining slot with the next-best flat-rate card, marked isFallback", () => {
    const cards = [
      makeSummary({
        id: "bilt",
        name: "Bilt Obsidian",
        categories: [rate("Rent or mortgage", "1×"), rate("Everything else", "2×", true)],
      }),
      makeSummary({
        id: "flat-3",
        name: "Flat 3% Card",
        categories: [rate("Everything else", "3%", true)],
      }),
      makeSummary({
        id: "flat-1.5",
        name: "Flat 1.5% Card",
        categories: [rate("Everything else", "1.5%", true)],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "rent")!;
    expect(row.topChoice?.card.id).toBe("bilt");
    expect(row.topChoice?.isFallback).toBe(false);
    // Fallbacks ranked by their own flat-rate value, descending.
    expect(row.runnerUp?.card.id).toBe("flat-3");
    expect(row.runnerUp?.isFallback).toBe(true);
    expect(row.honorableMention?.card.id).toBe("flat-1.5");
    expect(row.honorableMention?.isFallback).toBe(true);
  });

  it("never lets a fallback outrank a real bonus match, even at a higher raw value", () => {
    // Regression test for the actual design question this was built to
    // answer: a weak-but-real 2% wholesale-club bonus should still beat a
    // stronger 5% flat cash-back card that has no wholesale-specific rate.
    const cards = [
      makeSummary({
        id: "weak-bonus",
        name: "Weak Bonus Card",
        categories: [rate("Wholesale clubs", "2%"), rate("Everything else", "1%", true)],
      }),
      makeSummary({
        id: "strong-flat",
        name: "Strong Flat Card",
        categories: [rate("Everything else", "5%", true)],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "wholesale")!;
    expect(row.topChoice?.card.id).toBe("weak-bonus");
    expect(row.topChoice?.isFallback).toBe(false);
    expect(row.runnerUp?.card.id).toBe("strong-flat");
    expect(row.runnerUp?.isFallback).toBe(true);
  });

  it("doesn't list a card twice when it already won on a real bonus match", () => {
    const cards = [
      makeSummary({
        id: "x",
        categories: [rate("Rent or mortgage", "1×"), rate("Everything else", "2×", true)],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "rent")!;
    expect(row.topChoice?.card.id).toBe("x");
    expect(row.runnerUp).toBeUndefined();
  });

  it("skips a card with no catch-all rate at all as a fallback candidate", () => {
    const cards = [
      makeSummary({
        id: "bilt",
        name: "Bilt",
        categories: [rate("Rent or mortgage", "1×"), rate("Everything else", "2×", true)],
      }),
      makeSummary({
        id: "no-catch-all",
        name: "No Catch-All Card",
        categories: [rate("Dining", "3×")], // no is_base rate anywhere
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "rent")!;
    expect(row.topChoice?.card.id).toBe("bilt");
    expect(row.runnerUp).toBeUndefined();
  });

  it("doesn't fallback-fill the Catch-All row itself", () => {
    const cards = [makeSummary({ id: "x", categories: [rate("Everything else", "2×", true)] })];
    const row = computeTopPicks(cards).find((r) => r.key === "catch-all")!;
    expect(row.topChoice?.card.id).toBe("x");
    expect(row.topChoice?.isFallback).toBe(false);
    expect(row.runnerUp).toBeUndefined();
  });
});

describe("secured/unsecured duplicate handling", () => {
  it("only counts one of a secured/unsecured pair with identical earn rates", () => {
    // Regression test: US Bank Cash+ and Cash+ Secured earn identically, so
    // both competing for the same 3 ranking slots meant a category could
    // show what's functionally the same card twice, crowding out a
    // genuinely different one.
    const cards = [
      makeSummary({
        id: "us-bank-cash-plus",
        name: "Cash+ Visa Signature Card",
        categories: [rate("Streaming", "5%")],
        secured_variant_id: "us-bank-cash-plus-secured",
      }),
      makeSummary({
        id: "us-bank-cash-plus-secured",
        name: "Cash+ Secured Visa Card",
        categories: [rate("Streaming", "5%")],
      }),
      makeSummary({ id: "other", name: "Other Card", categories: [rate("Streaming", "3%")] }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "streaming")!;
    expect(row.topChoice?.card.id).toBe("us-bank-cash-plus");
    expect(row.runnerUp?.card.id).toBe("other");
    expect(row.honorableMention).toBeUndefined();
  });

  it("still ranks a secured card that isn't a known identical-benefits duplicate", () => {
    // Capital One Quicksilver Secured genuinely earns less than unsecured
    // Quicksilver (no Entertainment bonus) — it should NOT be filtered out.
    const cards = [
      makeSummary({
        id: "capital-one-quicksilver-secured",
        name: "Quicksilver Secured Cash Rewards",
        categories: [rate("Restaurants", "1.5%")],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("capital-one-quicksilver-secured");
  });

  it("ranks a secured card normally when its unsecured counterpart isn't in the given set", () => {
    // Regression test: someone who only holds the secured card (e.g. the
    // Top Pick page's "my cards" filter, scoped to cards they actually
    // have) shouldn't have it silently zeroed out of every category just
    // because it's *capable* of being a duplicate when both are present.
    const cards = [
      makeSummary({
        id: "us-bank-cash-plus-secured",
        name: "Cash+ Secured Visa Card",
        categories: [rate("Streaming", "5%")],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "streaming")!;
    expect(row.topChoice?.card.id).toBe("us-bank-cash-plus-secured");
  });
});

describe("computeTopPicks ranking", () => {
  it("ranks the top 3 by value, descending", () => {
    const cards = [
      makeSummary({ id: "a", name: "A", categories: [rate("Restaurants", "3×")] }),
      makeSummary({ id: "b", name: "B", categories: [rate("Restaurants", "5×")] }),
      makeSummary({ id: "c", name: "C", categories: [rate("Restaurants", "4×")] }),
      makeSummary({ id: "d", name: "D", categories: [rate("Restaurants", "2×")] }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("b");
    expect(row.runnerUp?.card.id).toBe("c");
    expect(row.honorableMention?.card.id).toBe("a");
  });

  it("breaks value ties by lower annual fee, then name", () => {
    const cards = [
      makeSummary({
        id: "high-fee",
        name: "A",
        annual_fee: 500,
        categories: [rate("Restaurants", "4×")],
      }),
      makeSummary({
        id: "low-fee",
        name: "B",
        annual_fee: 0,
        categories: [rate("Restaurants", "4×")],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("low-fee");
    expect(row.runnerUp?.card.id).toBe("high-fee");
  });

  it("takes a card's best matching rate when it has more than one for the category", () => {
    const card = makeSummary({
      id: "x",
      categories: [rate("Gas stations", "2×"), rate("Gas & EV charging", "5×")],
    });
    const row = computeTopPicks([card]).find((r) => r.key === "gas-ev")!;
    expect(row.topChoice?.multiplier).toBe("5×");
  });

  it("doesn't let a cents-per-gallon discount outrank a real points multiplier", () => {
    // Regression test: "15¢/gal" parses its leading number as 15, which
    // would otherwise beat a genuine "6×" rate it isn't actually
    // comparable to — a fixed cents-off-per-gallon discount, not a
    // rewards multiplier (one such rate is literally labeled "not a
    // rewards rate" in the real catalog data).
    const cards = [
      makeSummary({
        id: "discount-card",
        name: "Discount Card",
        categories: [rate("Gas, discount at the pump, not a rewards rate", "15¢/gal")],
      }),
      makeSummary({
        id: "real-multiplier-card",
        name: "Real Multiplier Card",
        categories: [rate("Gas stations", "6×")],
      }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "gas-ev")!;
    expect(row.topChoice?.card.id).toBe("real-multiplier-card");
    // The discount card has no other rankable gas rate, so it's excluded
    // entirely rather than appearing in a lower slot with a misleading value.
    expect(row.runnerUp).toBeUndefined();
  });

  it("still ranks points-per-dollar multipliers normally (not excluded like cents-per-gallon)", () => {
    const cards = [
      makeSummary({ id: "a", name: "A", categories: [rate("Restaurants", "2 pts/$1")] }),
      makeSummary({ id: "b", name: "B", categories: [rate("Restaurants", "1 pt/$1")] }),
    ];
    const row = computeTopPicks(cards).find((r) => r.key === "dining")!;
    expect(row.topChoice?.card.id).toBe("a");
    expect(row.runnerUp?.card.id).toBe("b");
  });

  it("leaves rank slots undefined when there are no other cards to fall back to either", () => {
    const cards = [makeSummary({ id: "only", categories: [rate("Rent or mortgage", "1×")] })];
    const row = computeTopPicks(cards).find((r) => r.key === "rent")!;
    expect(row.topChoice?.card.id).toBe("only");
    expect(row.runnerUp).toBeUndefined();
    expect(row.honorableMention).toBeUndefined();
  });

  it("returns one row per category, in the requested display order", () => {
    const rows = computeTopPicks([]);
    expect(rows.map((r) => r.label)).toEqual(TOP_PICK_CATEGORIES.map((c) => c.label));
    expect(rows[rows.length - 1].label).toBe("Catch-All");
  });
});
