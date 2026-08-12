import { useEffect, useState } from "react";
import {
  MAX_FEATURES,
  postFeedback,
  type FeedbackPayload,
  type LikedFeature,
} from "../api/feedback";
import { LIKED_FEATURE_LABELS } from "../utils/cardFeatures";
import { getSessionId } from "../utils/sessionTracking";

interface Props {
  cardId: string;
  cardName: string;
  /** The features this card actually has, from availableFeatures(). Only these
   * are offered, so nobody can pick "Statement credits" on a card without any.
   * Empty is handled: the interested branch then asks only for a comment. */
  features: LikedFeature[];
}

type Respondent = "holder" | "interested";

const HELD_FOR: {
  value: NonNullable<FeedbackPayload["held_for"]>;
  label: string;
}[] = [
  { value: "under_6m", label: "Under 6 months" },
  { value: "6_to_12m", label: "6 to 12 months" },
  { value: "1_to_2y", label: "1 to 2 years" },
  { value: "2_to_5y", label: "2 to 5 years" },
  { value: "over_5y", label: "Over 5 years" },
];

const MAXIMIZES: {
  value: NonNullable<FeedbackPayload["maximizes_value"]>;
  label: string;
}[] = [
  { value: "yes", label: "Yes, I use most of it" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No, most of it goes unused" },
];

/**
 * Asks about this card, branching on whether the visitor actually holds it.
 *
 * The two branches collect different things because they know different
 * things. Someone holding the card can say whether it delivers what the site
 * estimates it delivers, which is the number this whole site is built on.
 * Someone who does not hold it cannot answer that at all, but can say what
 * drew them to the page, which is the other half of the picture and was
 * previously thrown away: before this, a visitor who did not hold the card had
 * nothing to submit and left no trace.
 *
 * Neither branch can answer the other's questions. That is enforced three
 * times over: the form only renders one set, CardFeedbackIn rejects a mixed
 * payload with a 422, and CHECK constraints on card_feedback reject it again.
 *
 * Question order within the holder branch runs easy-factual to evaluative to
 * decision: how long, then whether they capture the value, then whether they
 * would keep it. "How long" precedes "do you capture the value" because it is
 * the easier question and because it conditions the next one.
 */
export function CardFeedbackForm({ cardId, cardName, features }: Props) {
  const [respondent, setRespondent] = useState<Respondent>();
  const [rating, setRating] = useState(0);
  const [likedFeatures, setLikedFeatures] = useState<LikedFeature[]>([]);
  const [maximizes, setMaximizes] =
    useState<FeedbackPayload["maximizes_value"]>();
  const [heldFor, setHeldFor] = useState<FeedbackPayload["held_for"]>();
  const [wouldKeep, setWouldKeep] = useState<boolean>();
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string>();
  // What was actually submitted, not what is currently selected. Switching
  // branch mid-request would otherwise thank a holder with the copy written
  // for someone who does not hold the card. The payload itself was always
  // correct, captured in the closure; only the message was wrong.
  const [submitted, setSubmitted] = useState<Respondent>();

  // Belt and braces with the key={card.id} on CardDetail in CardDetailPage.
  // Navigating card to card stays on the same route, so without one of these
  // the form keeps its state across the change and thanks the visitor for a
  // review of a card they never reviewed.
  useEffect(() => {
    setRespondent(undefined);
    setRating(0);
    setLikedFeatures([]);
    setMaximizes(undefined);
    setHeldFor(undefined);
    setWouldKeep(undefined);
    setComment("");
    setState("idle");
    setError(undefined);
    setSubmitted(undefined);
  }, [cardId]);

  // Switching branch clears the other one's answers. The payload would be
  // rejected otherwise, but more importantly someone who picks "I hold it",
  // rates it, then corrects themselves should not have that rating submitted.
  function chooseRespondent(next: Respondent) {
    setRespondent(next);
    setError(undefined);
    if (next === "interested") {
      setRating(0);
      setMaximizes(undefined);
      setHeldFor(undefined);
      setWouldKeep(undefined);
    }
    // The feature picks are deliberately NOT cleared when switching to the
    // holder branch: both branches ask it, over the same options and with the
    // same cap. Only the answers the other branch cannot accept are dropped.
  }

  // Toggling off is always allowed, so someone who has hit the cap can change
  // their mind without first working out which box to clear. Only adding past
  // the cap is refused, and the inputs that would do it are disabled, so this
  // guard is the second line rather than the message.
  function toggleFeature(feature: LikedFeature) {
    setLikedFeatures((current) =>
      current.includes(feature)
        ? current.filter((f) => f !== feature)
        : current.length < MAX_FEATURES
          ? [...current, feature]
          : current,
    );
  }

  const atFeatureCap = likedFeatures.length >= MAX_FEATURES;

  // One id, because the two feature fieldsets are mutually exclusive: the form
  // renders the holder branch or the interested branch, never both.
  const FEATURE_HINT_ID = "feedback-features-hint";

  // Doubles as the group's description and as a live region. Reaching the cap
  // greys out the remaining options, which tells a sighted person what happened
  // and tells a screen reader nothing: disabled controls announce their state
  // only once focus lands on one. The text changes only at the boundary, so
  // this announces twice per visit at most rather than on every pick.
  //
  // aria-live rather than role="status" on purpose. The thank-you panel is the
  // form's status message and tests identify it by that role; a second one here
  // would make "the status message" ambiguous for both a reader and a test.
  const featureHint = atFeatureCap
    ? `${MAX_FEATURES} of ${MAX_FEATURES} chosen. Clear one to choose another.`
    : `Pick up to ${MAX_FEATURES}.`;

  const ready =
    respondent === "holder"
      ? rating > 0
      : respondent === "interested" &&
        (features.length === 0 || likedFeatures.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || state === "sending") return;
    setState("sending");
    setError(undefined);
    try {
      await postFeedback(
        respondent === "holder"
          ? {
              card_id: cardId,
              respondent_type: "holder",
              rating,
              maximizes_value: maximizes,
              held_for: heldFor,
              would_keep: wouldKeep,
              features: likedFeatures.length > 0 ? likedFeatures : undefined,
              comment: comment.trim() || undefined,
              session_id: getSessionId(),
            }
          : {
              card_id: cardId,
              respondent_type: "interested",
              features: likedFeatures.length > 0 ? likedFeatures : undefined,
              comment: comment.trim() || undefined,
              session_id: getSessionId(),
            },
      );
      setSubmitted(respondent);
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
          {submitted === "holder"
            ? "Real numbers from people who hold the card are worth more than any estimate."
            : "Knowing what drew you to this card tells us which parts of it are worth explaining better."}
        </p>
        {/* The claim that submitting again replaces the first answer is true —
            the endpoint upserts on (session_id, card_slug) — but it used to be
            made with no way back to the form short of reloading the page. */}
        <button
          type="button"
          className="feedback-again"
          onClick={() => setState("idle")}
        >
          Change your answer
        </button>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <p className="feedback-intro">
        The site estimates what a typical person gets out of the {cardName}.
        Tell us how that matches your own experience, or what brought you here.
      </p>

      <fieldset className="feedback-field">
        <legend>Do you hold this card?</legend>
        <div className="feedback-options">
          {(
            [
              { value: "holder", label: "Yes, I hold it" },
              { value: "interested", label: "No, but I'm interested" },
            ] as const
          ).map((o) => (
            <label key={o.value} className="feedback-option">
              <input
                type="radio"
                name="respondent"
                checked={respondent === o.value}
                disabled={state === "sending"}
                onChange={() => chooseRespondent(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {respondent === "holder" && (
        <>
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
                  // The visible glyph is a star, which reads as nothing useful
                  // to a screen reader, so each button carries its own label.
                  aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                >
                  <span aria-hidden="true">★</span>
                </button>
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

          {features.length > 0 && (
            <fieldset
              className="feedback-field"
              aria-describedby={FEATURE_HINT_ID}
            >
              {/* Different wording from the interested branch on purpose. A
                  holder is saying what actually delivers; someone interested is
                  saying what drew them. Same option set, and the parent's
                  respondent_type is what tells the two apart later. Optional
                  here, because a holder is already answering four questions. */}
              <legend>Which parts earn their keep? (optional)</legend>
              <div className="feedback-options is-grid">
                {features.map((f) => (
                  <label key={f} className="feedback-option">
                    <input
                      type="checkbox"
                      name="likedFeatures"
                      checked={likedFeatures.includes(f)}
                      disabled={atFeatureCap && !likedFeatures.includes(f)}
                      onChange={() => toggleFeature(f)}
                    />
                    <span>{LIKED_FEATURE_LABELS[f]}</span>
                  </label>
                ))}
              </div>
              <p
                className="feedback-hint"
                id={FEATURE_HINT_ID}
                aria-live="polite"
              >
                {featureHint}
              </p>
            </fieldset>
          )}

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
        </>
      )}

      {respondent === "interested" && features.length > 0 && (
        <fieldset className="feedback-field" aria-describedby={FEATURE_HINT_ID}>
          <legend>What appeals to you about it?</legend>
          <div className="feedback-options is-grid">
            {features.map((f) => (
              <label key={f} className="feedback-option">
                <input
                  type="checkbox"
                  name="likedFeatures"
                  checked={likedFeatures.includes(f)}
                  disabled={atFeatureCap && !likedFeatures.includes(f)}
                  onChange={() => toggleFeature(f)}
                />
                <span>{LIKED_FEATURE_LABELS[f]}</span>
              </label>
            ))}
          </div>
          <p className="feedback-hint" id={FEATURE_HINT_ID} aria-live="polite">
            {featureHint}
          </p>
        </fieldset>
      )}

      {respondent && (
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
            placeholder={
              respondent === "holder"
                ? "What works, what doesn't, what you wish you'd known."
                : "What would make you apply, or what's putting you off."
            }
          />
          <p className="feedback-counter">
            {1000 - comment.length} characters left
          </p>
        </div>
      )}

      {error && (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      )}

      {respondent && (
        <>
          <button
            type="submit"
            className="feedback-submit"
            disabled={!ready || state === "sending"}
          >
            {state === "sending" ? "Sending…" : "Share your experience"}
          </button>
          <p className="feedback-privacy">
            No name, no email, no account. Nothing you write is shown on the
            site.
          </p>
        </>
      )}
    </form>
  );
}
