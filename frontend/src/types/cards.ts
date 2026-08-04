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

/** A promotional intro-APR period, on purchases or balance transfers. `rate`
 * is almost always "0%" but kept as a string, not a boolean, since a small
 * number of real-world promos use a non-zero teaser rate. */
export interface IntroApr {
  rate: string;
  months: number;
}

/** The current sign-up offer, quoted verbatim from the issuer's own current
 * terms — offers change frequently and are structured differently across
 * issuers (points vs. cash, single vs. tiered spend thresholds), so `bonus`/
 * `requirement` stay free text like `effective_cost`/`variable_apr`
 * elsewhere. `estimated_value` is this card's own best redemption cpp
 * applied to the bonus, when it's a points/miles amount — null for cash
 * offers, where the bonus amount already is the value. */
export interface WelcomeBonus {
  bonus: string;
  requirement: string;
  estimated_value: string | null;
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
  /** Whether this card's official_url carries affiliate tracking
   * (commission-earning). False for every card today — the catalog has no
   * affiliate program yet. Drives CardDetailPage's AffiliateDisclosure,
   * and — just as importantly — is carried on CardSummary specifically so
   * Top Pick's ranking (computeTopPicks, which only ever sees CardSummary)
   * can be proven to ignore monetization status entirely: see the
   * ranking-integrity regression test in topPickCategories.test.ts. */
  is_affiliate_link: boolean;
  /** Sourced from the issuer's own current terms, not guessed — null means
   * this card hasn't been audited yet (distinct from confirmed-absent),
   * during the incremental per-issuer rollout of this data. Drives the
   * Compare tab's "0% Intro APR" / "Balance Transfer" Category chips: a
   * promotional balance-transfer offer IS an intro-APR period applied to
   * balance transfers, so there's no separate "has balance transfer" flag
   * that could drift out of sync with this. */
  intro_apr_purchases: IntroApr | null;
  intro_apr_balance_transfers: IntroApr | null;
  /** True = card charges a foreign transaction fee. Null = not yet audited.
   * Drives the "No Foreign Transaction Fee" Category chip (only matches
   * when this is explicitly `false`, not merely falsy/null). */
  foreign_transaction_fee: boolean | null;
  /** Derived server-side from status_perks (any perk mentioning "lounge") —
   * unlike the three fields above, this doesn't need per-card research, so
   * there's no "not yet audited" state, just true/false. */
  has_lounge_access: boolean;
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
  /** Ongoing (post-intro, or from day one if there's no intro offer) rate
   * ranges and fees, quoted verbatim from the issuer's own Pricing & Terms
   * table rather than decomposed into numbers — real ranges are tied to
   * creditworthiness ("19.24%-29.99% Variable") and nothing here computes
   * with them, only displays them. Detail-only (not on CardSummary) —
   * purely informational, not a Compare-tab filter driver like
   * intro_apr_purchases/intro_apr_balance_transfers. Null = not yet
   * audited. */
  variable_apr: string | null;
  balance_transfer_apr: string | null;
  balance_transfer_fee: string | null;
  /** The actual rate when foreign_transaction_fee is true (e.g. "3%") — the
   * boolean still drives the "No Foreign Transaction Fee" chip unchanged,
   * this is just the detail-page-level specific number. */
  foreign_transaction_fee_rate: string | null;
  /** Round-3 rates/fees (#12) — same verbatim-string, detail-only,
   * null-means-not-yet-audited treatment as variable_apr above.
   * pay_over_time_fee only applies to issuers offering a "pay a purchase
   * off over time for a fixed fee instead of interest" feature (Amex's Pay
   * Over Time, Chase Pay Over Time) — null for cards with no such feature
   * at all, not just unaudited ones. */
  cash_advance_apr: string | null;
  penalty_apr: string | null;
  /** When the penalty APR kicks in (e.g. "after a payment more than 60 days
   * late") — kept separate from the rate since issuers phrase the trigger
   * very differently and it isn't always present even when the rate is. */
  penalty_apr_trigger: string | null;
  pay_over_time_fee: string | null;
  late_payment_fee: string | null;
  returned_payment_fee: string | null;
  returned_check_fee: string | null;
  /** The current sign-up offer — see WelcomeBonus. Detail-only, same
   * not-yet-audited treatment as the round-3 fields above. */
  welcome_bonus: WelcomeBonus | null;
}