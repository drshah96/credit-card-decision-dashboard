import { useState } from "react";
import { postFeedback, type FeedbackPayload } from "../api/feedback";
import { getSessionId } from "../utils/sessionTracking";

interface Props {
  cardId: string;
  cardName: string;
}

const HELD_FOR: { value: NonNullable<FeedbackPayload["held_for"]>; label: string }[] = [
  { value: "under_6m", label: "Under 6 months" },
  { value: "6_to_12m", label: "6 to 12 months" },
  { value: "1_to_2y", label: "1 to 2 years" },
  { value: "2_to_5y", label: "2 to 5 years" },
  { value: "over_5y", label: "Over 5 years" },
];

const MAXIMIZES: { value: NonNullable<FeedbackPayload["maximizes_value"]>; label: string }[] = [
  { value: "yes", label: "Yes, I use most of it" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No, most of it goes unused" },
];

/**
 * Asks someone who holds this card how it is actually working out.
 *
 * The whole site estimates what a typical person captures from a card's
 * credits. This is the only place that number gets checked against someone who
 * actually holds it, which is why "are you able to use its value?" is the
 * question the form is built around rather than an afterthought below a star
 * rating.
 *
 * Only the rating is required. Every other field is optional because each
 * required answer costs submissions, and a rating alone is still usable.
 *
 * Submitting twice for the same card updates the first answer rather than
 * adding a second, enforced server-side by a unique constraint on
 * (session_id, card_slug) with the endpoint updating in place.
 */
export function CardFeedbackForm({ cardId, cardName }: Props) {
  const [rating, setRating] = useState(0);
  const [maximizes, setMaximizes] = useState<FeedbackPayload["maximizes_value"]>();
  const [heldFor, setHeldFor] = useState<FeedbackPayload["held_for"]>();
  const [wouldKeep, setWouldKeep] = useState<boolean>();
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0 || state === "sending") return;
    setState("sending");
    setError(undefined);
    try {
      await postFeedback({
        card_id: cardId,
        rating,
        maximizes_value: maximizes,
        held_for: heldFor,
        would_keep: wouldKeep,
        comment: comment.trim() || undefined,
        session_id: getSessionId(),
      });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="feedback-done" role="status">
        <p className="feedback-done-title">Thank you.</p>
        <p className="feedback-done-body">
          Real numbers from people who hold the card are worth more than any estimate. If you want
          to change your answer, submit again and it replaces this one.
        </p>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <p className="feedback-intro">
        Do you hold the {cardName}? The site estimates what a typical person gets out of it. Tell us
        what you actually get.
      </p>

      <fieldset className="feedback-field">
        <legend>Your rating</legend>
        <div className="feedback-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`feedback-star${n <= rating ? " is-on" : ""}`}
              onClick={() => setRating(n)}
              aria-pressed={n <= rating}
              // The visible glyph is a star, which reads as nothing useful to a
              // screen reader, so each button carries its own full label.
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            >
              <span aria-hidden="true">★</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="feedback-field">
        <legend>Are you able to use this card&rsquo;s value?</legend>
        <div className="feedback-options">
          {MAXIMIZES.map((o) => (
            <label key={o.value} className="feedback-option">
              <input
                type="radio"
                name="maximizes"
                checked={maximizes === o.value}
                onChange={() => setMaximizes(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="feedback-field">
        <legend>How long have you held it?</legend>
        <div className="feedback-options">
          {HELD_FOR.map((o) => (
            <label key={o.value} className="feedback-option">
              <input
                type="radio"
                name="heldFor"
                checked={heldFor === o.value}
                onChange={() => setHeldFor(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="feedback-field">
        <legend>Would you keep it?</legend>
        <div className="feedback-options">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ].map((o) => (
            <label key={String(o.value)} className="feedback-option">
              <input
                type="radio"
                name="wouldKeep"
                checked={wouldKeep === o.value}
                onChange={() => setWouldKeep(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="feedback-field">
        <label className="feedback-label" htmlFor="feedback-comment">
          Anything else? (optional)
        </label>
        <textarea
          id="feedback-comment"
          className="feedback-comment"
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What works, what doesn't, what you wish you'd known."
        />
        <p className="feedback-counter">{1000 - comment.length} characters left</p>
      </div>

      {error && (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="feedback-submit"
        disabled={rating === 0 || state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Share your experience"}
      </button>
      <p className="feedback-privacy">
        No name, no email, no account. Nothing you write is shown on the site.
      </p>
    </form>
  );
}
