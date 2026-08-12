import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CardFeedbackForm } from "@/components/CardFeedbackForm";
import type { LikedFeature } from "@/api/feedback";

// The form branches on whether the visitor holds the card. The two branches
// collect different things because they know different things, and neither can
// answer the other's questions — enforced by the form, again by CardFeedbackIn,
// and again by CHECK constraints on card_feedback. These pin the first of the
// three, and the payload shape all three agree on.

const postFeedback = vi.fn();
vi.mock("@/api/feedback", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  postFeedback: (p: unknown) => postFeedback(p),
}));
vi.mock("@/utils/sessionTracking", () => ({ getSessionId: () => "test-session" }));

beforeEach(() => {
  postFeedback.mockReset();
  postFeedback.mockResolvedValue(undefined);
});

const FEATURES: LikedFeature[] = ["earn_rates", "credits", "welcome_bonus"];
const setup = (features = FEATURES) =>
  render(<CardFeedbackForm cardId="amex-platinum" cardName="Platinum Card" features={features} />);

const holder = () => userEvent.click(screen.getByLabelText("Yes, I hold it"));
const interested = () => userEvent.click(screen.getByLabelText("No, but I'm interested"));
const submitButton = () => screen.getByRole("button", { name: /share your experience/i });

describe("choosing a branch", () => {
  it("asks nothing else until the visitor says whether they hold the card", () => {
    setup();
    expect(screen.queryByRole("button", { name: "5 stars" })).toBeNull();
    expect(screen.queryByText(/what appeals to you most/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /share your experience/i })).toBeNull();
  });

  it("shows the holder questions and not the interest one", async () => {
    setup();
    await holder();
    expect(screen.getByRole("button", { name: "5 stars" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /how long have you held it/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /what appeals to you most/i })).toBeNull();
  });

  it("shows the interest question and not the holder ones", async () => {
    setup();
    await interested();
    expect(screen.getByRole("group", { name: /what appeals to you most/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "5 stars" })).toBeNull();
    expect(screen.queryByRole("group", { name: /how long have you held it/i })).toBeNull();
  });

  it("discards the other branch's answers when the visitor changes their mind", async () => {
    // Rating then switching to "interested" must not submit that rating: the
    // API rejects the mix, but more to the point the person retracted it.
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await interested();
    await userEvent.click(screen.getByLabelText("The earn rates"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0]).not.toHaveProperty("rating");
    expect(postFeedback.mock.calls[0][0].respondent_type).toBe("interested");
  });
});

describe("the holder branch", () => {
  it("cannot submit without a rating", async () => {
    setup();
    await holder();
    expect(submitButton()).toBeDisabled();
    await userEvent.click(submitButton());
    expect(postFeedback).not.toHaveBeenCalled();
  });

  it("sends only the rating when nothing else is answered", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback).toHaveBeenCalledWith({
      card_id: "amex-platinum",
      respondent_type: "holder",
      rating: 4,
      maximizes_value: undefined,
      held_for: undefined,
      would_keep: undefined,
      comment: undefined,
      session_id: "test-session",
    });
  });

  it("sends the bucket values the backend's CHECK constraint accepts", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(screen.getByLabelText("Partly"));
    await userEvent.click(screen.getByLabelText("1 to 2 years"));
    await userEvent.click(screen.getByLabelText("Yes"));
    await userEvent.type(screen.getByLabelText(/anything else/i), "  Worth it if you fly.  ");
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    // Literals, not the union type: these strings also live in a Pydantic
    // Literal and a DB CHECK, and a typo in any one is a 422 in production.
    expect(postFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        maximizes_value: "partly",
        held_for: "1_to_2y",
        would_keep: true,
        comment: "Worth it if you fly.",
      }),
    );
  });

  it("sends would_keep as false rather than dropping it", async () => {
    // false is falsy, so a truthy guard anywhere in this path would turn
    // "no, I'd cancel it" into "didn't answer".
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "1 star" }));
    await userEvent.click(screen.getByLabelText("No"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].would_keep).toBe(false);
  });

  it("omits a comment that is only whitespace", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "3 stars" }));
    await userEvent.type(screen.getByLabelText(/anything else/i), "   ");
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].comment).toBeUndefined();
  });
});

describe("the interested branch", () => {
  it("cannot submit without naming a feature", async () => {
    setup();
    await interested();
    expect(submitButton()).toBeDisabled();
  });

  it("sends the feature and no holder fields", async () => {
    setup();
    await interested();
    await userEvent.click(screen.getByLabelText("The statement credits"));
    await userEvent.type(screen.getByLabelText(/anything else/i), "The Uber credit looks useful.");
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback).toHaveBeenCalledWith({
      card_id: "amex-platinum",
      respondent_type: "interested",
      liked_feature: "credits",
      comment: "The Uber credit looks useful.",
      session_id: "test-session",
    });
  });

  it("offers only the features the card actually has", async () => {
    // "The statement credits" on a card with none would be an answer nobody
    // could have meant, and it would land in the aggregate as a real signal.
    setup(["earn_rates", "no_annual_fee"]);
    await interested();
    expect(screen.getByLabelText("The earn rates")).toBeInTheDocument();
    expect(screen.getByLabelText("No annual fee")).toBeInTheDocument();
    expect(screen.queryByLabelText("The statement credits")).toBeNull();
    expect(screen.queryByLabelText("The lounge access")).toBeNull();
  });

  it("still lets someone comment on a card with no listed features", async () => {
    setup([]);
    await interested();
    expect(screen.queryByRole("group", { name: /what appeals/i })).toBeNull();
    await userEvent.type(screen.getByLabelText(/anything else/i), "Curious about it.");
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].liked_feature).toBeUndefined();
  });
});

describe("after submitting", () => {
  it("thanks the visitor and stops showing the form", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(submitButton());
    expect(await screen.findByRole("status")).toHaveTextContent(/thank you/i);
    expect(screen.queryByRole("button", { name: /share your experience/i })).toBeNull();
  });

  it("shows the failure instead of thanking them for nothing", async () => {
    postFeedback.mockRejectedValue(new Error("That didn't save. Try again in a moment."));
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't save/i);
    expect(screen.queryByRole("status")).toBeNull();
    expect(submitButton()).toBeEnabled();
  });

  it("does not submit twice while a submission is in flight", async () => {
    let release: () => void = () => {};
    postFeedback.mockReturnValue(new Promise<void>((r) => (release = r)));
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    // Captured before the click: the label becomes "Sending…" while in
    // flight, so looking it up again by name would find nothing.
    const button = submitButton();
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(postFeedback).toHaveBeenCalledOnce();
    release();
  });
});

describe("accessibility", () => {
  it("gives each star a name a screen reader can use", async () => {
    setup();
    await holder();
    expect(screen.getByRole("button", { name: "1 star" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 stars" })).toBeInTheDocument();
  });

  it("groups every question so its options are announced with it", async () => {
    setup();
    expect(screen.getByRole("group", { name: /do you hold this card/i })).toBeInTheDocument();
    await holder();
    for (const name of [/your rating/i, /how long have you held it/i, /able to use this card/i, /would you keep it/i]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
  });

  it("reflects the chosen rating in aria-pressed, not only in colour", async () => {
    // jsdom applies no stylesheet, so a purely visual selected state would be
    // invisible to this test and to a screen reader alike.
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "3 stars" }));
    expect(screen.getByRole("button", { name: "3 stars" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "4 stars" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("moving to another card", () => {
  it("clears the form rather than carrying answers across", async () => {
    const { rerender } = render(
      <CardFeedbackForm cardId="a" cardName="A" features={FEATURES} />,
    );
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    rerender(<CardFeedbackForm cardId="b" cardName="B" features={FEATURES} />);
    // Back to the first question, with nothing chosen.
    expect(screen.queryByRole("button", { name: "5 stars" })).toBeNull();
    expect(screen.getByLabelText("Yes, I hold it")).not.toBeChecked();
  });

  it("clears the thank-you state too, not just the inputs", async () => {
    const { rerender } = render(
      <CardFeedbackForm cardId="a" cardName="A" features={FEATURES} />,
    );
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    await userEvent.click(submitButton());
    expect(await screen.findByRole("status")).toBeInTheDocument();
    rerender(<CardFeedbackForm cardId="b" cardName="B" features={FEATURES} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// Both schema-reviewer and frontend-reviewer flagged that FeedbackPayload
// mirrors CardFeedbackIn by hand with nothing pinning the *shape*. The enum
// values were pinned; a renamed or newly-required field was not, and would
// have surfaced as a 422 in production.
describe("the payload matches the model it mirrors", () => {
  const root = join(__dirname, "..", "..", "..");
  const ts = readFileSync(join(root, "frontend", "src", "api", "feedback.ts"), "utf-8");
  const py = readFileSync(join(root, "backend", "models.py"), "utf-8");

  const tsFields = new Set(
    [...ts.slice(ts.indexOf("export interface FeedbackPayload")).matchAll(/^\s{2}(\w+)\??:/gm)].map(
      (m) => m[1],
    ),
  );
  const pyBlock = py.slice(py.indexOf("class CardFeedbackIn"), py.indexOf("@model_validator"));
  const pyFields = new Set([...pyBlock.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));

  it("reads both files, rather than passing over nothing", () => {
    expect(tsFields.size).toBeGreaterThan(5);
    expect(pyFields.size).toBeGreaterThan(5);
  });

  it("declares the same fields on both sides", () => {
    expect([...tsFields].sort()).toEqual([...pyFields].sort());
  });
});
