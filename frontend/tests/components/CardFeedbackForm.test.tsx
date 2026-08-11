import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardFeedbackForm } from "@/components/CardFeedbackForm";

// The form asks a cardholder whether they actually capture the value the rest
// of the page estimates. It is the only place on the site where a visitor
// writes something, so the things worth pinning are: nothing is submitted
// without the one required answer, a failure is shown rather than swallowed,
// and the payload matches CardFeedbackIn in backend/models.py, which is
// mirrored by hand and has no compiler keeping it honest.

const postFeedback = vi.fn();
vi.mock("@/api/feedback", () => ({ postFeedback: (p: unknown) => postFeedback(p) }));
vi.mock("@/utils/sessionTracking", () => ({ getSessionId: () => "test-session" }));

beforeEach(() => {
  postFeedback.mockReset();
  postFeedback.mockResolvedValue(undefined);
});

const setup = () => render(<CardFeedbackForm cardId="amex-platinum" cardName="Platinum Card" />);

describe("submitting", () => {
  it("cannot be submitted without a rating, which is the only required answer", async () => {
    setup();
    const button = screen.getByRole("button", { name: /share your experience/i });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(postFeedback).not.toHaveBeenCalled();
  });

  it("sends only the rating when nothing else is answered", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback).toHaveBeenCalledWith({
      card_id: "amex-platinum",
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
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(screen.getByLabelText("Partly"));
    await userEvent.click(screen.getByLabelText("1 to 2 years"));
    await userEvent.click(screen.getByLabelText("Yes"));
    await userEvent.type(screen.getByLabelText(/anything else/i), "  Worth it if you fly.  ");
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    // These strings are duplicated in three places by necessity (this file,
    // the component, and the DB CHECK). A typo in any one is a 422 in
    // production, so they are asserted literally rather than via the union.
    expect(postFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 5,
        maximizes_value: "partly",
        held_for: "1_to_2y",
        would_keep: true,
        comment: "Worth it if you fly.",
      }),
    );
  });

  it("sends would_keep as false rather than dropping it", async () => {
    // false is falsy, so a truthy guard anywhere in this path would silently
    // turn "no, I'd cancel it" into "didn't answer" — the most interesting
    // answer this form collects, lost.
    setup();
    await userEvent.click(screen.getByRole("button", { name: "1 star" }));
    await userEvent.click(screen.getByLabelText("No"));
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].would_keep).toBe(false);
  });

  it("omits a comment that is only whitespace", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "3 stars" }));
    await userEvent.type(screen.getByLabelText(/anything else/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    await waitFor(() => expect(postFeedback).toHaveBeenCalledOnce());
    expect(postFeedback.mock.calls[0][0].comment).toBeUndefined();
  });
});

describe("after submitting", () => {
  it("thanks the visitor and stops showing the form", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/thank you/i);
    expect(screen.queryByRole("button", { name: /share your experience/i })).toBeNull();
  });

  it("shows the failure instead of thanking them for nothing", async () => {
    // Telling someone "thanks" when the write failed is worse than telling
    // them it failed, because they have no reason to try again.
    postFeedback.mockRejectedValue(new Error("That didn't save. Try again in a moment."));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't save/i);
    expect(screen.queryByRole("status")).toBeNull();
    // And the form is still there, with the answers still in it, so a retry
    // does not mean filling it in again.
    expect(screen.getByRole("button", { name: /share your experience/i })).toBeEnabled();
  });

  it("does not submit twice while a submission is in flight", async () => {
    let release: () => void = () => {};
    postFeedback.mockReturnValue(new Promise<void>((r) => (release = r)));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    const button = screen.getByRole("button", { name: /share your experience/i });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(postFeedback).toHaveBeenCalledOnce();
    release();
  });
});

describe("accessibility", () => {
  it("gives each star a name a screen reader can use", () => {
    // The visible glyph is a star and conveys nothing on its own.
    setup();
    expect(screen.getByRole("button", { name: "1 star" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 stars" })).toBeInTheDocument();
  });

  it("groups each question so its options are announced with it", () => {
    setup();
    expect(screen.getByRole("group", { name: /able to use this card/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /how long have you held it/i })).toBeInTheDocument();
  });

  it("reflects the chosen rating in aria-pressed, not only in colour", () => {
    // jsdom applies no stylesheet, so a purely visual selected state would be
    // invisible to this test and to a screen reader alike.
    setup();
    return userEvent.click(screen.getByRole("button", { name: "3 stars" })).then(() => {
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
});

describe("moving to another card", () => {
  it("clears the form rather than carrying answers across", async () => {
    // Card-to-card navigation stays on the same route, so this component can
    // survive the change. Before this, submitting on one card and following
    // the link to its secured pair thanked you for a review you never wrote.
    const { rerender } = render(<CardFeedbackForm cardId="a" cardName="A" />);
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.type(screen.getByLabelText(/anything else/i), "Great card.");
    expect(screen.getByRole("button", { name: "5 stars" })).toHaveAttribute("aria-pressed", "true");

    rerender(<CardFeedbackForm cardId="b" cardName="B" />);
    expect(screen.getByRole("button", { name: "5 stars" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText(/anything else/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /share your experience/i })).toBeDisabled();
  });

  it("clears the thank-you state too, not just the inputs", async () => {
    const { rerender } = render(<CardFeedbackForm cardId="a" cardName="A" />);
    await userEvent.click(screen.getByRole("button", { name: "4 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /share your experience/i }));
    expect(await screen.findByRole("status")).toBeInTheDocument();

    rerender(<CardFeedbackForm cardId="b" cardName="B" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /share your experience/i })).toBeInTheDocument();
  });
});
