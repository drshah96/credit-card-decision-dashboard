import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardSummaryCard } from "@/components/CardSummaryCard";
import type { CardSummary } from "@/types/cards";

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
    expect(badge).toHaveClass("text-amber-400");
  });

  it("applies green verdict styles for keep status", () => {
    render(<CardSummaryCard card={makeCard({ verdict: { status: "keep", text: "Keep it" } })} />);

    const badge = screen.getByText("Keep it");
    expect(badge).toHaveClass("text-emerald-400");
  });

  it("applies red verdict styles for reconsider status", () => {
    render(<CardSummaryCard card={makeCard({ verdict: { status: "reconsider", text: "Consider cutting" } })} />);

    const badge = screen.getByText("Consider cutting");
    expect(badge).toHaveClass("text-red-400");
  });

  it("renders network and effective cost in footer", () => {
    render(<CardSummaryCard card={makeCard()} />);

    expect(screen.getByText("AMERICAN EXPRESS")).toBeInTheDocument();
    expect(screen.getByText("Depends on usage")).toBeInTheDocument();
  });

  it("applies muted style to max credits when there are no credits", () => {
    // fee=$395, credits=$0 → netCost=395 (positive int) → displays "$395" for best-case net
    render(<CardSummaryCard card={makeCard({ annual_fee: 395, total_max_credits: 0 })} />);

    // "$0" only appears once — as max credits (best-case net shows "$395")
    const zeroEl = screen.getByText("$0");
    expect(zeroEl).toHaveClass("text-white/30");
  });
});