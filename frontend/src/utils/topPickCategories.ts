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

const CATEGORY_MATCHERS: Record<string, RegExp> = {
  dining: /restaurant|dining|caf[eé]|\bbars?\b|food delivery|doordash|grubhub|takeout|fast food/i,
  groceries: /grocery|groceries|supermarket|whole foods/i,
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
  "home-improvement":
    /home improvement|hardware store|garden(ing)? (center|supply|store)|furniture|wayfair|williams sonoma|pottery barn|west elm|home depot|lowe'?s|ace hardware|rejuvenation|joss & main|allmodern|birch lane|perigold|mark & graham/i,
  utilities: /\butilit(y|ies)\b|phone plan|internet.{0,25}phone|cable.{0,20}phone|\bat&t\b|cell phone/i,
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
    description: "Electric, gas, water, and home internet or phone bills.",
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
const WHOLESALE_EXCLUDES = ["gas-ev", "flights", "hotels", "car-rentals", "other-travel"];

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

const BRAND_EXCLUDES: Record<string, RegExp> = {
  flights: SINGLE_AIRLINE_BRAND,
  hotels: SINGLE_HOTEL_BRAND,
  transit: SINGLE_RIDESHARE_BRAND,
};

function matchesCategory(
  rate: CardSummary["categories"][number],
  categoryKey: string,
): boolean {
  if (categoryKey === "catch-all") return rate.is_base;
  if (!(CATEGORY_MATCHERS[categoryKey]?.test(rate.category) ?? false)) return false;
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
const CENTS_PER_GALLON = /¢\s*\/\s*gal/i;

function isRankableMultiplier(multiplier: string): boolean {
  return !CENTS_PER_GALLON.test(multiplier);
}

// A "%" rate (cash back, or a merchant-currency card's statement-credit-
// equivalent rewards) already directly states cents earned per dollar spent
// — "6%" means 6 cents per dollar, full stop. It should NOT also be
// multiplied by the card's best_cpp: best_cpp reflects the card's best
// points *transfer* value, which has nothing to do with a specific rate
// that's already denominated as a flat percentage. (In today's catalog
// every %-earning card's redemption options happen to be cpp 1.0 anyway,
// so this doesn't change any current ranking — it's a correctness
// guarantee for the calculation, not dependent on that data coincidence.)
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
): { value: number; multiplier: string } | undefined {
  let best: { value: number; multiplier: string } | undefined;
  for (const rate of card.categories) {
    if (!matchesCategory(rate, categoryKey)) continue;
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

function toEntry(
  card: CardSummary,
  rate: { value: number; multiplier: string },
  isFallback: boolean,
): TopPickEntry {
  return {
    card,
    effectiveValue: isPercentMultiplier(rate.multiplier) ? rate.value : rate.value * card.best_cpp,
    multiplier: rate.multiplier,
    isFallback,
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

/** Ranks the whole catalog into the top 3 cards per category by *effective*
 * earn rate — raw multiplier weighted by the card's best cents-per-point
 * value (best_cpp; 1.0 for flat cash back), so a 6x points card isn't
 * automatically ranked above a 3x card whose points are worth 4x as much.
 * Categories with fewer than 3 cards carrying an actual bonus have their
 * remaining slot(s) backfilled with the next-best flat/catch-all rate among
 * the rest (marked `isFallback`) rather than left blank — see the inline
 * comment below for why those never outrank a real bonus regardless of
 * value. Known limitation: still doesn't account for spending caps or
 * activation requirements on a given rate, and best_cpp is one number per
 * card (the best realistic redemption across the board), not category-
 * specific — nor does it account for cross-card points pooling (e.g. a
 * Chase Freedom card's points are worth more once transferred into a
 * Sapphire Reserve account than they are alone). */
export function computeTopPicks(cards: CardSummary[]): TopPickRow[] {
  // A secured card with byte-identical earn rates to its unsecured twin
  // (CardSummary.secured_variant_id, set only on the unsecured card) is the
  // same card in every way that matters here, and showing both just crowds
  // out a genuinely different card's ranking slot. excludeHiddenSecuredCards
  // only drops it when the unsecured twin is ALSO among `cards` — e.g. the
  // "my cards" filter, scoped to what someone actually holds, might contain
  // only the secured one, and dropping it unconditionally there would
  // wrongly zero it out of every category.
  const deduped = excludeHiddenSecuredCards(cards);
  return TOP_PICK_CATEGORIES.map((category) => {
    const entries: TopPickEntry[] = [];
    for (const card of deduped) {
      const best = bestRateForCategory(card, category.key);
      if (best) entries.push(toEntry(card, best, false));
    }
    entries.sort(byValueDescThenFeeAscThenName);

    // Fewer than 3 cards have an actual bonus for this category (common for
    // the narrower ones — Rent or Mortgage, Fitness & Gyms, ...) — rather
    // than just leave the remaining slot(s) blank, fill them with the next-
    // best flat/catch-all rate among the cards that don't already have a
    // real bonus here, so there's still a concrete answer to "what should I
    // use instead." Not done for the Catch-All row itself — every card's
    // own catch-all rate is already exactly what that row already ranks by.
    if (entries.length < 3 && category.key !== "catch-all") {
      const alreadyUsed = new Set(entries.map((e) => e.card.id));
      const fallbacks: TopPickEntry[] = [];
      for (const card of deduped) {
        if (alreadyUsed.has(card.id)) continue;
        const catchAll = catchAllRateFor(card);
        if (catchAll) fallbacks.push(toEntry(card, catchAll, true));
      }
      fallbacks.sort(byValueDescThenFeeAscThenName);
      entries.push(...fallbacks.slice(0, 3 - entries.length));
    }

    return {
      ...category,
      topChoice: entries[0],
      runnerUp: entries[1],
      honorableMention: entries[2],
    };
  });
}
