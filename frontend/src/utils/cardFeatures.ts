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
 *
 * welcome_bonus is deliberately absent even though the field exists and the
 * enum still allows it. The welcome bonus block on the card page is disabled
 * (see CardDetailPage, "sign-up offers rotate on the issuer's own promotional
 * calendar"), so a visitor could not have seen one, and offering it would
 * collect exactly the answer-nobody-could-have-meant this gating exists to
 * prevent. Restore it here if that section ever comes back.
 */
export const LIKED_FEATURE_LABELS: Partial<Record<LikedFeature, string>> = {
  earn_rates: "The earn rates",
  credits: "The statement credits",
  no_annual_fee: "No annual fee",
  insurance: "The insurance and protections",
  intro_apr: "The 0% intro APR",
  transfer_partners: "The transfer partners",
  lounge_access: "The lounge access",
};

export function availableFeatures(card: Card): LikedFeature[] {
  const present: Partial<Record<LikedFeature, boolean>> = {
    earn_rates: (card.earn_rates ?? []).length > 0,
    credits: (card.credits ?? []).some((c) => !c.removed),
    no_annual_fee: card.annual_fee === 0,
    insurance: (card.insurance ?? []).some((i) => i.level && i.level !== "none"),
    intro_apr: Boolean(card.intro_apr_purchases),
    transfer_partners: (card.transfer_partners?.partners ?? []).length > 0,
    // The API already derives this and the page already carries it. Deriving
    // it a second time from status_perks was a hand-mirror of
    // _has_lounge_access in backend/services/cards.py, agreeing today and
    // pinned by nothing.
    lounge_access: card.has_lounge_access,
  };
  return (Object.keys(LIKED_FEATURE_LABELS) as LikedFeature[]).filter((k) => present[k]);
}
