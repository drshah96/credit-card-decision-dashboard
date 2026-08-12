import type { Card } from "../types/cards";
import type { LikedFeature } from "../api/feedback";

/**
 * Which features a card actually has, for the question the feedback form asks
 * about what appeals most.
 *
 * Gated per card rather than offered as a fixed list, because "the statement
 * credits" is a meaningless answer about a card with none, and an answer
 * nobody could have meant is worse than no answer: it would show up in the
 * aggregate looking like a real signal.
 *
 * Every gate is something the card page actually renders. That rules out the
 * welcome bonus, whose block is deliberately disabled (a stale sign-up offer
 * reads as an active wrong promotional claim), even though the data is there
 * on 79 of 109 cards.
 *
 * Order is the order the form renders, roughly most to least commonly
 * available across the catalog.
 */
export const LIKED_FEATURE_LABELS: Record<LikedFeature, string> = {
  earn_rates: "Earn rates",
  insurance: "Insurance & protections",
  no_annual_fee: "No annual fee",
  credits: "Statement credits",
  intro_apr_purchases: "Intro APR on purchases",
  redemption_rate: "Redemption value",
  intro_apr_balance_transfer: "Intro APR on balance transfers",
  transfer_partners: "Transfer partners",
  lounge_access: "Lounge access",
};

/**
 * A point worth exactly one cent is cash back, so "the redemption value"
 * cannot be what distinguishes such a card. Above a cent, it can.
 */
const CASH_BACK_CPP = 1.0;

export function availableFeatures(card: Card): LikedFeature[] {
  // The rung the author flagged, not the highest number on the card. The
  // unflagged high rung is the aspirational sweet spot, and naming an option
  // after it would repeat the mistake that had Top Picks ranking Delta at 2.2
  // cents against the authored 1.15.
  const bestFlagged = Math.max(
    0,
    ...(card.points?.redemption_options ?? []).filter((o) => o.best).map((o) => o.cpp ?? 0),
  );

  const present: Record<LikedFeature, boolean> = {
    earn_rates: (card.earn_rates ?? []).length > 0,
    insurance: (card.insurance ?? []).some((i) => i.level && i.level !== "none"),
    no_annual_fee: card.annual_fee === 0,
    credits: (card.credits ?? []).some((c) => !c.removed),
    intro_apr_purchases: Boolean(card.intro_apr_purchases),
    redemption_rate: bestFlagged > CASH_BACK_CPP,
    intro_apr_balance_transfer: Boolean(card.intro_apr_balance_transfers),
    transfer_partners: (card.transfer_partners?.partners ?? []).length > 0,
    // The API already derives this and the page already carries it. Deriving it
    // again from status_perks would be a hand-mirror of _has_lounge_access in
    // backend/services/cards.py, agreeing today and pinned by nothing.
    lounge_access: card.has_lounge_access,
  };
  return (Object.keys(LIKED_FEATURE_LABELS) as LikedFeature[]).filter((k) => present[k]);
}
