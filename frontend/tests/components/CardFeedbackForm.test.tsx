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
vi.mock("@/utils/sessionTracking", () => ({
  getSessionId: () => "test-session",
}));

beforeEach(() => {
  postFeedback.mockReset();
  postFeedback.mockResolvedValue(undefined);
});

const FEATURES: LikedFeature[] = ["earn_rates", "credits", "redemption_rate"];
const setup = (features = FEATURES) =>
  render(
    <CardFeedbackForm
      cardId="amex-platinum"
      cardName="Platinum Card"
      features={features}
    />,
  );

const holder = () => userEvent.click(screen.getByLabelText("Yes, I hold it"));
const interested = () =>
  userEvent.click(screen.getByLabelText("No, but I'm interested"));
const submitButton = () =>
  screen.getByRole("button", { name: /share your experience/i });

describe("choosing a branch", () => {
  it("asks nothing else until the visitor says whether they hold the card", () => {
    setup();
    expect(screen.queryByRole("button", { name: "5 stars" })).toBeNull();
    expect(screen.queryByText(/what appeals to you/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /share your experience/i }),
    ).toBeNull();
  });

  it("shows the holder questions and not the interest one", async () => {
    setup();
    await holder();
    expect(screen.getByRole("button", { name: "5 stars" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /how long have you held it/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /what appeals to you/i }),
    ).toBeNull();
  });

  it("shows the interest question and not the holder ones", async () => {
    setup();
    await interested();
    expect(
      screen.getByRole("group", { name: /what appeals to you/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "5 stars" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: /how long have you held it/i }),
    ).toBeNull();
  });

  it("discards the other branch's answers when the visitor changes their mind", async () => {
    // Rating then switching to "interested" must not submit that rating: the
    // API rejects the mix, but more to the point the person retracted it.
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await interested();
    await userEvent.click(screen.getByLabelText("Earn rates"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].rating).toBeUndefined();
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
      features: undefined,
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
    await userEvent.type(
      screen.getByLabelText(/anything else/i),
      "  Worth it if you fly.  ",
    );
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
    await userEvent.click(screen.getByLabelText("Statement credits"));
    await userEvent.type(
      screen.getByLabelText(/anything else/i),
      "The Uber credit looks useful.",
    );
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback).toHaveBeenCalledWith({
      card_id: "amex-platinum",
      respondent_type: "interested",
      features: ["credits"],
      comment: "The Uber credit looks useful.",
      session_id: "test-session",
    });
  });

  it("offers only the features the card actually has", async () => {
    // "Statement credits" on a card with none would be an answer nobody
    // could have meant, and it would land in the aggregate as a real signal.
    setup(["earn_rates", "no_annual_fee"]);
    await interested();
    expect(screen.getByLabelText("Earn rates")).toBeInTheDocument();
    expect(screen.getByLabelText("No annual fee")).toBeInTheDocument();
    expect(screen.queryByLabelText("Statement credits")).toBeNull();
    expect(screen.queryByLabelText("Lounge access")).toBeNull();
  });

  it("still lets someone comment on a card with no listed features", async () => {
    setup([]);
    await interested();
    expect(screen.queryByRole("group", { name: /what appeals/i })).toBeNull();
    await userEvent.type(
      screen.getByLabelText(/anything else/i),
      "Curious about it.",
    );
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toBeUndefined();
  });
});

describe("after submitting", () => {
  it("thanks the visitor and stops showing the form", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(submitButton());
    expect(await screen.findByRole("status")).toHaveTextContent(/thank you/i);
    expect(
      screen.queryByRole("button", { name: /share your experience/i }),
    ).toBeNull();
  });

  it("shows the failure instead of thanking them for nothing", async () => {
    postFeedback.mockRejectedValue(
      new Error("That didn't save. Try again in a moment."),
    );
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
    expect(
      screen.getByRole("group", { name: /do you hold this card/i }),
    ).toBeInTheDocument();
    await holder();
    for (const name of [
      /your rating/i,
      /how long have you held it/i,
      /able to use this card/i,
      /would you keep it/i,
    ]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
  });

  it("reflects the chosen rating in aria-pressed, not only in colour", async () => {
    // jsdom applies no stylesheet, so a purely visual selected state would be
    // invisible to this test and to a screen reader alike.
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "3 stars" }));
    expect(screen.getByRole("button", { name: "3 stars" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "4 stars" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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
  const ts = readFileSync(
    join(root, "frontend", "src", "api", "feedback.ts"),
    "utf-8",
  );
  const py = readFileSync(join(root, "backend", "models.py"), "utf-8");

  const tsFields = new Set(
    [
      ...ts
        .slice(ts.indexOf("export interface FeedbackPayload"))
        .matchAll(/^\s{2}(\w+)\??:/gm),
    ].map((m) => m[1]),
  );
  const pyBlock = py.slice(
    py.indexOf("class CardFeedbackIn"),
    py.indexOf("@model_validator"),
  );
  const pyFields = new Set(
    [...pyBlock.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]),
  );

  it("reads both files, rather than passing over nothing", () => {
    expect(tsFields.size).toBeGreaterThan(5);
    expect(pyFields.size).toBeGreaterThan(5);
  });

  it("declares the same fields on both sides", () => {
    expect([...tsFields].sort()).toEqual([...pyFields].sort());
  });
});

describe("the thank-you screen", () => {
  it("reflects what was submitted, not what is selected now", async () => {
    // Switching branch mid-request used to thank a holder with the copy
    // written for someone who does not hold the card. The payload was always
    // right; the message read current state.
    let release: (v?: unknown) => void = () => {};
    postFeedback.mockReturnValue(new Promise((r) => (release = r)));
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(submitButton());
    // The branch radios are disabled while sending, so this cannot happen by
    // clicking any more; asserted on the resolved copy regardless.
    expect(screen.getByLabelText("No, but I'm interested")).toBeDisabled();
    release();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /real numbers from people who hold/i,
    );
  });

  it("offers a way back to the form, since it says the answer can be replaced", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    await userEvent.click(submitButton());
    await screen.findByRole("status");
    await userEvent.click(
      screen.getByRole("button", { name: /change your answer/i }),
    );
    expect(screen.getByLabelText("Yes, I hold it")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("holders are asked which parts earn their keep", () => {
  it("offers the same options to a holder, optionally", async () => {
    setup();
    await holder();
    expect(
      screen.getByRole("group", { name: /which parts earn their keep/i }),
    ).toBeInTheDocument();
    // Optional: a rating alone is still submittable.
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    expect(submitButton()).toBeEnabled();
  });

  it("sends a holder's pick in the same field as an interested one", async () => {
    setup();
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(screen.getByLabelText("Earn rates"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toEqual(["earn_rates"]);
    expect(postFeedback.mock.calls[0][0].respondent_type).toBe("holder");
  });

  it("keeps the pick when switching branch, since both branches ask it", async () => {
    setup();
    await interested();
    await userEvent.click(screen.getByLabelText("Statement credits"));
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "3 stars" }));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toEqual(["credits"]);
  });
});

describe("the feature question takes several answers", () => {
  // Deliberately longer than the cap, so there is always something left to be
  // refused. FEATURES above is exactly MAX_FEATURES long and cannot show it.
  const MANY: LikedFeature[] = [
    "earn_rates",
    "credits",
    "redemption_rate",
    "transfer_partners",
    "lounge_access",
  ];

  it("sends every pick, not just the first", async () => {
    setup(MANY);
    await interested();
    await userEvent.click(screen.getByLabelText("Earn rates"));
    await userEvent.click(screen.getByLabelText("Statement credits"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toEqual([
      "earn_rates",
      "credits",
    ]);
  });

  it("refuses picks past the cap by disabling them, not by silently dropping them", async () => {
    setup(MANY);
    await interested();
    for (const label of [
      "Earn rates",
      "Statement credits",
      "Redemption value",
    ]) {
      await userEvent.click(screen.getByLabelText(label));
    }
    // The chosen ones stay clickable so the choice can be undone.
    expect(screen.getByLabelText("Earn rates")).toBeEnabled();
    expect(screen.getByLabelText("Transfer partners")).toBeDisabled();
    expect(screen.getByLabelText("Lounge access")).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Transfer partners"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toEqual([
      "earn_rates",
      "credits",
      "redemption_rate",
    ]);
  });

  it("frees a slot when a pick is taken back", async () => {
    setup(MANY);
    await interested();
    for (const label of [
      "Earn rates",
      "Statement credits",
      "Redemption value",
    ]) {
      await userEvent.click(screen.getByLabelText(label));
    }
    expect(screen.getByLabelText("Lounge access")).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Statement credits"));
    expect(screen.getByLabelText("Lounge access")).toBeEnabled();

    await userEvent.click(screen.getByLabelText("Lounge access"));
    await userEvent.click(submitButton());
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].features).toEqual([
      "earn_rates",
      "redemption_rate",
      "lounge_access",
    ]);
  });

  it("caps the holder branch the same way, since the two are compared", async () => {
    setup(MANY);
    await holder();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    for (const label of [
      "Earn rates",
      "Statement credits",
      "Redemption value",
    ]) {
      await userEvent.click(screen.getByLabelText(label));
    }
    expect(screen.getByLabelText("Lounge access")).toBeDisabled();
  });

  it("still requires at least one of an interested respondent", async () => {
    setup(MANY);
    await interested();
    expect(submitButton()).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Earn rates"));
    expect(submitButton()).toBeEnabled();
  });
});

describe("the pick cap is announced, not only shown", () => {
  const MANY: LikedFeature[] = [
    "earn_rates",
    "credits",
    "redemption_rate",
    "transfer_partners",
    "lounge_access",
  ];

  const fill = async () => {
    for (const label of [
      "Earn rates",
      "Statement credits",
      "Redemption value",
    ]) {
      await userEvent.click(screen.getByLabelText(label));
    }
  };

  it("describes the cap to the group before anyone hits it", async () => {
    setup(MANY);
    await interested();
    expect(
      screen.getByRole("group", { name: /what appeals to you/i }),
    ).toHaveAccessibleDescription(/pick up to 3/i);
  });

  it("says the cap is reached, since greying the rest out is a visual-only signal", async () => {
    setup(MANY);
    await interested();
    await fill();
    // A live region, so this is spoken when it changes rather than only when
    // focus happens to land on the group.
    const hint = document.getElementById("feedback-features-hint")!;
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(hint).toHaveTextContent(/3 of 3 chosen/i);
    expect(
      screen.getByRole("group", { name: /what appeals to you/i }),
    ).toHaveAccessibleDescription(/3 of 3 chosen/i);
  });

  it("goes back to the plain hint when a slot is freed", async () => {
    setup(MANY);
    await interested();
    await fill();
    await userEvent.click(screen.getByLabelText("Statement credits"));
    expect(document.getElementById("feedback-features-hint")).toHaveTextContent(
      /pick up to 3/i,
    );
  });

  it("describes the holder group too", async () => {
    setup(MANY);
    await holder();
    await fill();
    expect(
      screen.getByRole("group", { name: /which parts earn their keep/i }),
    ).toHaveAccessibleDescription(/3 of 3 chosen/i);
  });
});
