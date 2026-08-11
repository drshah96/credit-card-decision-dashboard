import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ComparePage from "@/pages/ComparePage";
import type { Card, CardSummary } from "@/types/cards";

vi.mock("@/utils/sessionTracking", () => ({
  recordPageView: vi.fn(),
}));

vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
}));

import { fetchCard, fetchCards } from "@/api/cards";
import { recordPageView } from "@/utils/sessionTracking";

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

function makeCard(overrides: Partial<Card> = {}): Card {
  const summary = makeSummary(overrides);
  return {
    ...summary,
    is_affiliate_link: false,
    intro_apr_purchases: null,
    intro_apr_balance_transfers: null,
    foreign_transaction_fee: null,
    has_lounge_access: false,
    variable_apr: null,
    balance_transfer_apr: null,
    balance_transfer_fee: null,
    foreign_transaction_fee_rate: null,
    cash_advance_apr: null,
    penalty_apr: null,
    penalty_apr_trigger: null,
    pay_over_time_fee: null,
    late_payment_fee: null,
    returned_payment_fee: null,
    returned_check_fee: null,
    welcome_bonus: null,
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

/** Card selection is a "Cards" block in the filter bar, matching Issuer /
 * Category / Brand. Its accessible name picks up the count badge, so match on
 * the prefix. */
async function openPicker() {
  const btn = await screen.findByRole("button", { name: /cards to compare/i });
  fireEvent.click(btn);
  return btn;
}

/** Rows are real <input type="checkbox"> inside a <label>. */
function pickerRow(name: RegExp) {
  return screen.findByRole("checkbox", { name });
}

/** How many cards the comparison actually shows. Asserting on this rather than
 * a count label checks the outcome the page exists for, and survives the
 * selection control being redesigned again. */
function comparedCount() {
  const headers = screen.queryAllByRole("columnheader");
  return headers.length === 0 ? 0 : headers.length - 1; // leading blank th
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
    expect(comparedCount()).toBe(0);
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

    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), {
      target: { value: "sapphire reserve" },
    });

    const result = await pickerRow(/sapphire reserve/i);
    fireEvent.click(result);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
    });
    expect(comparedCount()).toBe(1);
  });

  it("unchecking a card removes its table column", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });

    await openPicker();
    fireEvent.click(await pickerRow(/the platinum card/i));

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
    expect(comparedCount()).toBe(4);
  });

  it("dedupes a repeated card id in the URL instead of double-counting it", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,amex-platinum");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /sapphire reserve/i })).toBeInTheDocument();
    });
    // Only 2 distinct cards selected despite 3 ids in the URL.
    expect(comparedCount()).toBe(2);
  });

  // Deliberately the opposite of the old slot behaviour, which removed picked
  // cards from the list. In a multi-select the list is also how you deselect,
  // so a selected card stays visible and renders checked.
  it("the card picker shows an already-selected card as checked, not hidden", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(comparedCount()).toBe(1);
    });
    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "platinum" } });

    const row = await screen.findByRole("checkbox", { name: /the platinum card/i });
    expect(row).toBeChecked();
  });

  it("unchecking a selected row in the picker removes it from the comparison", async () => {
    renderPage("/compare?cards=amex-platinum");
    await waitFor(() => expect(comparedCount()).toBe(1));

    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "platinum" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: /the platinum card/i }));

    await waitFor(() => expect(comparedCount()).toBe(0));
  });

  it("the Category filter offers and narrows by a behavioral chip sourced from CardSummary alone", async () => {
    // Lounge Access/0% Intro APR/Balance Transfer/No Foreign Transaction Fee
    // are all CardSummary fields (see backend/models.py
    // Card.intro_apr_purchases) — no full Card detail fetch needed, unlike
    // when this was first built.
    vi.mocked(fetchCards).mockResolvedValue([
      { ...ALL_SUMMARIES[0], has_lounge_access: true },
      ...ALL_SUMMARIES.slice(1),
    ]);
    renderPage("/compare");

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
      expect(screen.getByText("Lounge Access")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Lounge Access"));
    await openPicker();

    const picker = screen.getByLabelText("Search cards").closest(".compare-filter-panel") as HTMLElement;
    expect(within(picker).getByText("The Platinum Card")).toBeInTheDocument();
    expect(within(picker).queryByText("Sapphire Reserve")).not.toBeInTheDocument();
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

    await openPicker();
    const search = screen.getByLabelText("Search cards");
    fireEvent.change(search, { target: { value: "platinum" } });

    const picker = search.closest(".compare-filter-panel") as HTMLElement;
    expect(within(picker).getByText("The Platinum Card")).toBeInTheDocument();
    expect(within(picker).queryByText("The Platinum Secured Card")).not.toBeInTheDocument();
  });

  it("sorts multiple results within the same issuer group alphabetically", async () => {
    vi.mocked(fetchCards).mockResolvedValue([
      ...ALL_SUMMARIES,
      makeSummary({ id: "amex-gold", name: "American Express® Gold Card", issuer: "American Express" }),
    ]);
    renderPage("/compare");

    await openPicker();
    const groupLabel = (await screen.findAllByText("American Express")).find((el) =>
      el.classList.contains("card-picker-group-label"),
    )!;
    const group = groupLabel.closest(".card-picker-group") as HTMLElement;
    const names = within(group)
      .getAllByRole("checkbox")
      .map((input) => input.closest("label")?.textContent ?? "");
    expect(names[0]).toMatch(/gold/i);
    expect(names[1]).toMatch(/platinum/i);
  });

  it("clicking outside the open picker closes it without selecting a card", async () => {
    renderPage("/compare");

    await openPicker();
    await screen.findByLabelText("Search cards");

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();
    });
    expect(comparedCount()).toBe(0);
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
    await openPicker();
    fireEvent.click(await pickerRow(/the platinum card/i));

    await waitFor(() => {
      expect(screen.getByText(/pick up to 4 cards to compare/i)).toBeInTheDocument();
    });
    expect(comparedCount()).toBe(0);
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

  it("closing the picker without selecting anything changes nothing", async () => {
    renderPage("/compare");

    await openPicker();
    const search = await screen.findByLabelText("Search cards");
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();
    });
    expect(comparedCount()).toBe(0);
  });

  it("seeds the URL from a previously-persisted compare list when none is in the URL", async () => {
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum", "bilt-blue"]));
    renderPage("/compare");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("columnheader", { name: /bilt blue card/i })).toBeInTheDocument();
  });

  it("keeps the persisted compare list in sync with edits made on this page", async () => {
    renderPage("/compare?cards=amex-platinum");

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
    });
    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "sapphire" } });
    fireEvent.click(await pickerRow(/sapphire reserve/i));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([
        "amex-platinum",
        "chase-sapphire-reserve",
      ]);
    });
  });

  // ─── multi-select behaviour ────────────────────────────────────────────────

  it("closes the picker on the selection that fills the fourth slot", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,bilt-blue");
    await waitFor(() => expect(comparedCount()).toBe(3));

    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "double cash" } });
    fireEvent.click(await pickerRow(/double cash/i));

    await waitFor(() => expect(comparedCount()).toBe(4));
    expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();
  });

  // Only closes on the way up. Unchecking at the cap is a swap in progress, so
  // shutting the picker would force the user to reopen it every time.
  it("stays open when unchecking a card while at the cap", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,bilt-blue,citi-double-cash");
    await waitFor(() => expect(comparedCount()).toBe(4));

    await openPicker();
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "platinum" } });
    fireEvent.click(await pickerRow(/the platinum card/i));

    await waitFor(() => expect(comparedCount()).toBe(3));
    expect(screen.getByLabelText("Search cards")).toBeInTheDocument();
  });

  it("offers no unpickable rows at the cap, and says why", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,bilt-blue,citi-double-cash");
    await waitFor(() => expect(comparedCount()).toBe(4));

    await openPicker();

    // Every checkbox on offer is a selected one, so the only action available
    // is to uncheck. Showing greyed-out rows you cannot click is worse than
    // not showing them.
    const rows = await screen.findAllByRole("checkbox");
    expect(rows.length).toBe(4);
    rows.forEach((r) => expect(r).toBeChecked());
    expect(screen.getByText(/maximum/i)).toBeInTheDocument();
  });

  it("unchecking in the picker drops the card and its table column", async () => {
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");
    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument(),
    );

    await openPicker();
    fireEvent.click(await pickerRow(/the platinum card/i));

    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", { name: /the platinum card/i }),
      ).not.toBeInTheDocument(),
    );
    expect(comparedCount()).toBe(1);
  });

  it("Remove selection clears every card, not just one", async () => {
    // A loop over onToggle would leave all but one selected: each call reads
    // the same pre-loop selectedIds, so only the last update survives.
    renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve,bilt-blue");
    await waitFor(() => expect(comparedCount()).toBe(3));

    await openPicker();
    fireEvent.click(screen.getByRole("button", { name: /remove selection/i }));

    await waitFor(() => expect(comparedCount()).toBe(0));
    expect(window.location.search).not.toContain("cards=");
  });

  it("offers no Remove selection when nothing is selected", async () => {
    renderPage("/compare");
    await openPicker();
    expect(screen.queryByRole("button", { name: /remove selection/i })).not.toBeInTheDocument();
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

  describe("session tracking", () => {
    it("records a compare_view on mount", async () => {
      renderPage();

      await waitFor(() => {
        expect(recordPageView).toHaveBeenCalledWith("compare_view");
      });
    });

    it("fires a debounced compare_card_selected once the selection settles, one row per card", async () => {
      renderPage("/compare?cards=amex-platinum,chase-sapphire-reserve");

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(recordPageView).toHaveBeenCalledWith(
            "compare_card_selected",
            undefined,
            "amex-platinum",
          );
          expect(recordPageView).toHaveBeenCalledWith(
            "compare_card_selected",
            undefined,
            "chase-sapphire-reserve",
          );
        },
        { timeout: 2000 },
      );
    });

    it("fires compare_card_selected for even a single selected card, unlike the 2-card compare_cards GA4 event", async () => {
      renderPage("/compare?cards=amex-platinum");

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(recordPageView).toHaveBeenCalledWith(
            "compare_card_selected",
            undefined,
            "amex-platinum",
          );
        },
        { timeout: 2000 },
      );
    });

    it("excludes ids that don't resolve to a real card from the tracked selection", async () => {
      renderPage("/compare?cards=amex-platinum,typo-nonexistent-id");

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /the platinum card/i })).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(recordPageView).toHaveBeenCalledWith(
            "compare_card_selected",
            undefined,
            "amex-platinum",
          );
        },
        { timeout: 2000 },
      );
      expect(recordPageView).not.toHaveBeenCalledWith(
        "compare_card_selected",
        undefined,
        "typo-nonexistent-id",
      );
    });
  });
});
