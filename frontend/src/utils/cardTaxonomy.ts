import type { Card, CardSummary } from "../types/cards";

// Multiplier strings aren't uniformly formatted ("5×", "3%", "15¢/gal", "Up to
// 4×", "Points on Star Money Days"), so this pulls out the first number found
// and treats unparseable ones as lowest-priority rather than crashing a sort.
export function parseMultiplierValue(multiplier: string): number {
  const match = multiplier.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : -Infinity;
}

// ─── Issuers ──────────────────────────────────────────────────────────────────
// `issuer` as returned by the API -> a URL-safe slug + display label.

export interface IssuerInfo {
  slug: string;
  label: string;
  issuerField: string;
}

export const ISSUERS: IssuerInfo[] = [
  { slug: "amex", label: "American Express", issuerField: "American Express" },
  { slug: "chase", label: "Chase", issuerField: "Chase" },
  { slug: "capital-one", label: "Capital One", issuerField: "Capital One" },
  { slug: "citi", label: "Citi", issuerField: "Citi" },
  { slug: "us-bank", label: "U.S. Bank", issuerField: "U.S. Bank" },
  { slug: "bofa", label: "Bank of America", issuerField: "Bank of America" },
  { slug: "bilt", label: "Bilt", issuerField: "Bilt" },
  { slug: "wells-fargo", label: "Wells Fargo", issuerField: "Wells Fargo" },
];

export function getIssuerBySlug(slug: string | undefined): IssuerInfo | undefined {
  return ISSUERS.find((i) => i.slug === slug);
}

// ─── Card classification ───────────────────────────────────────────────────────
// Every card is either the issuer's own "personal" product, an airline
// co-brand, a hotel co-brand, or some other co-branded partner card.
//
// This is a hand-authored table rather than something inferred from
// `points_program` at runtime: several unrelated cards legitimately share the
// same points_program string (e.g. "Cash Back" covers both core products
// like Amex Blue Cash and true co-brands like Chase's Amazon Prime Visa and
// Citi's Costco Anywhere Visa), so there's no reliable heuristic — the id
// naming convention ({issuer}-{brand}-{type} for co-brands) already encodes
// this correctly, so this table just restates it explicitly, verified
// against the actual card catalog.

export type CardGroup = "personal" | "airline" | "hotel" | "cobrand";

interface Classification {
  group: CardGroup;
  /** Display name for hotel/airline/cobrand sub-grouping and filter chips. Absent for "personal". */
  brand?: string;
}

// Exported (rather than kept module-private) so a test can assert every real
// card id in the backend catalog has an explicit entry here — an unlisted id
// silently falls back to "personal" in `classify()`, which would misfile a
// new co-branded card into the wrong section without anyone noticing.
export const CLASSIFICATION: Record<string, Classification> = {
  // ── Amex ──
  "amex-blue-cash-everyday": { group: "personal" },
  "amex-blue-cash-preferred": { group: "personal" },
  "amex-delta-skymiles-blue": { group: "airline", brand: "Delta SkyMiles" },
  "amex-delta-skymiles-gold": { group: "airline", brand: "Delta SkyMiles" },
  "amex-delta-skymiles-platinum": { group: "airline", brand: "Delta SkyMiles" },
  "amex-delta-skymiles-reserve": { group: "airline", brand: "Delta SkyMiles" },
  "amex-gold": { group: "personal" },
  "amex-green": { group: "personal" },
  "amex-hilton-honors-aspire": { group: "hotel", brand: "Hilton Honors" },
  "amex-hilton-honors-surpass": { group: "hotel", brand: "Hilton Honors" },
  "amex-hilton-honors": { group: "hotel", brand: "Hilton Honors" },
  "amex-marriott-bonvoy-bevy": { group: "hotel", brand: "Marriott Bonvoy" },
  "amex-marriott-bonvoy-brilliant": { group: "hotel", brand: "Marriott Bonvoy" },
  "amex-platinum": { group: "personal" },

  // ── Chase ──
  "chase-amazon-prime-visa": { group: "cobrand", brand: "Amazon" },
  "chase-disney-premier": { group: "cobrand", brand: "Disney" },
  "chase-freedom-flex": { group: "personal" },
  "chase-freedom-rise": { group: "personal" },
  "chase-freedom-unlimited": { group: "personal" },
  "chase-ihg-one-rewards-premier": { group: "hotel", brand: "IHG One Rewards" },
  "chase-ihg-one-rewards-traveler": { group: "hotel", brand: "IHG One Rewards" },
  "chase-marriott-bonvoy-bold": { group: "hotel", brand: "Marriott Bonvoy" },
  "chase-marriott-bonvoy-boundless": { group: "hotel", brand: "Marriott Bonvoy" },
  "chase-sapphire-preferred": { group: "personal" },
  "chase-sapphire-reserve": { group: "personal" },
  "chase-slate-edge": { group: "personal" },
  "chase-southwest-rapid-rewards-plus": { group: "airline", brand: "Southwest Rapid Rewards" },
  "chase-southwest-rapid-rewards-premier": { group: "airline", brand: "Southwest Rapid Rewards" },
  "chase-southwest-rapid-rewards-priority": { group: "airline", brand: "Southwest Rapid Rewards" },
  "chase-united-club-infinite": { group: "airline", brand: "United MileagePlus" },
  "chase-united-explorer": { group: "airline", brand: "United MileagePlus" },
  "chase-united-quest": { group: "airline", brand: "United MileagePlus" },
  "chase-world-of-hyatt": { group: "hotel", brand: "World of Hyatt" },

  // ── Capital One ──
  "capital-one-bass-pro-cabelas-club": { group: "cobrand", brand: "Bass Pro Shops & Cabela's" },
  "capital-one-bjs-one-plus": { group: "cobrand", brand: "BJ's" },
  "capital-one-bjs-one": { group: "cobrand", brand: "BJ's" },
  "capital-one-key-rewards": { group: "cobrand", brand: "Williams-Sonoma Family" },
  "capital-one-kohls-rewards": { group: "cobrand", brand: "Kohl's" },
  "capital-one-platinum-secured": { group: "personal" },
  "capital-one-platinum": { group: "personal" },
  "capital-one-quicksilver-one": { group: "personal" },
  "capital-one-quicksilver-secured": { group: "personal" },
  "capital-one-quicksilver": { group: "personal" },
  "capital-one-rei-co-op": { group: "cobrand", brand: "REI Co-op" },
  "capital-one-savor-one": { group: "personal" },
  "capital-one-savor": { group: "personal" },
  "capital-one-tmobile": { group: "cobrand", brand: "T-Mobile" },
  "capital-one-venture-one": { group: "personal" },
  "capital-one-venture-x": { group: "personal" },
  "capital-one-venture": { group: "personal" },

  // ── Citi ──
  "citi-aadvantage-executive": { group: "airline", brand: "American Airlines AAdvantage" },
  "citi-aadvantage-globe": { group: "airline", brand: "American Airlines AAdvantage" },
  "citi-aadvantage-mileup": { group: "airline", brand: "American Airlines AAdvantage" },
  "citi-aadvantage-platinum-select": { group: "airline", brand: "American Airlines AAdvantage" },
  "citi-att-points-plus": { group: "cobrand", brand: "AT&T" },
  "citi-best-buy-visa": { group: "cobrand", brand: "Best Buy" },
  "citi-bloomingdales": { group: "cobrand", brand: "Bloomingdale's" },
  "citi-costco-anywhere-visa": { group: "cobrand", brand: "Costco" },
  "citi-diamond-preferred": { group: "personal" },
  "citi-dillards": { group: "cobrand", brand: "Dillard's" },
  "citi-double-cash": { group: "personal" },
  "citi-exxonmobil-smart-card-plus": { group: "cobrand", brand: "ExxonMobil" },
  "citi-goodyear": { group: "cobrand", brand: "Goodyear" },
  "citi-home-depot-consumer": { group: "cobrand", brand: "Home Depot" },
  "citi-llbean": { group: "cobrand", brand: "L.L.Bean" },
  "citi-macys": { group: "cobrand", brand: "Macy's" },
  "citi-secured": { group: "personal" },
  "citi-simplicity": { group: "personal" },
  "citi-strata-elite": { group: "personal" },
  "citi-strata-premier": { group: "personal" },
  "citi-strata": { group: "personal" },
  "citi-tractor-supply": { group: "cobrand", brand: "Tractor Supply" },
  "citi-wayfair": { group: "cobrand", brand: "Wayfair" },

  // ── U.S. Bank ──
  "us-bank-altitude-connect": { group: "personal" },
  "us-bank-altitude-go-secured": { group: "personal" },
  "us-bank-altitude-go": { group: "personal" },
  "us-bank-cash-plus-secured": { group: "personal" },
  "us-bank-cash-plus": { group: "personal" },
  "us-bank-secured": { group: "personal" },
  "us-bank-shield": { group: "personal" },
  "us-bank-smartly": { group: "personal" },
  "us-bank-split": { group: "personal" },

  // ── Bank of America ──
  "bofa-customized-cash-rewards": { group: "personal" },
  "bofa-unlimited-cash-rewards": { group: "personal" },
  "bofa-bankamericard": { group: "personal" },
  "bofa-travel-rewards": { group: "personal" },
  "bofa-premium-rewards": { group: "personal" },
  "bofa-premium-rewards-elite": { group: "personal" },
  "bofa-cash-rewards-secured": { group: "personal" },
  "bofa-unlimited-cash-rewards-secured": { group: "personal" },
  "bofa-bankamericard-secured": { group: "personal" },
  "bofa-travel-rewards-secured": { group: "personal" },

  // ── Bilt ──
  "bilt-blue": { group: "personal" },
  "bilt-obsidian": { group: "personal" },
  "bilt-palladium": { group: "personal" },

  // ── Wells Fargo ──
  "wells-fargo-active-cash": { group: "personal" },
  "wells-fargo-reflect": { group: "personal" },
  "wells-fargo-autograph": { group: "personal" },
  "wells-fargo-autograph-journey": { group: "personal" },
  "wells-fargo-one-key": { group: "cobrand", brand: "Expedia One Key" },
  "wells-fargo-one-key-plus": { group: "cobrand", brand: "Expedia One Key" },
  "wells-fargo-choice-privileges": { group: "hotel", brand: "Choice Privileges" },
  "wells-fargo-choice-privileges-select": { group: "hotel", brand: "Choice Privileges" },
};

export function classify(cardId: string): Classification {
  return CLASSIFICATION[cardId] ?? { group: "personal" };
}

// ─── "All Cards" grouping for the issuer page ──────────────────────────────────

export interface CardSection {
  label: string;
  cards: CardSummary[];
}

/** Groups an issuer's cards into Personal / Airline / Hotel (one section per
 * brand) / Other Co-Branded, in that display order. Empty sections are omitted. */
/** Highest annual fee first; ties broken alphabetically by name. */
function byFeeDescThenName(a: CardSummary, b: CardSummary): number {
  if (a.annual_fee !== b.annual_fee) return b.annual_fee - a.annual_fee;
  return a.name.localeCompare(b.name);
}

export function groupCardsForAllView(cards: CardSummary[]): CardSection[] {
  const flagship: CardSummary[] = [];
  const airlineByBrand = new Map<string, CardSummary[]>();
  const hotelByBrand = new Map<string, CardSummary[]>();
  const cobrand: CardSummary[] = [];

  for (const card of cards) {
    const c = classify(card.id);
    if (c.group === "personal") {
      flagship.push(card);
    } else if (c.group === "airline") {
      const brand = c.brand ?? "Airline";
      if (!airlineByBrand.has(brand)) airlineByBrand.set(brand, []);
      airlineByBrand.get(brand)!.push(card);
    } else if (c.group === "hotel") {
      const brand = c.brand ?? "Hotel";
      if (!hotelByBrand.has(brand)) hotelByBrand.set(brand, []);
      hotelByBrand.get(brand)!.push(card);
    } else {
      cobrand.push(card);
    }
  }

  const sections: CardSection[] = [];
  if (flagship.length > 0) {
    sections.push({ label: "Flagship Cards", cards: [...flagship].sort(byFeeDescThenName) });
  }
  // One section per airline/hotel program, always named after its brand
  // (e.g. "Delta SkyMiles Cards", "Southwest Rapid Rewards Cards") — even
  // when an issuer only has one program in that group, so naming stays
  // consistent across issuers instead of collapsing to a generic label.
  for (const byBrand of [airlineByBrand, hotelByBrand]) {
    const brands = [...byBrand.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [brand, brandCards] of brands) {
      sections.push({ label: `${brand} Cards`, cards: [...brandCards].sort(byFeeDescThenName) });
    }
  }
  if (cobrand.length > 0) {
    sections.push({ label: "Other Co-Branded Cards", cards: [...cobrand].sort(byFeeDescThenName) });
  }

  return sections;
}

// ─── Sorting a single category-filtered view ───────────────────────────────────
// Unlike the "All Cards" view (grouped into one section per brand), a
// category filter (Dining, Gas, a brand, ...) shows one flat grid — but it
// should still surface the issuer's own flagship cards before airline/hotel
// co-brands before other co-brands, and within each of those, the card that
// actually earns the most in the selected category first.

/** Regexes shared with `detailTags` so a card's earn-rate categories are
 * matched identically whether deriving its tags or ranking it within a filter. */
const CATEGORY_TAG_MATCHERS: Record<string, RegExp> = {
  Dining: /dining|restaurant/,
  Gas: /\bgas\b|fuel station|ev charging/,
};

/** 0 = the issuer's own flagship product, 1 = an airline/hotel co-brand
 * (shown together, unlike the per-brand sectioning in the "All Cards" view),
 * 2 = any other co-branded partner card. */
function groupRank(cardId: string): number {
  const group = classify(cardId).group;
  if (group === "personal") return 0;
  if (group === "airline" || group === "hotel") return 1;
  return 2;
}

/** The card's best multiplier in the filter's earn-rate category, or null if
 * the filter isn't a category with a meaningful multiplier to rank by (a
 * brand name, "Airline", "No Annual Fee", ...) or the card detail hasn't
 * loaded yet. */
function categoryRelevance(detail: Card | undefined, filter: string): number | null {
  const matcher = CATEGORY_TAG_MATCHERS[filter];
  if (!matcher || !detail) return null;
  let best: number | null = null;
  for (const rate of detail.earn_rates) {
    if (matcher.test(rate.category.toLowerCase())) {
      const value = parseMultiplierValue(rate.multiplier);
      if (best === null || value > best) best = value;
    }
  }
  return best;
}

/** Orders a category/brand-filtered list of cards: flagship, then
 * airline/hotel co-brands, then other co-brands; within each, the card most
 * relevant to `filter` first (by earn-rate multiplier where that means
 * something, otherwise highest annual fee, then name). */
export function sortFilteredCards(
  cards: CardSummary[],
  filter: string,
  detailsById: Map<string, Card>,
): CardSummary[] {
  // Computed once per card up front (like tagMap/detailsById in the caller)
  // rather than inside the comparator, where a sort re-evaluates it O(n log n)
  // times instead of O(n).
  const ranks = new Map(cards.map((c) => [c.id, groupRank(c.id)]));

  return [...cards].sort((a, b) => {
    const rankDiff = ranks.get(a.id)! - ranks.get(b.id)!;
    if (rankDiff !== 0) return rankDiff;

    const relA = categoryRelevance(detailsById.get(a.id), filter);
    const relB = categoryRelevance(detailsById.get(b.id), filter);
    if (relA !== null || relB !== null) {
      if (relA === null) return 1;
      if (relB === null) return -1;
      if (relA !== relB) return relB - relA;
    }

    return byFeeDescThenName(a, b);
  });
}

// ─── Filter chips ─────────────────────────────────────────────────────────────
// Chips that need only summary-level data (annual fee, group/brand) are
// derivable immediately. The richer behavioral chips (Dining, Gas, Lounge
// Access, Balance Transfer, 0% Intro APR, No Foreign Transaction Fee) read
// real fields off the full Card detail — never guessed — so callers pass in
// full Card objects once they've been fetched.

export const ALL_CARDS_FILTER = "All Cards";

/** Dining/Gas chips derived from a set of earn-rate category labels — shared
 * between `summaryTags` (CardSummary.categories, label strings only) and
 * `detailTags` (full Card.earn_rates) so the same card matches identically
 * regardless of which one supplied the labels. */
function categoryTags(categories: string[]): string[] {
  const tags: string[] = [];
  const joined = categories.map((c) => c.toLowerCase()).join(" | ");
  if (CATEGORY_TAG_MATCHERS.Dining.test(joined)) tags.push("Dining");
  if (CATEGORY_TAG_MATCHERS.Gas.test(joined)) tags.push("Gas");
  return tags;
}

/** The card's best multiplier across any of the selected filters that map to
 * an earn-rate category (Dining, Gas — not "Travel"/"Airline"/"No Annual
 * Fee"/..., which have no per-category rate to rank by), read from
 * CardSummary.categories alone so ranking the whole catalog never needs a
 * full Card fetch. Null if none of the selected filters are category-based,
 * or none of the card's categories match any of them. */
function summaryCategoryRelevance(
  categories: CardSummary["categories"],
  filters: Iterable<string>,
): number | null {
  let best: number | null = null;
  for (const filter of filters) {
    const matcher = CATEGORY_TAG_MATCHERS[filter];
    if (!matcher) continue;
    for (const { category, multiplier } of categories) {
      if (matcher.test(category.toLowerCase())) {
        const value = parseMultiplierValue(multiplier);
        if (best === null || value > best) best = value;
      }
    }
  }
  return best;
}

/** Orders cards for the compare-tab card picker: grouped by issuer (canonical
 * ISSUERS order, same as the rest of the app), and within each issuer group,
 * by best earn-rate multiplier across the selected category filters,
 * descending (5x before 4x before 3x, ...) when any are selected — ties, and
 * cards with no computable multiplier for the selected filters (e.g. only
 * "Travel" or "No Annual Fee" is selected), fall back to alphabetical order
 * by name. Empty issuer groups are omitted. */
export function groupCardsForPicker(
  cards: CardSummary[],
  categories: Iterable<string>,
): CardSection[] {
  const categorySet = new Set(categories);
  return ISSUERS.map((issuer) => ({
    label: issuer.label,
    cards: cards
      .filter((c) => c.issuer === issuer.issuerField)
      .sort((a, b) => {
        if (categorySet.size > 0) {
          const relA = summaryCategoryRelevance(a.categories, categorySet);
          const relB = summaryCategoryRelevance(b.categories, categorySet);
          if (relA !== null || relB !== null) {
            if (relA === null) return 1;
            if (relB === null) return -1;
            if (relA !== relB) return relB - relA;
          }
        }
        return a.name.localeCompare(b.name);
      }),
  })).filter((g) => g.cards.length > 0);
}

/** Tags derivable from summary data alone (fast, no per-card fetch needed) —
 * annual fee, brand/group, currency (Cash Back vs. a transferable travel
 * program), and earn-rate categories (Dining, Gas). */
export function summaryTags(card: CardSummary): string[] {
  const tags = new Set<string>();
  const c = classify(card.id);

  if (card.annual_fee === 0) tags.add("No Annual Fee");

  if (c.group === "airline") {
    tags.add("Airline");
    if (c.brand) tags.add(c.brand);
  } else if (c.group === "hotel") {
    tags.add("Hotel");
    if (c.brand) tags.add(c.brand);
  } else if (c.group === "cobrand" && c.brand) {
    tags.add(c.brand);
  }

  const currency = card.points_program;
  const hasNoRewards = currency === "None";
  if (!hasNoRewards) {
    if (currency === "Cash Back") {
      tags.add("Cash Back");
    } else if (c.group === "personal") {
      // The issuer's own transferable/travel currency (Membership Rewards,
      // Ultimate Rewards, ThankYou Rewards, Capital One Miles, ...).
      tags.add("Travel");
      tags.add(currency);
    }
  }

  for (const tag of categoryTags(card.categories.map((c) => c.category))) tags.add(tag);

  return [...tags];
}

/** Additional tags that require the full card detail: status perks and
 * free-text fields for benefits with no dedicated schema field. Everything
 * derivable from summary data (fee, brand, currency, earn categories) lives
 * in `summaryTags` instead — this only adds what genuinely needs the full
 * `/api/cards/:id` payload. */
export function detailTags(card: Card): string[] {
  const tags = new Set<string>();

  if (card.status_perks.some((p) => /lounge/i.test(p.name) || /lounge/i.test(p.note))) {
    tags.add("Lounge Access");
  }

  const freeText = [
    card.earn_note,
    card.points.note,
    card.protection_note,
    card.rental_note,
    ...card.credits.map((cr) => cr.description),
    ...card.services.map((s) => s.detail),
  ]
    .join(" ")
    .toLowerCase();

  if (/\bintro(ductory)?\s*apr\b/.test(freeText)) tags.add("0% Intro APR");
  if (/no foreign transaction fee/.test(freeText)) tags.add("No Foreign Transaction Fee");
  if (/balance transfer/.test(freeText)) tags.add("Balance Transfer");

  return [...tags];
}

/** Every brand name (airline/hotel/cobrand) that appears among a set of cards —
 * used to tell "brand" chips apart from structural/behavioral ones when ordering. */
export function brandTagsForCards(cards: CardSummary[]): Set<string> {
  const brands = new Set<string>();
  for (const card of cards) {
    const c = classify(card.id);
    if (c.brand) brands.add(c.brand);
  }
  return brands;
}

// ─── Compare-tab shared filter bar ─────────────────────────────────────────────
// Single source of truth for the three filter predicates, shared by
// CompareFilterBar (to compute each dropdown's own mutually-scoped options)
// and ComparePage (to compute the actual filtered card list) — kept here
// rather than duplicated in both so a future change to what "matches this
// issuer/brand/category" means can't drift between the two call sites.

export function filterByIssuers(cards: CardSummary[], issuers: Set<string>): CardSummary[] {
  return issuers.size === 0 ? cards : cards.filter((c) => issuers.has(c.issuer));
}

export function filterByBrands(cards: CardSummary[], brands: Set<string>): CardSummary[] {
  if (brands.size === 0) return cards;
  return cards.filter((c) => {
    const b = classify(c.id).brand;
    return b !== undefined && brands.has(b);
  });
}

export function filterByCategories(cards: CardSummary[], categories: Set<string>): CardSummary[] {
  if (categories.size === 0) return cards;
  const tagMap = new Map<string, Set<string>>();
  for (const card of cards) {
    for (const tag of summaryTags(card)) {
      if (!tagMap.has(tag)) tagMap.set(tag, new Set());
      tagMap.get(tag)!.add(card.id);
    }
  }
  return cards.filter((c) => [...categories].some((cat) => tagMap.get(cat)?.has(c.id)));
}

// Mirrors the order Amex (and most issuers) use on their own card-picker
// pages. "Featured" is deliberately omitted — it's editorial curation with
// no equivalent field in this catalog's data, so it isn't something we can
// honestly derive rather than guess.
export const STRUCTURAL_CHIP_ORDER = [
  "Travel",
  "Cash Back",
  "Lounge Access",
  "No Annual Fee",
  "0% Intro APR",
  "No Foreign Transaction Fee",
  "Airline",
  "Hotel",
  "Balance Transfer",
  "Dining",
  "Gas",
];

/** Orders the set of tags that actually apply to an issuer's cards into a
 * stable, sensible filter-chip sequence: All Cards, then structural/behavioral
 * chips (with the issuer's own currency name slotted in after Cash Back), then
 * brand-specific chips (Delta SkyMiles, Hilton Honors, ...) alphabetically. */
export function orderChips(tags: Set<string>, brandTags: Set<string>): string[] {
  const structural = STRUCTURAL_CHIP_ORDER.filter((t) => tags.has(t));
  const currencyTags = [...tags]
    .filter((t) => !STRUCTURAL_CHIP_ORDER.includes(t) && !brandTags.has(t))
    .sort();
  const brands = [...tags].filter((t) => brandTags.has(t)).sort();

  const cashBackIdx = structural.indexOf("Cash Back");
  const insertAt = cashBackIdx === -1 ? 0 : cashBackIdx + 1;
  const withCurrency = [...structural];
  withCurrency.splice(insertAt, 0, ...currencyTags);

  return [ALL_CARDS_FILTER, ...withCurrency, ...brands];
}
