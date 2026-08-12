import type { Card } from "../types/cards";
import type { LikedFeature } from "../api/feedback";

/**
 * Which features a card actually has, for the "what appeals to you?" question
 * the feedback form asks people who don't hold the card.
 *
 * Gated per card rather than offered as a fixed list, because "the statement
 * credits" is a meaningless answer about a card with none, and an answer
 * nobody could have meant is worse than no answer: it would show up in the
 * aggregate as a real signal.
 *
 * Order is the order the form renders, roughly most to least commonly
 * available across the catalog.
 */
export const LIKED_FEATURE_LABELS: Record<LikedFeature, string> = {
  earn_rates: "The earn rates",
  welcome_bonus: "The welcome bonus",
  credits: "The statement credits",
  no_annual_fee: "No annual fee",
  insurance: "The insurance and protections",
  intro_apr: "The 0% intro APR",
  transfer_partners: "The transfer partners",
  lounge_access: "The lounge access",
};

export function availableFeatures(card: Card): LikedFeature[] {
  const hasLounge = (card.status_perks ?? []).some((p) =>
    `${p.name ?? ""} ${p.note ?? ""}`.toLowerCase().includes("lounge"),
  );
  const present: Record<LikedFeature, boolean> = {
    earn_rates: (card.earn_rates ?? []).length > 0,
    welcome_bonus: Boolean(card.welcome_bonus),
    credits: (card.credits ?? []).some((c) => !c.removed),
    no_annual_fee: card.annual_fee === 0,
    insurance: (card.insurance ?? []).some((i) => i.level && i.level !== "none"),
    intro_apr: Boolean(card.intro_apr_purchases),
    transfer_partners: (card.transfer_partners?.partners ?? []).length > 0,
    lounge_access: hasLounge,
  };
  return (Object.keys(LIKED_FEATURE_LABELS) as LikedFeature[]).filter((k) => present[k]);
}
