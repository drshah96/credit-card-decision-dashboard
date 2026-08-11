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
    points_pool_id: null,
    points_pool_receiver: false,
    is_affiliate_link: false,
    intro_apr_purchases: null,
    intro_apr_balance_transfers: null,
    foreign_transaction_fee: null,
    has_lounge_access: false,
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

  describe("behavioral chips (Lounge Access, 0% Intro APR, Balance Transfer, No Foreign Transaction Fee)", () => {
    // All four are summary-level fields (see backend/models.py
    // Card.intro_apr_purchases for why) — no full Card detail needed, so a
    // plain CardSummary override is enough to exercise them.

    it("doesn't offer a behavioral chip for a card that doesn't have it", () => {
      render(<Harness cards={ALL_CARDS} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      expect(screen.queryByText("Lounge Access")).not.toBeInTheDocument();
      expect(screen.queryByText("0% Intro APR")).not.toBeInTheDocument();
      expect(screen.queryByText("Balance Transfer")).not.toBeInTheDocument();
      expect(screen.queryByText("No Foreign Transaction Fee")).not.toBeInTheDocument();
    });

    it("offers and filters by Lounge Access", () => {
      const amexWithLounge = makeSummary({ ...AMEX_DELTA, has_lounge_access: true });
      render(<Harness cards={[amexWithLounge, CHASE_HYATT]} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      expect(screen.getByText("Lounge Access")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Lounge Access"));
      fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
      expect(screen.getByText("American Express")).toBeInTheDocument();
      expect(screen.queryByText("Chase")).not.toBeInTheDocument();
    });

    it("offers and filters by 0% Intro APR", () => {
      const chaseWithIntroApr = makeSummary({
        ...CHASE_HYATT,
        intro_apr_purchases: { rate: "0%", months: 15 },
      });
      render(<Harness cards={[AMEX_DELTA, chaseWithIntroApr]} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      fireEvent.click(screen.getByText("0% Intro APR"));

      fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
      expect(screen.getByText("Chase")).toBeInTheDocument();
      expect(screen.queryByText("American Express")).not.toBeInTheDocument();
    });

    it("offers and filters by No Foreign Transaction Fee (only when explicitly false, not just unaudited)", () => {
      const amexNoFxFee = makeSummary({ ...AMEX_DELTA, foreign_transaction_fee: false });
      // CHASE_HYATT's foreign_transaction_fee stays null (not yet audited) —
      // must not be treated as if it were confirmed fee-free.
      render(<Harness cards={[amexNoFxFee, CHASE_HYATT]} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      fireEvent.click(screen.getByText("No Foreign Transaction Fee"));

      fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
      expect(screen.getByText("American Express")).toBeInTheDocument();
      expect(screen.queryByText("Chase")).not.toBeInTheDocument();
    });
  });
});

// "Remove selection" existed before this, rendered after the options. In a
// 280px scrolling panel with 30 brand options that is below the fold and never
// seen, which is indistinguishable from it not existing. DOM order is the part
// jsdom can actually check; the right-alignment is CSS and is not asserted here
// because no stylesheet is applied.
describe("Remove selection", () => {
  // Selecting through the UI rather than seeding props, because Harness owns
  // the state and the clear button only renders once that filter has one.
  function openWithSelection(label: string, option: string) {
    render(<Harness cards={ALL_CARDS} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
    fireEvent.click(screen.getByText(option));
  }

  it.each([
    ["Issuer", "Chase"],
    ["Brand", "Delta SkyMiles"],
  ])("is offered by the %s filter once it has a selection", (label, option) => {
    openWithSelection(label, option);
    expect(screen.getByRole("button", { name: /remove selection/i })).toBeInTheDocument();
  });

  it("sits above the options, not below them", () => {
    openWithSelection("Issuer", "Chase");

    const clear = screen.getByRole("button", { name: /remove selection/i });
    const firstOption = screen.getAllByRole("checkbox")[0];
    // DOCUMENT_POSITION_FOLLOWING === 4: the option comes after the button.
    expect(clear.compareDocumentPosition(firstOption) & 4).toBeTruthy();
  });

  it("clears that filter's selection", () => {
    openWithSelection("Issuer", "Chase");
    fireEvent.click(screen.getByRole("button", { name: /remove selection/i }));
    expect(screen.queryByRole("button", { name: /remove selection/i })).not.toBeInTheDocument();
  });

  it("is absent while that filter has nothing selected", () => {
    render(<Harness cards={ALL_CARDS} />);
    fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
    expect(screen.queryByRole("button", { name: /remove selection/i })).not.toBeInTheDocument();
  });
});
