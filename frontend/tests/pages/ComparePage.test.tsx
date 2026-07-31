import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ComparePage from "@/pages/ComparePage";
import type { Card, CardSummary } from "@/types/cards";

vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
}));

import { fetchCard, fetchCards } from "@/api/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "amex-platinum",
    name: "The Platinum Card",
    issuer: "American Express",
    network: "AMERICAN EXPRESS",
    points_program: "Membership Rewards",
    accent_color: "#C4CBD8",
    annual_fee: 895,
    effective_cost: "Depends on usage",
    verdict: { status: "keep", text: "Keep if you use the credits" },
    total_easy_credits: 0,
    total_max_credits: 2984,
    categories: [],
    best_cpp: 1,
    secured_variant_id: null,
    is_secured_variant_of: null,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  const summary = makeSummary(overrides);
  return {
    ...summary,
    earn_rates: [
      { emoji: "✈️", multiplier: "5×", category: "Flights", highlight: true, is_base: false },
    ],
    earn_note: "",
    points: {
      currency: summary.points_program,
      redemption_options: [{ method: "Transfer partners", cpp: 2, best: true }],
      per_100k: "$2,000",
      note: "",
    },
    transfer_partners: { airline_count: 10, hotel_count: 4, highlight: "", recent_changes: "" },
    credits: [],
    insurance: [{ coverage: "Rental car CDW", detail: "Primary", level: "strong" }],
    protection_note: "",
    rental_note: "",
    status_perks: [],
    services: [],
    additional_cards: { title: "", options: [], note: "" },
    timeline: [],
    ...overrides,
  };
}

const ALL_SUMMARIES: CardSummary[] = [
  makeSummary({ id: "amex-platinum", name: "The Platinum Card", issuer: "American Express" }),
  makeSummary({
    id: "chase-sapphire-reserve",
    name: "Sapphire Reserve",
    issuer: "Chase",
    network: "VISA INFINITE",
    points_program: "Ultimate Rewards",
    annual_fee: 795,
  }),
  makeSummary({
    id: "bilt-blue",
    name: "Bilt Blue Card",
    issuer: "Bilt",
    network: "WORLD ELITE MASTERCARD",
    points_program: "Bilt Points",
    annual_fee: 0,
  }),
  makeSummary({
    id: "citi-double-cash",
    name: "Double Cash",
    issuer: "Citi",
    network: "MASTERCARD",
    points_program: "Cash Back",
    annual_fee: 0,
  }),
];

function mockFetchCardImpl(id: string): Promise<Card> {
  const summary = ALL_SUMMARIES.find((c) => c.id === id);
  if (!summary) return Promise.reject(new Error(`unknown fixture id: ${id}`));
  return Promise.resolve(makeCard(summary));
}

function renderPage(initialPath = "/compare") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/" element={<div>Issuers home</div>} />
          <Route path="/cards/:id" element={<div>Card detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(fetchCards).mockResolvedValue(ALL_SUMMARIES);
  vi.mocked(fetchCard).mockImplementation(mockFetchCardImpl);
});

describe("ComparePage", () => {
  it("shows an empty-state prompt when no cards are selected", async () => {
    renderPage("/compare");

    await waitFor(() => {
      expect(screen.getByText(/pick up to 4 cards to compare/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(4);
  });

  it("loads selected cards from the URL and renders the comparison table", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
    expect(screen.getByText("$895")).toBeInTheDocument();
    expect(screen.getByText("$795")).toBeInTheDocument();
  });

  it("shows points value as a small per-100-points figure derived from the best redemption rate", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

    await waitFor(() => {
      expect(screen.getByText("Points value")).toBeInTheDocument();
    });

    const row = screen.getByText("Points value").closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell).toHaveTextContent("$2 per 100 points");
      expect(cell).toHaveTextContent("via Transfer partners");
      expect(cell).not.toHaveTextContent(/per 100k/);
    }
  });

  it("falls back to the per_100k description when a card has no best redemption option", async () => {
    vi.mocked(fetchCard).mockImplementation((id: string) => {
      if (id === "citi-double-cash") {
        return Promise.resolve(
          makeCard({
            ...ALL_SUMMARIES[3],
            points: {
              currency: "Cash Back",
              redemption_options: [],
              per_100k: "$2,000 in statement credits",
              note: "",
            },
          }),
        );
      }
      return mockFetchCardImpl(id);
    });
    renderPage("/compare?cards=citi-double-cash");

    await waitFor(() => {
      expect(screen.getByText("$2,000 in statement credits")).toBeInTheDocument();
    });
  });

  it("shows the credits total from usage already saved on the card's detail page, not a guess", async () => {
    localStorage.setItem(
      "credit-usage",
      JSON.stringify({ "amex-platinum": { uber: 150, clear: 0, fhr: 300 } }),
    );
    vi.mocked(fetchCard).mockImplementation((id: string) => {
      if (id === "amex-platinum") {
        return Promise.resolve(
          makeCard({
            ...ALL_SUMMARIES[0],
            credits: [
              {
                id: "uber",
                name: "Uber Cash",
                subtitle: "$15/mo",
                max_annual: 200,
                default_value: 0,
                tier: "easy",
                removed: false,
                description: "",
                tips: [],
              },
              {
                id: "clear",
                name: "CLEAR Plus",
                subtitle: "",
                max_annual: 200,
                default_value: 0,
                tier: "easy",
                removed: false,
                description: "",
                tips: [],
              },
              {
                id: "fhr",
                name: "Fine Hotels + Resorts",
                subtitle: "",
                max_annual: 600,
                default_value: 0,
                tier: "plan",
                removed: false,
                description: "",
                tips: [],
              },
            ],
          }),
        );
      }
      return mockFetchCardImpl(id);
    });
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByText("Credits (yours / max)")).toBeInTheDocument();
    });

    const row = screen.getByText("Credits (yours / max)").closest("tr")!;
    // Exactly the saved amounts (150 + 0 + 300), not each credit's max or default.
    expect(within(row).getByRole("cell")).toHaveTextContent("$450 / $2984");
    // The link to go back and amend it must stay available even once usage
    // is saved — it should never disappear just because a value was set.
    const adjustLink = within(row).getByRole("link", { name: /Adjust your usage/ });
    expect(adjustLink).toHaveAttribute("href", "/cards/amex-platinum");
  });

  it("shows a hint linking to the card's detail page when no usage has been saved yet", async () => {
    vi.mocked(fetchCard).mockImplementation((id: string) => {
      if (id === "amex-platinum") {
        return Promise.resolve(
          makeCard({
            ...ALL_SUMMARIES[0],
            credits: [
              {
                id: "uber",
                name: "Uber Cash",
                subtitle: "",
                max_annual: 300,
                default_value: 0,
                tier: "easy",
                removed: false,
                description: "",
                tips: [],
              },
            ],
          }),
        );
      }
      return mockFetchCardImpl(id);
    });
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByText("Credits (yours / max)")).toBeInTheDocument();
    });
    const row = screen.getByText("Credits (yours / max)").closest("tr")!;
    expect(within(row).getByRole("cell")).toHaveTextContent("$0 / $2984");
    const hint = within(row).getByRole("link", { name: /Set your usage/ });
    expect(hint).toHaveAttribute("href", "/cards/amex-platinum");
  });

  it("excludes removed credits from the credits total even if the issuer once flagged usage on them", async () => {
    localStorage.setItem("credit-usage", JSON.stringify({ "amex-platinum": { saks: 100 } }));
    vi.mocked(fetchCard).mockImplementation((id: string) => {
      if (id === "amex-platinum") {
        return Promise.resolve(
          makeCard({
            ...ALL_SUMMARIES[0],
            credits: [
              {
                id: "saks",
                name: "Saks",
                subtitle: "",
                max_annual: 100,
                default_value: 0,
                tier: "easy",
                removed: true,
                description: "",
                tips: [],
              },
            ],
          }),
        );
      }
      return mockFetchCardImpl(id);
    });
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByText("Credits (yours / max)")).toBeInTheDocument();
    });
    const row = screen.getByText("Credits (yours / max)").closest("tr")!;
    expect(within(row).getByRole("cell")).toHaveTextContent("$0 / $2984");
  });

  it("picking a card via the search panel fills a slot and updates the URL", async () => {
    renderPage("/compare");

    const addButtons = await screen.findAllByRole("button", { name: "+ Add a card" });
    fireEvent.click(addButtons[0]);
    fireEvent.change(screen.getByLabelText("Search cards"), {
      target: { value: "sapphire reserve" },
    });

    const result = await screen.findByRole("button", { name: /sapphire reserve/i });
    fireEvent.click(result);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(3);
  });

  it("removing a card clears its slot and its table column", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove the platinum card/i }));

    await waitFor(() => {
      expect(screen.queryByRole("columnheader", { name: /the platinum card/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
  });

  it("hides the add-card slot once 4 distinct cards are selected", async () => {
    renderPage(
      "/compare?cards=amex-platinum,chase-sapphire-reserve,bilt-blue,citi-double-cash",
    );

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /double cash/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "+ Add a card" })).not.toBeInTheDocument();
  });

  it("dedupes a repeated card id in the URL instead of double-counting it", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,amex-platinum");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
    });
    // Only 2 distinct cards selected despite 3 ids in the URL -> 2 open slots.
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(2);
  });

  it("the card picker excludes already-selected cards", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(3);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "+ Add a card" })[0]);
    const search = screen.getByLabelText("Search cards");
    fireEvent.change(search, { target: { value: "platinum" } });

    const picker = search.closest(".card-picker") as HTMLElement;
    expect(within(picker).queryByText("The Platinum Card")).not.toBeInTheDocument();
  });

  it("the card picker hides a secured card whose unsecured twin has identical earn rates", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      ...ALL_SUMMARIES,
      makeSummary({
        id: "amex-platinum-secured",
        name: "The Platinum Secured Card",
        issuer: "American Express",
      }),
    ].map((c) =>
      c.id === "amex-platinum" ? { ...c, secured_variant_id: "amex-platinum-secured" } : c,
    ));
    renderPage("/compare");

    const addButtons = await screen.findAllByRole("button", { name: "+ Add a card" });
    fireEvent.click(addButtons[0]);
    const search = screen.getByLabelText("Search cards");
    fireEvent.change(search, { target: { value: "platinum" } });

    const picker = search.closest(".card-picker") as HTMLElement;
    expect(within(picker).getByText("The Platinum Card")).toBeInTheDocument();
    expect(within(picker).queryByText("The Platinum Secured Card")).not.toBeInTheDocument();
  });

  it("sorts multiple results within the same issuer group alphabetically", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      ...ALL_SUMMARIES,
      makeSummary({ id: "amex-gold", name: "American Express® Gold Card", issuer: "American Express" }),
    ]);
    renderPage("/compare");

    const addButtons = await screen.findAllByRole("button", { name: "+ Add a card" });
    fireEvent.click(addButtons[0]);
    const groupLabel = (await screen.findAllByText("American Express")).find((el) =>
      el.classList.contains("card-picker-group-label"),
    )!;
    const group = groupLabel.closest(".card-picker-group") as HTMLElement;
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names[0]).toMatch(/gold/i);
    expect(names[1]).toMatch(/platinum/i);
  });

  it("clicking outside the open picker closes it without selecting a card", async () => {
    renderPage("/compare");

    const addButtons = await screen.findAllByRole("button", { name: "+ Add a card" });
    fireEvent.click(addButtons[0]);
    await screen.findByLabelText("Search cards");

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(4);
  });

  it("links each compared card to its full detail page", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /view full details/i })[0]).toHaveAttribute(
        "href",
        "/cards/amex-platinum",
      );
    });
  });

  it("removing the last selected card drops the cards param entirely", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /remove the platinum card/i }));

    await waitFor(() => {
      expect(screen.getByText(/pick up to 4 cards to compare/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(4);
  });

  it("shows a Status & perks row only when at least one selected card has one", async () => {
    vi.mocked(fetchCard).mockImplementation((id: string) => {
      if (id === "amex-platinum") {
        return Promise.resolve(
          makeCard({
            ...ALL_SUMMARIES[0],
            status_perks: [{ name: "Priority Pass", strength: 5, note: "Unlimited visits" }],
          }),
        );
      }
      return mockFetchCardImpl(id);
    });
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

    await waitFor(() => {
      expect(screen.getByText("Status & perks")).toBeInTheDocument();
    });
    expect(screen.getByText("Priority Pass")).toBeInTheDocument();
  });

  it("closing the picker without selecting anything leaves the slot empty", async () => {
    renderPage("/compare");

    const addButtons = await screen.findAllByRole("button", { name: "+ Add a card" });
    fireEvent.click(addButtons[0]);
    const search = await screen.findByLabelText("Search cards");
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "+ Add a card" })).toHaveLength(4);
  });

  it("seeds the URL from a previously-persisted compare list when none is in the URL", async () => {
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum", "bilt-blue"]));
    renderPage("/compare");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("columnheader", { name: /bilt blue card/i })).toBeInTheDocument();
  });

  it("keeps the persisted compare list in sync with slot edits made on this page", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "+ Add a card" })[0]);
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "sapphire" } });
    fireEvent.click(await screen.findByRole("button", { name: /sapphire reserve/i }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([
        "amex-platinum",
        "chase-sapphire-reserve",
      ]);
    });
  });

  describe("analytics", () => {
    afterEach(() => {
      delete window.gtag;
    });

    it("fires a single debounced compare_cards event once the selection settles", async () => {
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);

      renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(calls).toEqual([
            ["event", "compare_cards", { card_ids: "amex-platinum,chase-sapphire-reserve", card_count: 2 }],
          ]);
        },
        { timeout: 2000 },
      );
    });

    it("excludes ids that don't resolve to a real card from the tracked comparison", async () => {
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);

      renderPage("/compare?cards=amex-platinum,typo-nonexistent-id");

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
      });

      // Wait past the debounce window; only one id resolved to a real card,
      // so the comparison never reached the 2-card minimum — no event fires.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(calls).toEqual([]);
    });
  });
});
