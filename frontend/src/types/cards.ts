// Mirrors the Pydantic models in backend/models.py

export type VerdictStatus = "keep" | "situational" | "reconsider";
export type CreditTier = "easy" | "plan" | "niche";
export type InsuranceLevel = "strong" | "good" | "mid" | "none";
export type TimelineEventType = "add" | "cut" | "neutral" | "future";

export interface Verdict {
  status: VerdictStatus;
  text: string;
  short_tag?: string | null;
}

interface CardBase {
  id: string;
  name: string;
  issuer: string;
  network: string;
  points_program: string;
  accent_color: string;
  annual_fee: number;
  effective_cost: string;
  verdict: Verdict;
  /** Set on an unsecured card whose secured counterpart has identical earn
   * rates — the secured card is hidden from catalog listings in favor of
   * this one, and this id is used to link to it as "also available". */
  secured_variant_id: string | null;
  /** The inverse, set on the secured card itself (computed server-side,
   * never stored in that card's own data) — lets its own detail page link
   * back to the unsecured primary it's hidden in favor of, since it's no
   * longer reachable by browsing catalog listings. */
  is_secured_variant_of: string | null;
  /** Shared, non-unique id for a real-world transferable points pool (e.g.
   * Chase Freedom Flex/Unlimited pool into a Sapphire Preferred/Reserve
   * account and inherit its redemption value). Every card sharing this id
   * is a peer, not a primary/duplicate pair like secured_variant_id — used
   * by Top Pick's "My Cards" ranking to value a held flat-rate card at the
   * best cpp among every other held card in the same pool. */
  points_pool_id: string | null;
  /** True only for the card whose own account a pooled balance actually
   * redeems through (e.g. Sapphire Preferred/Reserve, Strata Premier/
   * Elite) — false for a feeder card that only reaches full value once
   * pooled with one of these. A feeder must never be valued off another
   * feeder sharing its pool id with no receiver present — real-world
   * transfer-partner access requires an active premium account in the
   * mix, not just any two linked cards. */
  points_pool_receiver: boolean;
}

export interface EarnCategorySummary {
  category: string;
  multiplier: string;
  /** Whether this is the card's flat "everything else" rate — the only
   * reliable Catch-All signal, since that rate is phrased dozens of
   * different ways in category free text. */
  is_base: boolean;
}

/** Returned by GET /api/cards */
export interface CardSummary extends CardBase {
  total_easy_credits: number;
  total_max_credits: number;
  /** Category + multiplier pairs only (not full EarnRate objects) — enough to
   * derive spend-category filter chips (Dining, Gas, ...) AND rank matches by
   * multiplier catalog-wide, without fetching every card's full detail. */
  categories: EarnCategorySummary[];
  /** Best cents-per-point across this card's redemption options (1.0 for a
   * flat cash-back card). Lets the Top Pick page rank by effective earn
   * rate (multiplier × best_cpp) instead of comparing raw multipliers
   * across incompatible currencies. */
  best_cpp: number;
}

export interface EarnRate {
  emoji: string;
  multiplier: string;
  category: string;
  highlight: boolean;
  is_base: boolean;
}

export interface RedemptionOption {
  method: string;
  cpp: number;
  best: boolean;
}

export interface Points {
  currency: string;
  redemption_options: RedemptionOption[];
  per_100k: string;
  note: string;
}

export type TransferPartnerType = "airline" | "hotel";

export interface TransferPartner {
  name: string;
  type: TransferPartnerType;
  ratio: string;
  notes?: string | null;
}

export interface TransferPartners {
  airline_count: number;
  hotel_count: number;
  highlight: string;
  recent_changes: string;
  partners?: TransferPartner[];
}

export interface Credit {
  id: string;
  name: string;
  subtitle: string;
  max_annual: number;
  default_value: number;
  tier: CreditTier;
  removed: boolean;
  description: string;
  tips: string[];
}

export interface Insurance {
  coverage: string;
  detail: string;
  level: InsuranceLevel;
}

export interface StatusPerk {
  name: string;
  strength: number;
  note: string;
}

export interface Service {
  name: string;
  detail: string;
}

export interface AdditionalCardBenefit {
  text: string;
  included: boolean;
}

export interface AdditionalCardOption {
  name: string;
  fee: string;
  is_free: boolean;
  benefits: AdditionalCardBenefit[];
}

export interface AdditionalCards {
  title: string;
  options: AdditionalCardOption[];
  note: string;
}

export interface TimelineEvent {
  date: string;
  type: TimelineEventType;
  badge: string;
  text: string;
}

/** Returned by GET /api/cards/:id */
export interface Card extends CardBase {
  official_url?: string | null;
  /** Whether official_url carries affiliate tracking (commission-earning).
   * False for every card today — drives whether CardDetailPage's
   * AffiliateDisclosure renders, so the disclosure can never show for a
   * link that isn't actually monetized. */
  is_affiliate_link: boolean;
  earn_rates: EarnRate[];
  earn_note: string;
  points: Points;
  transfer_partners: TransferPartners;
  credits: Credit[];
  insurance: Insurance[];
  protection_note: string;
  rental_note: string;
  status_perks: StatusPerk[];
  services: Service[];
  additional_cards: AdditionalCards;
  timeline: TimelineEvent[];
}