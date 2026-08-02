import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompareFilterBar } from "@/components/CompareFilterBar";
import type { Card, CardSummary } from "@/types/cards";

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

function makeCard(overrides: Partial<Card> = {}): Card {
  const summary = makeSummary(overrides);
  return {
    ...summary,
    is_affiliate_link: false,
    earn_rates: [],
    earn_note: "",
    points: { currency: summary.points_program, redemption_options: [], per_100k: "", note: "" },
    transfer_partners: { airline_count: 0, hotel_count: 0, highlight: "", recent_changes: "" },
    credits: [],
    insurance: [],
    protection_note: "",
    rental_note: "",
    status_perks: [],
    services: [],
    additional_cards: { title: "", options: [], note: "" },
    timeline: [],
    ...overrides,
  };
}

// A stateful wrapper — CompareFilterBar is fully controlled, so exercising
// real interactions (a click narrowing what a later click can pick) needs an
// actual state update between them, not just a fresh render with new props.
function Harness({
  cards,
  detailsById,
}: {
  cards: CardSummary[];
  detailsById?: Map<string, Card>;
}) {
  const [issuers, setIssuers] = useState<Set<string>>(new Set());
  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  return (
    <CompareFilterBar
      cards={cards}
      detailsById={detailsById}
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

  describe("detail-only behavioral chips", () => {
    // Lounge Access, 0% Intro APR, No Foreign Transaction Fee, and Balance
    // Transfer all live in Card.status_perks/free-text fields, not
    // CardSummary — only offered/matchable once that card's full detail has
    // been fetched and passed in via detailsById.

    it("doesn't offer a behavioral chip until detail has loaded for a card that has it", () => {
      render(<Harness cards={ALL_CARDS} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      expect(screen.queryByText("Lounge Access")).not.toBeInTheDocument();
    });

    it("offers and filters by Lounge Access once a card's detail confirms it", () => {
      const detailsById = new Map([
        [
          AMEX_DELTA.id,
          makeCard({
            ...AMEX_DELTA,
            status_perks: [{ name: "Centurion Lounge Access", strength: 3, note: "" }],
          }),
        ],
        [CHASE_HYATT.id, makeCard({ ...CHASE_HYATT })],
      ]);
      render(<Harness cards={ALL_CARDS} detailsById={detailsById} />);

      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      expect(screen.getByText("Lounge Access")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Lounge Access"));
      fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
      expect(screen.getByText("American Express")).toBeInTheDocument();
      expect(screen.queryByText("Chase")).not.toBeInTheDocument();
    });
  });
});
