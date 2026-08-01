import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IssuerCardsPage from "@/pages/IssuerCardsPage";
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
    points_pool_id: null,
    points_pool_receiver: false,
    ...overrides,
  };
}

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

const AMEX_SUMMARIES: CardSummary[] = [
  makeSummary({ id: "amex-platinum", name: "The Platinum Card" }),
  makeSummary({ id: "amex-delta-skymiles-gold", name: "Delta SkyMiles Gold", points_program: "Delta SkyMiles" }),
  makeSummary({ id: "amex-hilton-honors-aspire", name: "Hilton Honors Aspire", points_program: "Hilton Honors" }),
  makeSummary({ id: "amex-marriott-bonvoy-bevy", name: "Marriott Bonvoy Bevy", points_program: "Marriott Bonvoy" }),
];

function mockFetchCardImpl(id: string): Promise<Card> {
  const summary = AMEX_SUMMARIES.find((c) => c.id === id);
  if (!summary) return Promise.reject(new Error(`unknown fixture id: ${id}`));
  return Promise.resolve(makeCard(summary));
}

// Displays whatever router `state` it was navigated with, so a test can
// assert on the `state.from` a card tile's Link passes along — a plain
// static stub route can't observe that (state isn't part of the URL).
function CardDetailStateProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <div>Card detail (from: {from ?? "none"})</div>;
}

function renderPage(slug = "amex", search = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/issuer/${slug}${search}`]}>
        <Routes>
          <Route path="/issuer/:issuerSlug" element={<IssuerCardsPage />} />
          <Route path="/" element={<div>Issuers home</div>} />
          <Route path="/cards/:id" element={<CardDetailStateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(fetchCard).mockImplementation(mockFetchCardImpl);
});

describe("IssuerCardsPage", () => {
  it("shows an unknown-issuer message for a bad slug and a link home", () => {
    vi.mocked(fetchCards).mockReturnValue(new Promise(() => {}));
    renderPage("not-a-real-bank");

    expect(screen.getByText("Unknown issuer.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all issuers/i })).toHaveAttribute("href", "/");
  });

  it("shows the issuer name and card count once loaded", async () => {
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex");

    expect(screen.getByRole("heading", { name: "American Express Cards" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("4 cards")).toBeInTheDocument();
    });
  });

  it("hides a secured card whose unsecured twin is also in this issuer's lineup", async () => {
    const summaries = [
      ...AMEX_SUMMARIES,
      makeSummary({
        id: "amex-platinum-secured",
        name: "The Platinum Secured Card",
        issuer: "American Express",
        secured_variant_id: null,
      }),
    ];
    // The unsecured primary carries the pairing, not the secured card itself.
    summaries[0] = { ...summaries[0], secured_variant_id: "amex-platinum-secured" };
    vi.mocked(fetchCards).mockResolvedValue(summaries);
    renderPage("amex");

    await waitFor(() => {
      expect(screen.getByText("4 cards")).toBeInTheDocument();
    });
    expect(screen.queryByText("The Platinum Secured Card")).not.toBeInTheDocument();
  });

  it("shows a loading placeholder instead of \"0 cards\" while the catalog is still loading", () => {
    // A never-resolving fetch pins the page in its loading state — regression
    // guard for issuerCards.length rendering as "0 cards" before isLoading
    // was checked, instead of some kind of loading indicator.
    vi.mocked(fetchCards).mockReturnValue(new Promise(() => {}));
    renderPage("amex");

    expect(screen.getByRole("heading", { name: "American Express Cards" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("0 cards")).not.toBeInTheDocument();
  });

  it("defaults to the All Cards filter, grouped into sections", async () => {
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "All Cards" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByText("Flagship Cards")).toBeInTheDocument();
    // Named after its brand even though it's the only airline program in this fixture.
    expect(screen.getByText("Delta SkyMiles Cards")).toBeInTheDocument();
    // Two hotel brands (Hilton, Marriott) -> each gets its own section.
    expect(screen.getByText("Hilton Honors Cards")).toBeInTheDocument();
    expect(screen.getByText("Marriott Bonvoy Cards")).toBeInTheDocument();
  });

  it("only shows filter chips that actually apply to this issuer's cards", async () => {
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Airline" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delta SkyMiles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hilton Honors" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marriott Bonvoy" })).toBeInTheDocument();
    // No card in this fixture is on the Southwest program, so that chip
    // shouldn't render at all.
    expect(screen.queryByRole("button", { name: "Southwest Rapid Rewards" })).not.toBeInTheDocument();
  });

  it("switches to a flat filtered grid when a chip is clicked", async () => {
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Airline" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Airline" }));

    expect(screen.getByRole("button", { name: "Airline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Flagship Cards")).not.toBeInTheDocument();
    expect(screen.getByText("Delta SkyMiles Gold")).toBeInTheDocument();
    expect(screen.queryByText("The Platinum Card")).not.toBeInTheDocument();
  });

  it("restores the active filter from the URL on mount, instead of defaulting to All Cards", async () => {
    // Simulates arriving back at this page (e.g. via the card detail page's
    // back link, or the browser's back button) after a filter was already
    // selected — the filter must come from the URL, not a fresh useState.
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex", "?filter=Airline");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Airline" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByText("Delta SkyMiles Gold")).toBeInTheDocument();
    expect(screen.queryByText("The Platinum Card")).not.toBeInTheDocument();
  });

  it("links each card tile to its detail page, passing the current filtered URL as router state", async () => {
    // So the detail page's back link can return here with the same filter
    // still active, instead of resetting to All Cards.
    vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
    renderPage("amex", "?filter=Airline");

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /view delta skymiles gold details/i })).toHaveAttribute(
        "href",
        "/cards/amex-delta-skymiles-gold",
      );
    });

    fireEvent.click(screen.getByRole("link", { name: /view delta skymiles gold details/i }));

    expect(screen.getByText("Card detail (from: /issuer/amex?filter=Airline)")).toBeInTheDocument();
  });

  describe("select cards mode", () => {
    it("hides compare toggles until 'Select cards' is clicked, then reveals them", async () => {
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select cards" })).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /add the platinum card to compare/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Select cards" }));

      expect(screen.getByRole("button", { name: "Done selecting" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        screen.getByRole("button", { name: /add the platinum card to compare/i }),
      ).toBeInTheDocument();
    });

    it("clicking a card's compare circle in select mode adds it without navigating", async () => {
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select cards" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));

      expect(
        screen.getByRole("button", { name: /remove the platinum card from compare/i }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual(["amex-platinum"]);
      // Still on the issuer page — the click didn't follow the tile's link.
      expect(screen.getByRole("heading", { name: "American Express Cards" })).toBeInTheDocument();
    });

    it("clicking 'Done selecting' hides the compare circles again", async () => {
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select cards" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
      fireEvent.click(screen.getByRole("button", { name: "Done selecting" }));

      expect(screen.getByRole("button", { name: "Select cards" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(
        screen.queryByRole("button", { name: /add the platinum card to compare/i }),
      ).not.toBeInTheDocument();
    });

    it("picking cards persists them, but this page's own toolbar has no Remove Selection or Compare link — those live in the CompareTray", async () => {
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select cards" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));
      fireEvent.click(
        screen.getByRole("button", { name: /add delta skymiles gold to compare/i }),
      );

      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([
        "amex-platinum",
        "amex-delta-skymiles-gold",
      ]);
      expect(screen.queryByRole("button", { name: "Remove Selection" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /compare \(/i })).not.toBeInTheDocument();
      // The toggle itself still works normally alongside the picks.
      expect(screen.getByRole("button", { name: "Done selecting" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("picks survive navigating to a card and back — the reported bug", async () => {
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select cards" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
      fireEvent.click(screen.getByRole("button", { name: /add the platinum card to compare/i }));

      // Simulate the remount that happens after visiting a card's detail
      // page and hitting the browser back button.
      cleanup();
      renderPage("amex");

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /remove the platinum card from compare/i }),
        ).toHaveAttribute("aria-pressed", "true");
      });
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual(["amex-platinum"]);
    });

    it("mounting with cards already picked (e.g. back from a detail page) starts in select mode, not 'Select cards'", async () => {
      localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum"]));
      vi.mocked(fetchCards).mockResolvedValue(AMEX_SUMMARIES);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Done selecting" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
      expect(screen.queryByRole("button", { name: "Select cards" })).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /remove the platinum card from compare/i }),
      ).toBeInTheDocument();
    });
  });
});
