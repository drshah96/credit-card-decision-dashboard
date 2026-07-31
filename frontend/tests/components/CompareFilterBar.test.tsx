import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompareFilterBar } from "@/components/CompareFilterBar";
import type { CardSummary } from "@/types/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Real card ids so `classify()` resolves real brand/group data: Delta SkyMiles
// is an Amex-only brand, World of Hyatt a Chase-only brand.

function makeSummary(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "amex-delta-skymiles-gold",
    name: "Delta SkyMiles Gold",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "SkyMiles",
    accent_color: "#000000",
    annual_fee: 0,
    effective_cost: "Free",
    verdict: { status: "keep", text: "Keep it" },
    total_easy_credits: 0,
    total_max_credits: 0,
    categories: [],
    best_cpp: 1,
    secured_variant_id: null,
    is_secured_variant_of: null,
    ...overrides,
  };
}

const AMEX_DELTA = makeSummary();
const CHASE_HYATT = makeSummary({
  id: "chase-world-of-hyatt",
  name: "World of Hyatt Card",
  issuer: "Chase",
  points_program: "World of Hyatt",
});

const ALL_CARDS = [AMEX_DELTA, CHASE_HYATT];

// A stateful wrapper — CompareFilterBar is fully controlled, so exercising
// real interactions (a click narrowing what a later click can pick) needs an
// actual state update between them, not just a fresh render with new props.
function Harness({ cards }: { cards: CardSummary[] }) {
  const [issuers, setIssuers] = useState<Set<string>>(new Set());
  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  return (
    <CompareFilterBar
      cards={cards}
      issuers={issuers}
      onIssuersChange={setIssuers}
      brands={brands}
      onBrandsChange={setBrands}
      categories={categories}
      onCategoriesChange={setCategories}
    />
  );
}

describe("CompareFilterBar", () => {
  it("narrows Brand options to the selected Issuer", () => {
    render(<Harness cards={ALL_CARDS} />);

    fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
    fireEvent.click(screen.getByText("Chase"));
    fireEvent.click(screen.getByRole("button", { name: /^Issuer/ })); // close it

    fireEvent.click(screen.getByRole("button", { name: /^Brand/ }));
    expect(screen.getByText("World of Hyatt")).toBeInTheDocument();
    expect(screen.queryByText("Delta SkyMiles")).not.toBeInTheDocument();
  });

  it("narrows Issuer options to the selected Brand", () => {
    render(<Harness cards={ALL_CARDS} />);

    fireEvent.click(screen.getByRole("button", { name: /^Brand/ }));
    fireEvent.click(screen.getByText("Delta SkyMiles"));

    fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
    expect(screen.getByText("American Express")).toBeInTheDocument();
    expect(screen.queryByText("Chase")).not.toBeInTheDocument();
  });

  it("auto-clears a Brand selection once the underlying card list no longer supports it", () => {
    // Mutual narrowing means an *incompatible* pick can never be made through
    // the dropdowns themselves (the option lists already prevent it) — the
    // one real way a previously-valid selection goes stale is the available
    // `cards` changing out from under it (e.g. a catalog refetch), which
    // `useDropStale` guards against directly.
    const { rerender } = render(<Harness cards={ALL_CARDS} />);

    fireEvent.click(screen.getByRole("button", { name: /^Brand/ }));
    fireEvent.click(screen.getByText("Delta SkyMiles"));
    expect(screen.getByRole("button", { name: /^Brand/ })).toHaveTextContent("1");

    rerender(<Harness cards={[CHASE_HYATT]} />);

    expect(screen.getByRole("button", { name: /^Brand$/ })).not.toHaveTextContent("1");
  });

  it("OR-matches multiple selections within the same filter (Brand)", () => {
    render(<Harness cards={ALL_CARDS} />);

    fireEvent.click(screen.getByRole("button", { name: /^Brand/ }));
    fireEvent.click(screen.getByText("Delta SkyMiles"));
    fireEvent.click(screen.getByText("World of Hyatt"));

    expect(screen.getByRole("button", { name: /^Brand/ })).toHaveTextContent("2");
  });
});
