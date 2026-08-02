import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TopPickPage from "@/pages/TopPickPage";
import type { CardSummary } from "@/types/cards";

vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
}));

import { fetchCards } from "@/api/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "test-card",
    name: "Test Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
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

const SUMMARIES: CardSummary[] = [
  makeSummary({
    id: "amex-gold",
    name: "American Express Gold",
    issuer: "American Express",
    categories: [{ category: "Restaurants worldwide", multiplier: "4×", is_base: false }],
  }),
  makeSummary({
    id: "chase-sapphire-reserve",
    name: "Sapphire Reserve",
    issuer: "Chase",
    categories: [{ category: "Dining", multiplier: "3×", is_base: false }],
  }),
  makeSummary({
    id: "amex-blue-cash-preferred",
    name: "Blue Cash Preferred",
    issuer: "American Express",
    categories: [{ category: "U.S. supermarkets", multiplier: "6%", is_base: false }],
  }),
];

// Displays the router `state` it was navigated with, so a test can assert
// on the `state.from` a ranked card's Link passes along — a plain static
// stub route can't observe that (state isn't part of the URL).
function CardDetailStateProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <div>Card detail (from: {from ?? "none"})</div>;
}

function renderPage(search = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/top-picks${search}`]}>
        <Routes>
          <Route path="/top-picks" element={<TopPickPage />} />
          <Route path="/cards/:id" element={<CardDetailStateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TopPickPage", () => {
  it("renders a section per category group, each with the requested column headers", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    // One table per group (Common & Daily Spending, Travel & Transportation,
    // Retail & Miscellaneous, Overall), each repeating its own header row.
    expect(await screen.findAllByRole("columnheader", { name: "Category" })).toHaveLength(4);
    expect(screen.getAllByRole("columnheader", { name: "Top Choice" })).toHaveLength(4);
    expect(screen.getAllByRole("columnheader", { name: "Runner-Up" })).toHaveLength(4);
    expect(screen.getAllByRole("columnheader", { name: "Honorable Mention" })).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Common & Daily Spending" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Travel & Transportation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Retail & Miscellaneous" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overall" })).toBeInTheDocument();
  });

  it("ranks the Dining row's Top Choice as the highest dining multiplier", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    const topChoiceCell = within(diningRow).getAllByRole("cell")[0];
    expect(within(topChoiceCell).getByText("American Express Gold")).toBeInTheDocument();
    expect(within(topChoiceCell).getByText("4×")).toBeInTheDocument();
  });

  it("links a ranked card to its detail page", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    const link = within(diningRow).getAllByRole("link")[0];
    expect(link).toHaveAttribute("href", "/cards/amex-gold");
  });

  it("carries /top-picks as router state so the card detail page's back link returns here", async () => {
    // Regression test: without this, clicking a ranked card and then "back"
    // fell through to the card's issuer page instead of back to Top Pick.
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    fireEvent.click(within(diningRow).getAllByRole("link")[0]);
    expect(await screen.findByText("Card detail (from: /top-picks)")).toBeInTheDocument();
  });

  it("backfills a remaining slot with a flat-rate card, labeled as a fallback", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      makeSummary({
        id: "bilt-obsidian",
        name: "Bilt Obsidian Card",
        issuer: "Bilt",
        categories: [
          { category: "Rent or mortgage", multiplier: "1×", is_base: false },
          { category: "Everything else", multiplier: "2×", is_base: true },
        ],
      }),
      makeSummary({
        id: "flat-cash-back",
        name: "Flat Cash Back Card",
        issuer: "Chase",
        categories: [{ category: "Everything else", multiplier: "1.5%", is_base: true }],
      }),
    ]);
    renderPage();

    const rentRow = (await screen.findByRole("rowheader", { name: "Rent or Mortgage" })).closest(
      "tr",
    )!;
    const cells = within(rentRow).getAllByRole("cell");
    expect(within(cells[0]).getByText("Bilt Obsidian Card")).toBeInTheDocument();
    expect(within(cells[0]).queryByText("No category bonus")).not.toBeInTheDocument();
    expect(within(cells[1]).getByText("Flat Cash Back Card")).toBeInTheDocument();
    expect(within(cells[1]).getByText("No category bonus")).toBeInTheDocument();
  });

  it("shows a blank dash for rank slots with no matching card", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    // Only one card matches Groceries in this fixture set — Runner-Up/Honorable
    // Mention should render as "—" rather than crash or show a stray card.
    const groceriesRow = (
      await screen.findByRole("rowheader", { name: "Groceries" })
    ).closest("tr")!;
    const cells = within(groceriesRow).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
  });

  it("shows the effective cents-per-dollar value for a points card, but not a cash-back one", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      makeSummary({
        id: "points-card",
        name: "Points Card",
        best_cpp: 2,
        categories: [{ category: "Restaurants", multiplier: "3×", is_base: false }],
      }),
      makeSummary({
        id: "cash-back-card",
        name: "Cash Back Card",
        best_cpp: 1,
        categories: [{ category: "U.S. supermarkets", multiplier: "3%", is_base: false }],
      }),
    ]);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    // 3x at 2.0¢/point = 6.0¢/$1 — shown because best_cpp !== 1.
    expect(within(diningRow).getByText("≈ 6.0¢/$1")).toBeInTheDocument();

    const groceriesRow = (
      await screen.findByRole("rowheader", { name: "Groceries" })
    ).closest("tr")!;
    // Flat cash back: the raw "%" already IS the effective value, so no
    // redundant annotation.
    expect(within(groceriesRow).queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("shows a card image for a ranked card that has one", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    const topChoiceCell = within(diningRow).getAllByRole("cell")[0];
    // Decorative (alt="") card art isn't exposed via the accessibility tree,
    // so a plain DOM query, not getByRole, is the right tool here.
    const img = topChoiceCell.querySelector("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("amex-gold"));
  });

  it("shows and hides the category info popup on click", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    await screen.findByRole("rowheader", { name: "Dining" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What counts as Dining" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Restaurants, fast food, bars, cafes, and food delivery services.",
    );

    fireEvent.click(screen.getByRole("button", { name: "What counts as Dining" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the last row's info popup upward, not downward", async () => {
    // Regression test: a below-opening popup on the last row of a section
    // had nowhere to fit within the table's own height, forcing a vertical
    // scrollbar on the table wrap. "Fitness & Gyms" is the last row of the
    // first section (Common & Daily Spending); "Dining" is the first.
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    await screen.findByRole("rowheader", { name: "Dining" });
    fireEvent.click(screen.getByRole("button", { name: "What counts as Dining" }));
    expect(screen.getByRole("tooltip")).not.toHaveClass("up");
    fireEvent.click(screen.getByRole("button", { name: "What counts as Dining" }));

    fireEvent.click(screen.getByRole("button", { name: "What counts as Fitness & Gyms" }));
    expect(screen.getByRole("tooltip")).toHaveClass("up");
  });

  it("shows an error state when the fetch fails", async () => {
    vi.mocked(fetchCards).mockRejectedValue(new Error("network down"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load cards")).toBeInTheDocument();
    });
    expect(screen.getByText("network down")).toBeInTheDocument();
  });
});

describe("Choose Your Cards filter", () => {
  it("ranks the whole catalog by default, with no filter applied", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    expect(await screen.findByRole("button", { name: /^Choose Your Cards/ })).not.toHaveClass("active");
    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).getByText("American Express Gold")).toBeInTheDocument();
  });

  it("scopes ranking to only the cards selected in the picker", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sapphire Reserve" }));

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    const cells = within(diningRow).getAllByRole("cell");
    // Only Sapphire Reserve is selected, so it's the sole Dining entry —
    // Amex Gold (the whole-catalog Top Choice) must NOT appear anymore.
    expect(within(cells[0]).getByText("Sapphire Reserve")).toBeInTheDocument();
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
  });

  it("reflects the selection in the URL and the header copy", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sapphire Reserve" }));

    expect(screen.getByText(/among your 1 selected cards/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Choose Your Cards/ })).toHaveTextContent("1");
  });

  it("restores a selection from the URL on load", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage("?cards=chase-sapphire-reserve");

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).getByText("Sapphire Reserve")).toBeInTheDocument();
    expect(screen.getByText(/among your 1 selected cards/)).toBeInTheDocument();
  });

  it("clearing the selection returns to the whole-catalog ranking", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage("?cards=chase-sapphire-reserve");

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).getByText("American Express Gold")).toBeInTheDocument();
    expect(screen.queryByText(/among your/)).not.toBeInTheDocument();
  });

  it("filters the picker's own card list by search", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search cards" }), {
      target: { value: "sapphire" },
    });

    expect(screen.getByRole("checkbox", { name: "Sapphire Reserve" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "American Express Gold" })).not.toBeInTheDocument();
  });

  it("narrows the picker's card list with the issuer chip row", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chase" }));

    expect(screen.getByRole("checkbox", { name: "Sapphire Reserve" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "American Express Gold" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Blue Cash Preferred" }),
    ).not.toBeInTheDocument();
  });

  it("hides a secured card from the picker when its unsecured twin is also present", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      ...SUMMARIES,
      makeSummary({
        id: "amex-gold-secured",
        name: "American Express Gold Secured",
        issuer: "American Express",
      }),
    ].map((c) =>
      c.id === "amex-gold" ? { ...c, secured_variant_id: "amex-gold-secured" } : c,
    ));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));

    expect(screen.getByRole("checkbox", { name: "American Express Gold" })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "American Express Gold Secured" }),
    ).not.toBeInTheDocument();
  });

  it("pins already-selected cards in their own section, removable regardless of the current search/issuer filter", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage("?cards=amex-gold");

    fireEvent.click(await screen.findByRole("button", { name: /^Choose Your Cards/ }));
    expect(screen.getByText("Selected (1)")).toBeInTheDocument();
    const selectedCheckbox = screen.getByRole("checkbox", { name: "American Express Gold" });
    expect(selectedCheckbox).toBeChecked();

    // Narrow to an issuer that doesn't include the already-selected card —
    // it should stay visible (and uncheckable) in the Selected section.
    fireEvent.click(screen.getByRole("button", { name: "Chase" }));
    expect(screen.getByText("Selected (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "American Express Gold" }));

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    // Amex Gold was the whole catalog's Dining Top Choice — deselecting the
    // only card in the filter should return to the unfiltered ranking.
    expect(within(diningRow).getByText("American Express Gold")).toBeInTheDocument();
  });

  it("shows a message and a way to recover when the URL references cards that no longer exist", async () => {
    vi.mocked(fetchCards).mockResolvedValue(SUMMARIES);
    renderPage("?cards=some-retired-card-id");

    expect(
      await screen.findByText(/None of your selected cards were found/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText(/None of your selected cards were found/)).not.toBeInTheDocument();
  });

  it("boosts a pooled card's value and shows the pooling note when both cards in the pair are selected", async () => {
    const POOL_SUMMARIES: CardSummary[] = [
      makeSummary({
        id: "chase-freedom-flex",
        name: "Freedom Flex",
        issuer: "Chase",
        best_cpp: 1,
        points_pool_id: "chase-ultimate-rewards-transferable",
        categories: [{ category: "Dining", multiplier: "3%", is_base: false }],
      }),
      makeSummary({
        id: "chase-sapphire-reserve",
        name: "Sapphire Reserve",
        issuer: "Chase",
        best_cpp: 2.05,
        points_pool_id: "chase-ultimate-rewards-transferable",
        points_pool_receiver: true,
        categories: [],
      }),
    ];
    vi.mocked(fetchCards).mockResolvedValue(POOL_SUMMARIES);
    renderPage("?cards=chase-freedom-flex,chase-sapphire-reserve");

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).getByText("Freedom Flex")).toBeInTheDocument();
    // 3% raw -> reinterpreted as 3 points, boosted to 2.05cpp = 6.15,
    // displayed to one decimal (floating point rounds this to 6.1).
    expect(within(diningRow).getByText(/6\.1¢\/\$1/)).toBeInTheDocument();
    expect(within(diningRow).getByText("Boosted by points pooling")).toBeInTheDocument();
  });

  it("doesn't boost a pooled card's value when only it, not its pool partner, is selected", async () => {
    const POOL_SUMMARIES: CardSummary[] = [
      makeSummary({
        id: "chase-freedom-flex",
        name: "Freedom Flex",
        issuer: "Chase",
        best_cpp: 1,
        points_pool_id: "chase-ultimate-rewards-transferable",
        categories: [{ category: "Dining", multiplier: "3%", is_base: false }],
      }),
    ];
    vi.mocked(fetchCards).mockResolvedValue(POOL_SUMMARIES);
    renderPage("?cards=chase-freedom-flex");

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).getByText("Freedom Flex")).toBeInTheDocument();
    expect(within(diningRow).queryByText("Boosted by points pooling")).not.toBeInTheDocument();
  });

  it("never boosts a pooled card's value in the whole-catalog default ranking", async () => {
    const POOL_SUMMARIES: CardSummary[] = [
      makeSummary({
        id: "chase-freedom-flex",
        name: "Freedom Flex",
        issuer: "Chase",
        best_cpp: 1,
        points_pool_id: "chase-ultimate-rewards-transferable",
        categories: [{ category: "Dining", multiplier: "3%", is_base: false }],
      }),
      makeSummary({
        id: "chase-sapphire-reserve",
        name: "Sapphire Reserve",
        issuer: "Chase",
        best_cpp: 2.05,
        points_pool_id: "chase-ultimate-rewards-transferable",
        points_pool_receiver: true,
        categories: [],
      }),
    ];
    vi.mocked(fetchCards).mockResolvedValue(POOL_SUMMARIES);
    renderPage();

    const diningRow = (await screen.findByRole("rowheader", { name: "Dining" })).closest("tr")!;
    expect(within(diningRow).queryByText("Boosted by points pooling")).not.toBeInTheDocument();
  });

  const CITI_POOL_SUMMARIES: CardSummary[] = [
    makeSummary({
      id: "citi-double-cash",
      name: "Double Cash",
      issuer: "Citi",
      best_cpp: 1,
      points_pool_id: "citi-thankyou-points-transferable",
      categories: [{ category: "Everything", multiplier: "2%", is_base: true }],
    }),
    makeSummary({
      id: "citi-strata",
      name: "Strata",
      issuer: "Citi",
      best_cpp: 1.2,
      points_pool_id: "citi-thankyou-points-transferable",
      categories: [],
    }),
    makeSummary({
      id: "citi-strata-elite",
      name: "Strata Elite",
      issuer: "Citi",
      best_cpp: 1.7,
      points_pool_id: "citi-thankyou-points-transferable",
      points_pool_receiver: true,
      categories: [],
    }),
  ];

  it("doesn't boost one Citi feeder off another feeder with no receiver selected", async () => {
    vi.mocked(fetchCards).mockResolvedValue(CITI_POOL_SUMMARIES);
    renderPage("?cards=citi-double-cash,citi-strata");

    const catchAllRow = (await screen.findByRole("rowheader", { name: /catch-all/i })).closest(
      "tr",
    )!;
    expect(within(catchAllRow).getByText("Double Cash")).toBeInTheDocument();
    expect(within(catchAllRow).queryByText("Boosted by points pooling")).not.toBeInTheDocument();
  });

  it("boosts a Citi feeder to the receiver's value once the receiver is selected", async () => {
    vi.mocked(fetchCards).mockResolvedValue(CITI_POOL_SUMMARIES);
    renderPage("?cards=citi-double-cash,citi-strata-elite");

    const catchAllRow = (await screen.findByRole("rowheader", { name: /catch-all/i })).closest(
      "tr",
    )!;
    expect(within(catchAllRow).getByText("Double Cash")).toBeInTheDocument();
    expect(within(catchAllRow).getByText("Boosted by points pooling")).toBeInTheDocument();
  });
});
