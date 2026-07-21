import type { Card, CardSummary } from "../types/cards";

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

// ─── Filter chips ─────────────────────────────────────────────────────────────
// Chips that need only summary-level data (annual fee, group/brand) are
// derivable immediately. The richer behavioral chips (Dining, Gas, Lounge
// Access, Balance Transfer, 0% Intro APR, No Foreign Transaction Fee) read
// real fields off the full Card detail — never guessed — so callers pass in
// full Card objects once they've been fetched.

export const ALL_CARDS_FILTER = "All Cards";

/** Tags derivable from summary data alone (fast, no per-card fetch needed). */
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

  return [...tags];
}

/** Additional tags that require the full card detail (earn categories, status
 * perks, and free-text fields for benefits with no dedicated schema field). */
export function detailTags(card: Card): string[] {
  const tags = new Set<string>();
  const c = classify(card.id);

  const currency = card.points.currency;
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

  const categories = card.earn_rates.map((r) => r.category.toLowerCase()).join(" | ");
  if (/dining|restaurant/.test(categories)) tags.add("Dining");
  if (/\bgas\b|fuel station|ev charging/.test(categories)) tags.add("Gas");

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

// Mirrors the order Amex (and most issuers) use on their own card-picker
// pages. "Featured" is deliberately omitted — it's editorial curation with
// no equivalent field in this catalog's data, so it isn't something we can
// honestly derive rather than guess.
const STRUCTURAL_CHIP_ORDER = [
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
