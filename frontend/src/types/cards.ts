// Mirrors the Pydantic models in backend/models.py

export type VerdictStatus = "keep" | "situational" | "reconsider";
export type CreditTier = "easy" | "plan" | "niche";
export type InsuranceLevel = "strong" | "good" | "mid" | "none";
export type TimelineEventType = "add" | "cut" | "neutral" | "future";

export interface Verdict {
  status: VerdictStatus;
  text: string;
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
}

/** Returned by GET /api/cards */
export interface CardSummary extends CardBase {
  total_easy_credits: number;
  total_max_credits: number;
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

export interface TransferPartners {
  airline_count: number;
  hotel_count: number;
  highlight: string;
  recent_changes: string;
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