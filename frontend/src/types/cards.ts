// Mirrors the Pydantic models in backend/models.py

export type VerdictStatus = "keep" | "situational" | "reconsider";
export type CreditTier = "easy" | "plan" | "niche";
export type InsuranceLevel = "strong" | "good" | "mid" | "none";
export type TimelineEventType = "add" | "cut" | "neutral" | "future";

export interface Verdict {
  status: VerdictStatus;
  text: string;
}

/** Returned by GET /api/cards */
export interface CardSummary {
  id: string;
  name: string;
  issuer: string;
  network: string;
  points_program: string;
  accent_color: string;
  annual_fee: number;
  effective_cost: string;
  verdict: Verdict;
  total_easy_credits: number;
  total_max_credits: number;
}