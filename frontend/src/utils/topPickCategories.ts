import type { CardSummary } from "../types/cards";
import { excludeHiddenSecuredCards, parseMultiplierValue } from "./cardTaxonomy";

/** Display order for the Top Pick page's section groupings. */
export const TOP_PICK_GROUPS = [
  "Common & Daily Spending",
  "Travel & Transportation",
  "Retail & Miscellaneous",
  "Overall",
] as const;

export type TopPickGroup = (typeof TOP_PICK_GROUPS)[number];

export interface TopPickCategory {
  key: string;
  label: string;
  emoji: string;
  description: string;
  group: TopPickGroup;
}

// Case-insensitive matchers over the free-text `earn_rates[].category`
// string surveyed across the whole catalog (181 distinct strings as of this
// writing). A rate can match more than one category on purpose — e.g. "Gas
// stations, grocery stores, and dining" counts toward Gas, Groceries, AND
// Dining, and a Citi Custom Cash-style "choose one" rate counts toward every
// category it lists, matching how the Compare tab's category filter already
// treats multi-category and choose-your-own-category rates. Catch-All is
// intentionally not text-matched here — see `matchesCategory` below.
// A handful of cards (e.g. Chase Sapphire Reserve's "Chase Travel portal")
// name their travel portal generically instead of itemizing what it covers,
// unlike "Eligible travel: airfare, hotels, car rentals, Costco Travel" or
// "Hotels, car rentals & attractions, booked via cititravel.com" — treated
// the same as an itemized one (you can book flights, hotels, AND cars
// through any of them) rather than silently only crediting Other Travel.
const GENERIC_TRAVEL_PORTAL = "travel (portal|purchases)|travel center";

export const CATEGORY_MATCHERS: Record<string, RegExp> = {
  dining: /restaurant|dining|caf[eé]|\bbars?\b|food delivery|doordash|grubhub|takeout|fast food/i,
  groceries: /grocery|groceries|supermarket/i,
  "gas-ev": /\bgas\b|gasoline|\bfuel\b|ev charging/i,
  streaming: /streaming|netflix|spotify|\bhulu\b|disney\+|espn/i,
  // "General Travel" splits into 4 rows — a rate can (and often does) match
  // more than one, e.g. "Travel: airfare, hotels, car rentals, cruises"
  // counts toward all four, same multi-match policy as everywhere else here.
  flights: new RegExp(
    `airfare|\\bairline|\\bflight|\\bunited\\b|\\bdelta\\b|\\bair\\b|${GENERIC_TRAVEL_PORTAL}`,
    "i",
  ),
  hotels: new RegExp(
    `\\bhotel|\\bmotel|vacation rental|vacation home|${GENERIC_TRAVEL_PORTAL}`,
    "i",
  ),
  "car-rentals": new RegExp(`car rentals?|rental cars?|${GENERIC_TRAVEL_PORTAL}`, "i"),
  "other-travel": /\btravel\b|\bcruise|timeshare/i,
  transit:
    /transit|rideshare|\buber\b|\blyft\b|subway|\btrain\b|\btolls?\b|\btaxi\b|\bparking\b|\bbus(es)?\b|\brides?\b|\brails?\b|ground transportation/i,
  "online-shopping": /online (shopping|retail|purchases)/i,
  wholesale: /wholesale club|costco|sam'?s club|\bbj'?s\b/i,
  // Generic store types only. A rate that names one retailer (Wayfair, Williams
  // Sonoma, Home Depot) is a single-store rate, so it can't match here at all.
  "home-improvement": /home improvement|hardware store|garden(ing)? (center|supply|store)|furniture/i,
  // Bills for electric, gas and water. Phone plans and internet had counted here,
  // which ranked phone-only rates above real utility rates; they have their own row.
  utilities: /\butilit(y|ies)\b/i,
  "phone-internet": /\bphone plans?\b|\bcell phones?\b|\bwireless\b|\binternet\b|\bcable\b/i,
  rent: /\brent\b|\bmortgage\b/i,
  drugstores: /drugstores?|drug stores?|\bpharmacy\b/i,
  entertainment: /entertainment|\bmovies?\b|\bconcerts?\b|amusement park/i,
  fitness: /fitness clubs?|\bgyms?\b/i,
};

/** Display order matches the order requested for the Top Pick page. */
export const TOP_PICK_CATEGORIES: TopPickCategory[] = [
  {
    key: "dining",
    label: "Dining",
    emoji: "🍽️",
    description: "Restaurants, fast food, bars, cafes, and food delivery services.",
    group: "Common & Daily Spending",
  },
  {
    key: "groceries",
    label: "Groceries",
    emoji: "🛒",
    description: "Supermarkets and local food markets (not wholesale clubs).",
    group: "Common & Daily Spending",
  },
  {
    key: "gas-ev",
    label: "Gas & EV Charging",
    emoji: "⛽",
    description: "Fuel stations and electric vehicle charging points.",
    group: "Common & Daily Spending",
  },
  {
    key: "streaming",
    label: "Streaming Services",
    emoji: "📺",
    description: "Monthly digital subscriptions for video and audio.",
    group: "Common & Daily Spending",
  },
  {
    key: "utilities",
    label: "Utilities",
    emoji: "💡",
    description: "Electric, gas and water bills.",
    group: "Common & Daily Spending",
  },
  {
    key: "phone-internet",
    label: "Phone & Internet",
    emoji: "📱",
    description: "Cell phone plans, home internet and cable TV.",
    group: "Common & Daily Spending",
  },
  {
    key: "rent",
    label: "Rent or Mortgage",
    emoji: "🏠",
    description: "Rent or mortgage payments on your home.",
    group: "Common & Daily Spending",
  },
  {
    key: "drugstores",
    label: "Drugstores",
    emoji: "💊",
    description: "Pharmacies and drugstores like CVS and Walgreens.",
    group: "Common & Daily Spending",
  },
  {
    key: "fitness",
    label: "Fitness & Gyms",
    emoji: "🏋️",
    description: "Gym and fitness club memberships.",
    group: "Common & Daily Spending",
  },
  {
    key: "flights",
    label: "Flights",
    emoji: "✈️",
    description: "Airfare, booked direct or through an airline or travel portal.",
    group: "Travel & Transportation",
  },
  {
    key: "hotels",
    label: "Hotels",
    emoji: "🏨",
    description: "Hotels, motels, and vacation rentals/homes.",
    group: "Travel & Transportation",
  },
  {
    key: "car-rentals",
    label: "Car Rentals",
    emoji: "🚗",
    description: "Rental cars, booked direct or through a travel portal.",
    group: "Travel & Transportation",
  },
  {
    key: "other-travel",
    label: "Other Travel",
    emoji: "🧳",
    description: "Cruises, timeshares, travel agencies, and general travel-portal spend that isn't specifically a flight, hotel, or rental car.",
    group: "Travel & Transportation",
  },
  {
    key: "transit",
    label: "Transit",
    emoji: "🚆",
    description: "Parking, public buses, subways, trains, tolls, taxis, and rideshare.",
    group: "Travel & Transportation",
  },
  {
    key: "online-shopping",
    label: "Online Shopping",
    emoji: "🛍️",
    description: "Digital purchases for retail, electronics, and clothing.",
    group: "Retail & Miscellaneous",
  },
  {
    key: "wholesale",
    label: "Wholesale Clubs",
    emoji: "🏬",
    description: "Bulk retailers like Costco, Sam's Club, and BJ's Wholesale.",
    group: "Retail & Miscellaneous",
  },
  {
    key: "home-improvement",
    label: "Home Improvement",
    emoji: "🔨",
    description: "Hardware stores, gardening supply shops, and furniture stores.",
    group: "Retail & Miscellaneous",
  },
  {
    key: "entertainment",
    label: "Entertainment",
    emoji: "🎬",
    description: "Movies, concerts, sporting events, amusement parks, and live entertainment tickets.",
    group: "Retail & Miscellaneous",
  },
  {
    key: "catch-all",
    label: "Catch-All",
    emoji: "💳",
    description: "Everything else, at the card's flat everyday rate.",
    group: "Overall",
  },
];

/** Whether a single earn-rate entry counts toward `categoryKey`. Catch-All
 * uses `is_base` (the schema's own flag for a card's flat "everything else"
 * rate) rather than text matching — that rate is phrased dozens of
 * different ways ("Everything else", "All other purchases", "Everywhere
 * else Visa is accepted", ...), so is_base is the only reliable signal. */
// A few co-brand cards mention "Costco"/"BJ's" inside a rate that's really
// about something else entirely — "Gas at Costco (worldwide)" is a Gas & EV
// Charging rate, "Eligible travel: ... Costco Travel" is a Flights/Hotels/
// Car Rentals/Other Travel rate — not a "shopping at the wholesale club"
// one, even though the wholesale matcher's brand-name keywords also fire on
// the text. Without this, the club's brand name alone would let an
// unrelated (and often higher) gas/travel rate outrank the card's actual
// in-club rate.
export const WHOLESALE_EXCLUDES = ["gas-ev", "flights", "hotels", "car-rentals", "other-travel"];

// A rate scoped to ONE specific airline/hotel/rideshare brand (not a
// booking-channel restriction like "via Amex Travel", which still applies
// to any airline/hotel booked that way) is real, but showing it as the Top
// Pick for the broad category is misleading — a United-flights-only 11x
// doesn't mean 11x on any airline, a Hilton-only 14x doesn't mean 14x at
// any hotel, and a Lyft-only 5x doesn't mean 5x on all transit (parking,
// tolls, trains, buses, Uber). Each card's actual best *broadly-applicable*
// rate for that category (if it has one) is what should compete here.
const SINGLE_AIRLINE_BRAND = /\bunited\b|\bdelta\b|\bsouthwest\b|american airlines/i;
const SINGLE_HOTEL_BRAND = /\bhilton\b|\bmarriott\b|\bihg\b|\bhyatt\b|choice hotels|choice privileges/i;
const SINGLE_RIDESHARE_BRAND = /\blyft\b|\buber\b/i;

export const BRAND_EXCLUDES: Record<string, RegExp> = {
  flights: SINGLE_AIRLINE_BRAND,
  hotels: SINGLE_HOTEL_BRAND,
  transit: SINGLE_RIDESHARE_BRAND,
};

// A rate counts toward a category only if most purchases in that category earn
// it. These are real rates that most purchases don't: Bilt's "Up to 6×" only at
// Bilt partner restaurants, Citi Strata Elite's 6× only on Friday and Saturday
// nights, the Costco Visa's 5% gas only at Costco, the Amazon Prime Visa's 5%
// only at Amazon and Whole Foods, the Disney Premier's 5% only on Disney+, Hulu
// and ESPN, and Sapphire Preferred's 3× only on online groceries. Ranking on
// them would put an advertised ceiling at the top of the category, so in every
// category the card's broadly applicable rate competes instead, as with
// BRAND_EXCLUDES. The rates still show on the card's own page.
//
// Three kinds of narrower rate do count, on purpose. A travel or entertainment
// portal rate, since any flight, hotel or ticket can be bought through the
// portal. A category you choose yourself (U.S. Bank Cash+, BofA Customized Cash),
// which ranks in each category it offers, because you earn it there if you choose
// it. And a single club's rate in Wholesale, since people usually belong to one.
//
// test_matcher_input_invariants fails on a new "Up to" rate this doesn't cover,
// or on a website-only rate in dining, groceries, gas or streaming.
// A rotating quarterly category needs activation every quarter, stops after a
// quarterly cap, and changes four times a year. A whole-catalog ranking answers
// "which card should I get", where none of that is settled, so it skips these.
// Someone ranking cards they already hold (ownCards) can activate, so it counts.
export const ROTATING_RATE = /\brotating\b|\bthis quarter\b/i;

export const LIMITED_RATE =
  /partner restaurants|citi nights|gas at costco|online groceries|amazon\.com|disneyplus\.com/i;

function matchesCategory(
  rate: CardSummary["categories"][number],
  categoryKey: string,
): boolean {
  if (categoryKey === "catch-all") return rate.is_base;
  if (!(CATEGORY_MATCHERS[categoryKey]?.test(rate.category) ?? false)) return false;
  if (LIMITED_RATE.test(rate.category)) return false;
  if (categoryKey === "wholesale") {
    return !WHOLESALE_EXCLUDES.some((key) => CATEGORY_MATCHERS[key].test(rate.category));
  }
  if (BRAND_EXCLUDES[categoryKey]?.test(rate.category)) return false;
  return true;
}

// A handful of rates in the catalog are a flat cents-off-per-gallon discount
// at the pump (e.g. "15¢/gal") rather than a points multiplier or cash-back
// percentage — one is even labeled "not a rewards rate" directly in its own
// category text. `parseMultiplierValue` extracts the leading number from
// any of these formats, so "15¢/gal" would otherwise parse as 15 and
// outrank a genuine "6×"/"6%" rate it isn't actually comparable to. Points-
// per-dollar formats ("2 pts/$1") are fine to rank as-is — that IS a real
// multiplier — this only excludes the cents-per-gallon discount format.
export const CENTS_PER_GALLON = /¢\s*\/\s*gal/i;

function isRankableMultiplier(multiplier: string): boolean {
  return !CENTS_PER_GALLON.test(multiplier);
}

// A "%" rate (cash back, or a merchant-currency card's statement-credit-
// equivalent rewards) already directly states cents earned per dollar spent
// — "6%" means 6 cents per dollar, full stop. It should NOT also be
// multiplied by the card's best_cpp: best_cpp reflects the card's best
// points *transfer* value, which has nothing to do with a specific rate
// that's already denominated as a flat percentage. (Every %-earning card's
// OWN redemption options are cpp 1.0, so multiplying would be a no-op for
// them anyway — this guard only actually matters for a points_pool_id card,
// see toEntry: Chase Freedom Flex/Unlimited display their Ultimate Rewards
// earn rate as "%" purely because their own best_cpp is 1.0 in isolation,
// but that's not a hard cash guarantee the way real cash-back currency is —
// once pooled into a Sapphire account, the same "5%" is really 5x points
// worth more than 1¢ each.)
function isPercentMultiplier(multiplier: string): boolean {
  return multiplier.includes("%");
}

export interface TopPickEntry {
  card: CardSummary;
  /** Effective cents earned per dollar spent (rawMultiplier × card.best_cpp)
   * — the actual ranking metric. A cash-back card's best_cpp is 1.0, so its
   * raw "%" already equals this; a points card's raw "×" needs its point
   * value factored in to be comparable at all (6x Hilton points at 0.5¢
   * each is worth less than 3x Chase points at 2¢ each). */
  effectiveValue: number;
  /** The winning rate's original display label (e.g. "5×", "3%") — for
   * display; ranking uses `effectiveValue`, not this parsed directly. */
  multiplier: string;
  /** True when this slot isn't a real category-specific bonus — it's the
   * card's flat everyday/catch-all rate, shown only because fewer than 3
   * cards actually have a bonus for this category. Real bonus matches
   * always fill slots first, regardless of value, so a weak specific bonus
   * (e.g. 2% at a wholesale club) is never bumped by a stronger flat rate
   * (e.g. 5% cash back everywhere) — the point of this row is "what's
   * actually good for this category," not just "what's your best card." */
  isFallback: boolean;
  /** True when this card's effective value was boosted above its own
   * best_cpp by pooling into another held card's account (Chase Ultimate
   * Rewards: Freedom Flex/Unlimited into Sapphire Preferred/Reserve) — only
   * ever true when computeTopPicks was called with applyPointsPooling. */
  isPooled: boolean;
}

export interface TopPickRow extends TopPickCategory {
  topChoice: TopPickEntry | undefined;
  runnerUp: TopPickEntry | undefined;
  honorableMention: TopPickEntry | undefined;
}

/** The card's best (highest) matching rate for `categoryKey`, across
 * whichever of its rates match — a card can have more than one matching
 * rate (e.g. both a "Gas & EV charging" and a "Gas stations" line), so this
 * takes the max rather than the first. Undefined if none of the card's
 * rates match this category at all. */
function bestRateForCategory(
  card: CardSummary,
  categoryKey: string,
  ownCards = false,
): { value: number; multiplier: string } | undefined {
  let best: { value: number; multiplier: string } | undefined;
  for (const rate of card.categories) {
    if (!matchesCategory(rate, categoryKey)) continue;
    if (!ownCards && ROTATING_RATE.test(rate.category)) continue;
    if (!isRankableMultiplier(rate.multiplier)) continue;
    const value = parseMultiplierValue(rate.multiplier);
    if (!best || value > best.value) best = { value, multiplier: rate.multiplier };
  }
  return best;
}

/** The card's flat "everything else" rate (is_base), if it has one and it's
 * rankable — the fallback source when a category doesn't have 3 cards with
 * an actual bonus for it. */
function catchAllRateFor(card: CardSummary): { value: number; multiplier: string } | undefined {
  const rate = card.categories.find((r) => r.is_base);
  if (!rate || !isRankableMultiplier(rate.multiplier)) return undefined;
  return { value: parseMultiplierValue(rate.multiplier), multiplier: rate.multiplier };
}

/** The cents-per-point value to use for `card` in this ranking pass — its
 * own best_cpp, unless points-pooling is being applied and a *receiver*
 * card in `pool` (the exact set of cards being ranked: the whole catalog,
 * or a "My Cards" selection) shares its points_pool_id with a higher
 * best_cpp. A real Ultimate Rewards/ThankYou Points account blends into
 * one balance once combined, so every pool member inherits the best
 * redemption path any receiver in the pool unlocks. Only a receiver
 * (points_pool_receiver — Sapphire Preferred/Reserve, Strata Premier/
 * Elite) can be the source of a boost: two feeder cards sharing a pool id
 * (e.g. Citi Double Cash + plain Strata, whose own best_cpp values differ)
 * must NOT boost each other with no receiver actually held, since real-
 * world transfer-partner access requires an active premium account in the
 * mix, not just any two linked cards. Never boosts catalog-wide — see
 * computeTopPicks's applyPointsPooling param — pooling requires actually
 * holding the cards, which the default whole-catalog ranking has no way
 * to know. */
function effectiveCppFor(card: CardSummary, pool: CardSummary[], applyPointsPooling: boolean): number {
  if (!applyPointsPooling || !card.points_pool_id) return card.best_cpp;
  return Math.max(
    card.best_cpp,
    ...pool
      .filter(
        (c) => c.id !== card.id && c.points_pool_id === card.points_pool_id && c.points_pool_receiver,
      )
      .map((c) => c.best_cpp),
  );
}

function toEntry(
  card: CardSummary,
  rate: { value: number; multiplier: string },
  isFallback: boolean,
  effectiveCpp: number,
): TopPickEntry {
  const isPooled = effectiveCpp > card.best_cpp;
  // See isPercentMultiplier's doc comment: a points_pool_id card's "%" rate
  // isn't a hard cash guarantee the way real cash-back currency is, so once
  // pooling has actually boosted it above its own best_cpp, treat it as the
  // point multiplier it really is instead of a literal percent.
  const treatAsLiteralPercent = isPercentMultiplier(rate.multiplier) && !isPooled;
  return {
    card,
    effectiveValue: treatAsLiteralPercent ? rate.value : rate.value * effectiveCpp,
    multiplier: rate.multiplier,
    isFallback,
    isPooled,
  };
}

/** Highest effective value first; ties broken by lower annual fee (the more
 * fee-efficient card is the better recommendation at an equal rate), then
 * name. Deliberately not the existing `byFeeDescThenName` from
 * cardTaxonomy.ts — that sorts fee *descending* for "flagship first"
 * display elsewhere, the opposite of what a best-pick ranking wants.
 * Rounded to 4 decimal places before comparing so floating-point noise from
 * the multiplication (e.g. 3 × 2.05) can't manufacture a fake tiebreak. */
function byValueDescThenFeeAscThenName(
  a: TopPickEntry,
  b: TopPickEntry,
): number {
  const av = Math.round(a.effectiveValue * 10000);
  const bv = Math.round(b.effectiveValue * 10000);
  if (av !== bv) return bv - av;
  if (a.card.annual_fee !== b.card.annual_fee) return a.card.annual_fee - b.card.annual_fee;
  return a.card.name.localeCompare(b.card.name);
}

export interface ComputeTopPicksOptions {
  /** Apply cross-card points-pooling (see effectiveCppFor) — only makes
   * sense when `cards` is a "My Cards" selection of what someone actually
   * holds, never the whole-catalog default ranking, since pooling requires
   * actually holding both the feeder and receiver card. Defaults to false
   * so every existing catalog-wide call site is unaffected. */
  applyPointsPooling?: boolean;
  /** The cards are ones someone holds, not the whole catalog. Rates and cards
   * that only a holder can use (a rotating quarterly category) then count. */
  ownCards?: boolean;
}

/** Every real-bonus entry for one category, sorted, with fallbacks appended up
 * to 3 total. Takes the already-deduped cards and pool-adjusted cpp map so a
 * full computeTopPicks pass computes them once, not once per category. */
/** Whether a card belongs in a whole-catalog ranking for this category. A card
 * closed to new applicants can't be got, and a store-only card's rewards are
 * worth their cents-per-point only to someone who shops at that store, so both
 * sit out, except a store-only card in Wholesale, where one club is the norm.
 * Someone ranking cards they hold (ownCards) keeps both, since they still use them. */
function competesInCatalog(card: CardSummary, categoryKey: string): boolean {
  if (card.open_to_new_applicants === false) return false;
  if (card.rewards_redeemable === "store_only") return categoryKey === "wholesale";
  return true;
}

function rankWithin(
  deduped: CardSummary[],
  categoryKey: string,
  effectiveCppById: Map<string, number>,
  ownCards: boolean,
): TopPickEntry[] {
  const entries: TopPickEntry[] = [];
  for (const card of deduped) {
    if (!ownCards && !competesInCatalog(card, categoryKey)) continue;
    const best = bestRateForCategory(card, categoryKey, ownCards);
    if (best) entries.push(toEntry(card, best, false, effectiveCppById.get(card.id)!));
  }
  entries.sort(byValueDescThenFeeAscThenName);

  // Fewer than 3 cards have an actual bonus for this category (common for
  // the narrower ones — Rent or Mortgage, Fitness & Gyms, ...) — rather
  // than just leave the remaining slot(s) blank, fill them with the next-
  // best flat/catch-all rate among the cards that don't already have a
  // real bonus here, so there's still a concrete answer to "what should I
  // use instead." Not done for the Catch-All row itself — every card's
  // own catch-all rate is already exactly what that row already ranks by.
  if (entries.length < 3 && categoryKey !== "catch-all") {
    const alreadyUsed = new Set(entries.map((e) => e.card.id));
    const fallbacks: TopPickEntry[] = [];
    for (const card of deduped) {
      if (alreadyUsed.has(card.id)) continue;
      if (!ownCards && !competesInCatalog(card, categoryKey)) continue;
      const catchAll = catchAllRateFor(card);
      if (catchAll) fallbacks.push(toEntry(card, catchAll, true, effectiveCppById.get(card.id)!));
    }
    fallbacks.sort(byValueDescThenFeeAscThenName);
    entries.push(...fallbacks.slice(0, 3 - entries.length));
  }
  return entries;
}

function prepareRanking(cards: CardSummary[], options: ComputeTopPicksOptions) {
  const { applyPointsPooling = false, ownCards = false } = options;
  // A secured card with byte-identical earn rates to its unsecured twin
  // (CardSummary.secured_variant_id, set only on the unsecured card) is the
  // same card in every way that matters here, and showing both just crowds
  // out a genuinely different card's ranking slot. excludeHiddenSecuredCards
  // only drops it when the unsecured twin is ALSO among `cards` — e.g. the
  // "my cards" filter, scoped to what someone actually holds, might contain
  // only the secured one, and dropping it unconditionally there would
  // wrongly zero it out of every category.
  const deduped = excludeHiddenSecuredCards(cards);
  // Computed once per card, not per category — every category's ranking for
  // a given card uses the exact same pool-boosted (or not) cpp.
  const effectiveCppById = new Map<string, number>(
    deduped.map((card) => [card.id, effectiveCppFor(card, deduped, applyPointsPooling)]),
  );
  return { deduped, effectiveCppById, ownCards };
}

/** One category's full ranking, past the top 3 that computeTopPicks shows.
 * The MCP server's Python port is pinned to this: see
 * tests/fixtures/ranking_parity and frontend/tests/utils/rankingParity.test.ts. */
export function rankCategory(
  cards: CardSummary[],
  categoryKey: string,
  options: ComputeTopPicksOptions = {},
): TopPickEntry[] {
  const { deduped, effectiveCppById, ownCards } = prepareRanking(cards, options);
  return rankWithin(deduped, categoryKey, effectiveCppById, ownCards);
}

/** Ranks the whole catalog into the top 3 cards per category by *effective*
 * earn rate — raw multiplier weighted by the card's best cents-per-point
 * value (best_cpp; 1.0 for flat cash back), so a 6x points card isn't
 * automatically ranked above a 3x card whose points are worth 4x as much.
 * Categories with fewer than 3 cards carrying an actual bonus have their
 * remaining slot(s) backfilled with the next-best flat/catch-all rate among
 * the rest (marked `isFallback`) rather than left blank — see rankWithin for
 * why those never outrank a real bonus regardless of value. Known limitation:
 * still doesn't account for spending caps or activation requirements on a
 * given rate, and best_cpp is one number per card (the best realistic
 * redemption across the board), not category-specific. */
export function computeTopPicks(
  cards: CardSummary[],
  options: ComputeTopPicksOptions = {},
): TopPickRow[] {
  const { deduped, effectiveCppById, ownCards } = prepareRanking(cards, options);
  return TOP_PICK_CATEGORIES.map((category) => {
    const entries = rankWithin(deduped, category.key, effectiveCppById, ownCards);
    return {
      ...category,
      topChoice: entries[0],
      runnerUp: entries[1],
      honorableMention: entries[2],
    };
  });
}
