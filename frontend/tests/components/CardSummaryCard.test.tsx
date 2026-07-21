import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardSummaryCard } from "@/components/CardSummaryCard";
import type { CardSummary } from "@/types/cards";

beforeEach(() => {
  localStorage.clear();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "amex",
    name: "The Platinum Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
    accent_color: "#C4CBD8",
    annual_fee: 895,
    effective_cost: "Depends on usage",
    verdict: { status: "situational", text: "Keep if you use the credits" },
    total_easy_credits: 0,
    total_max_credits: 2984,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CardSummaryCard", () => {
  it("renders card name and issuer", () => {
    render(<CardSummaryCard card={makeCard()} />);

    expect(screen.getByText("The Platinum Card")).toBeInTheDocument();
    expect(screen.getByText("American Express")).toBeInTheDocument();
  });

  it("renders points program", () => {
    render(<CardSummaryCard card={makeCard()} />);

    expect(screen.getByText("Membership Rewards")).toBeInTheDocument();
  });

  it("renders verdict badge text", () => {
    render(<CardSummaryCard card={makeCard()} />);

    expect(screen.getByText("Keep if you use the credits")).toBeInTheDocument();
  });

  it("renders annual fee", () => {
    render(<CardSummaryCard card={makeCard({ annual_fee: 895 })} />);

    expect(screen.getByText("$895")).toBeInTheDocument();
  });

  it("renders max credits", () => {
    render(<CardSummaryCard card={makeCard({ total_max_credits: 2984 })} />);

    expect(screen.getByText("$2984")).toBeInTheDocument();
  });

  it("shows +$X best-case net when credits exceed the fee", () => {
    // fee=$895, credits=$2984 → net = 895 - 2984 = -2089 → display "+$2089"
    render(<CardSummaryCard card={makeCard({ annual_fee: 895, total_max_credits: 2984 })} />);

    expect(screen.getByText("+$2089")).toBeInTheDocument();
  });

  it("shows $X best-case net when fee exceeds credits", () => {
    // fee=$395, credits=$100 → net = 295 → display "$295"
    render(<CardSummaryCard card={makeCard({ annual_fee: 395, total_max_credits: 100 })} />);

    expect(screen.getByText("$295")).toBeInTheDocument();
  });

  it("shows $0 best-case net when fee equals credits", () => {
    render(<CardSummaryCard card={makeCard({ annual_fee: 395, total_max_credits: 395 })} />);

    // netCost = 0, which is <= 0, so displays "+$0"
    expect(screen.getByText("+$0")).toBeInTheDocument();
  });

  it("applies amber verdict styles for situational status", () => {
    render(<CardSummaryCard card={makeCard({ verdict: { status: "situational", text: "Situational" } })} />);

    const badge = screen.getByText("Situational");
    expect(badge).toHaveClass("text-amber-700");
  });

  it("applies green verdict styles for keep status", () => {
    render(<CardSummaryCard card={makeCard({ verdict: { status: "keep", text: "Keep it" } })} />);

    const badge = screen.getByText("Keep it");
    expect(badge).toHaveClass("text-emerald-700");
  });

  it("applies red verdict styles for reconsider status", () => {
    render(<CardSummaryCard card={makeCard({ verdict: { status: "reconsider", text: "Consider cutting" } })} />);

    const badge = screen.getByText("Consider cutting");
    expect(badge).toHaveClass("text-red-700");
  });

  it("renders network and effective cost in footer", () => {
    render(<CardSummaryCard card={makeCard()} />);

    expect(screen.getByText("AMERICAN EXPRESS")).toBeInTheDocument();
    expect(screen.getByText("Depends on usage")).toBeInTheDocument();
  });

  it("prefers the short_tag over the full verdict text when both are present", () => {
    render(
      <CardSummaryCard
        card={makeCard({
          verdict: { status: "keep", text: "A much longer explanation", short_tag: "Short Tag" },
        })}
      />,
    );

    expect(screen.getByText("Short Tag")).toBeInTheDocument();
    expect(screen.queryByText("A much longer explanation")).not.toBeInTheDocument();
  });

  it("splits a network with a tier onto two lines regardless of word order", () => {
    const { container: infinite } = render(
      <CardSummaryCard card={makeCard({ network: "VISA INFINITE" })} />,
    );
    expect(infinite.querySelector("span.shrink-0")).toHaveTextContent("VISAINFINITE");

    const { container: worldElite } = render(
      <CardSummaryCard card={makeCard({ network: "WORLD ELITE MASTERCARD" })} />,
    );
    expect(worldElite.querySelector("span.shrink-0")).toHaveTextContent("MASTERCARDWORLD ELITE");
  });

  it("falls back to the raw string for a network that matches no known brand", () => {
    render(<CardSummaryCard card={makeCard({ network: "SOME FUTURE NETWORK" })} />);

    expect(screen.getByText("SOME FUTURE NETWORK")).toBeInTheDocument();
  });

  it("shows a short 'Proprietary' label for closed-loop store networks instead of the full sentence", () => {
    render(
      <CardSummaryCard
        card={makeCard({
          network:
            "PROPRIETARY (Goodyear / Citi Retail Services — closed-loop, not Visa or Mastercard)",
        })}
      />,
    );

    expect(screen.getByText("Proprietary")).toBeInTheDocument();
    expect(screen.queryByText(/closed-loop/)).not.toBeInTheDocument();
  });

  it("applies muted style to max credits when there are no credits", () => {
    // fee=$395, credits=$0 → netCost=395 (positive int) → displays "$395" for best-case net
    render(<CardSummaryCard card={makeCard({ annual_fee: 395, total_max_credits: 0 })} />);

    // "$0" only appears once — as max credits (best-case net shows "$395")
    const zeroEl = screen.getByText("$0");
    expect(zeroEl).toHaveClass("text-black/30");
  });

  describe("compare selection", () => {
    it("the title is plain text, not a compare toggle, so clicking it does nothing special", () => {
      render(<CardSummaryCard card={makeCard({ id: "amex" })} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("The Platinum Card").tagName).toBe("H2");
    });

    it("outside select mode, shows a passive (non-interactive) checkmark badge once compared", () => {
      localStorage.setItem("compare-cards", JSON.stringify(["amex"]));
      const { container } = render(<CardSummaryCard card={makeCard({ id: "amex" })} />);

      const badge = container.querySelector('[aria-hidden="true"]');
      expect(badge).toHaveTextContent("✓");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("in select mode, an empty circle toggle appears and adds the card to compare", () => {
      render(<CardSummaryCard card={makeCard({ id: "amex" })} selectMode />);

      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));

      expect(
        screen.getByRole("button", { name: /remove the platinum card from compare/i }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual(["amex"]);
    });

    it("in select mode, clicking the circle doesn't follow a wrapping link", () => {
      const onLinkClick = vi.fn();
      render(
        // Mirrors IssuerCardsPage.tsx's CardTile, which wraps CardSummaryCard in a <Link>.
        <a href="/cards/amex" onClick={onLinkClick}>
          <CardSummaryCard card={makeCard({ id: "amex" })} selectMode />
        </a>,
      );

      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));

      expect(onLinkClick).not.toHaveBeenCalled();
    });

    it("removes the card from compare on a second click of the circle", () => {
      render(<CardSummaryCard card={makeCard({ id: "amex" })} selectMode />);

      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));
      fireEvent.click(
        screen.getByRole("button", { name: /remove the platinum card from compare/i }),
      );

      expect(
        screen.getByRole("button", { name: /add the platinum card to compare/i }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([]);
    });

    it("disables the circle for a new card once 4 others are already picked", () => {
      localStorage.setItem(
        "compare-cards",
        JSON.stringify(["chase-a", "chase-b", "chase-c", "chase-d"]),
      );
      render(<CardSummaryCard card={makeCard({ id: "amex" })} selectMode />);

      const circle = screen.getByRole("button", { name: /compare is full/i });
      expect(circle).toBeDisabled();

      fireEvent.click(circle);
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([
        "chase-a",
        "chase-b",
        "chase-c",
        "chase-d",
      ]);
    });

    it("still allows removing an already-picked card even when the list is full", () => {
      localStorage.setItem(
        "compare-cards",
        JSON.stringify(["amex", "chase-b", "chase-c", "chase-d"]),
      );
      render(<CardSummaryCard card={makeCard({ id: "amex" })} selectMode />);

      const circle = screen.getByRole("button", { name: /remove the platinum card from compare/i });
      expect(circle).not.toBeDisabled();
      fireEvent.click(circle);

      expect(
        screen.getByRole("button", { name: /add the platinum card to compare/i }),
      ).toBeInTheDocument();
    });
  });
});