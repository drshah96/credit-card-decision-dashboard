// Submitting one visitor's experience of a card.
//
// Deliberately NOT fire-and-forget, unlike api/events.ts next door. That one
// tracks what someone did and must never interrupt them; this one is a person
// pressing Submit and waiting to be told it worked. A failure here has to be a
// real rejected promise so the form can say so, because telling someone
// "thanks" when nothing was saved is worse than telling them it failed.

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Mirrors CardFeedbackIn in backend/models.py. Kept in sync by hand. */
export interface FeedbackPayload {
  card_id: string;
  /** 1-5. The only required answer. */
  rating: number;
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
