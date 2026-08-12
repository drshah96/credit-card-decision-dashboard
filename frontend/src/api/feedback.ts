// Submitting one visitor's experience of a card.
//
// Deliberately NOT fire-and-forget, unlike api/events.ts next door. That one
// tracks what someone did and must never interrupt them; this one is a person
// pressing Submit and waiting to be told it worked. A failure here has to be a
// real rejected promise so the form can say so, because telling someone
// "thanks" when nothing was saved is worse than telling them it failed.

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

/** The features a card can be liked for. Mirrors the CHECK constraint on
 * card_feedback_features.feature. */
export type LikedFeature =
  | "earn_rates"
  | "insurance"
  | "no_annual_fee"
  | "credits"
  | "intro_apr_purchases"
  | "redemption_rate"
  | "intro_apr_balance_transfer"
  | "transfer_partners"
  | "lounge_access"
  | "status_perks";

/** How many features one submission may name. Mirrors MAX_FEATURES in
 * backend/models.py, and pinned against it by
 * tests/backend/test_liked_feature_options.py: a form that let someone pick
 * more than the API accepts would be a 422 at submit time, after they had
 * already written their answer. */
export const MAX_FEATURES = 3;

/** Mirrors CardFeedbackIn in backend/models.py. Kept in sync by hand;
 * tests/components/CardFeedbackForm.test.tsx pins the field names against it. */
export interface FeedbackPayload {
  card_id: string;
  /** Which branch of the form this answers. The two are mutually exclusive,
   * enforced by the API and again by CHECK constraints on the table. */
  respondent_type: "holder" | "interested";
  /** 1-5. Required of holders, forbidden of everyone else. */
  rating?: number;
  /** Up to MAX_FEATURES, deduped and capped again server-side. Required of
   * interested respondents when the card offers any option, optional for
   * holders. */
  features?: LikedFeature[];
  maximizes_value?: "yes" | "partly" | "no";
  /** A bucket, not a month count: the form asks for a bucket. */
  held_for?: "under_6m" | "6_to_12m" | "1_to_2y" | "2_to_5y" | "over_5y";
  would_keep?: boolean;
  comment?: string;
  session_id?: string;
}

export async function postFeedback(payload: FeedbackPayload): Promise<void> {
  const response = await fetch(`${BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // 429 is the one a visitor can act on, so it gets its own message rather
    // than the generic failure.
    throw new Error(
      response.status === 429
        ? "You've sent a few of these already. Try again a bit later."
        : "That didn't save. Try again in a moment.",
    );
  }
}
