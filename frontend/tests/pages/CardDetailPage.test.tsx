import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CardDetailPage from "@/pages/CardDetailPage";
import type { Card } from "@/types/cards";

// ─── Mock API module ──────────────────────────────────────────────────────────

vi.mock("@/api/cards", () => ({
  fetchCard: vi.fn(),
}));

// Import after mock so we get the mocked version
import { fetchCard } from "@/api/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> = {}): Card {
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
    earn_rates: [
      { emoji: "✈️", multiplier: "5×", category: "Flights", highlight: true, is_base: false },
      { emoji: "💳", multiplier: "1×", category: "Everything else", highlight: false, is_base: true },
    ],
    earn_note: "Put everyday spend on a 2× card.",
    points: {
      currency: "Membership Rewards",
      redemption_options: [
        { method: "Transfer partners", cpp: 2.0, best: true },
        { method: "Statement credit", cpp: 0.6, best: false },
      ],
      per_100k: "$2,000",
      note: "Always transfer, never cash out.",
    },
    transfer_partners: {
      airline_count: 17,
      hotel_count: 3,
      highlight: "Deepest airline list of any bank currency.",
      recent_changes: "Emirates devalued Sep 2025.",
    },
    credits: [
      {
        id: "uber",
        name: "Uber Cash",
        subtitle: "$15/mo",
        max_annual: 200,
        default_value: 0,
        tier: "easy",
        removed: false,
        description: "Monthly Uber Cash for rides and Eats.",
        tips: ["Add the card in the Uber app."],
      },
      {
        id: "fhr",
        name: "Fine Hotels + Resorts",
        subtitle: "$300 × 2",
        max_annual: 600,
        default_value: 0,
        tier: "plan",
        removed: false,
        description: "Semi-annual credit on FHR stays.",
        tips: [],
      },
      {
        id: "saks",
        name: "Saks — REMOVED",
        subtitle: "gone Jul 1, 2026",
        max_annual: 0,
        default_value: 0,
        tier: "niche",
        removed: true,
        description: "The $100/yr Saks credit was removed.",
        tips: [],
      },
    ],
    insurance: [
      { coverage: "Purchase protection", detail: "$10k/claim", level: "strong" },
      { coverage: "Baggage delay", detail: "Not covered", level: "none" },
    ],
    protection_note: "Purchase protection is best-in-class.",
    rental_note: "Use CSR or Venture X for rentals.",
    status_perks: [
      { name: "Global Lounge Collection", strength: 5, note: "Best in class." },
    ],
    services: [
      { name: "Platinum Concierge", detail: "24/7 help booking dining and travel." },
    ],
    additional_cards: {
      title: "Two ways to share it",
      options: [],
      note: "Up to 3 additional cards.",
    },
    timeline: [
      { date: "Jul 1, 2026", type: "cut", badge: "Cut", text: "Saks credit removed." },
      { date: "Sep 2025", type: "add", badge: "Refresh", text: "Major refresh." },
    ],
    ...overrides,
  };
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPage(cardId = "amex") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/cards/${cardId}`]}>
        <Routes>
          <Route path="/cards/:id" element={<CardDetailPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardDetailPage", () => {
  describe("loading state", () => {
    it("shows a loading skeleton while the query is pending", () => {
      // Never resolves — query stays in loading state
      vi.mocked(fetchCard).mockReturnValue(new Promise(() => {}));

      renderPage();

      expect(screen.getByRole("status", { name: /loading card details/i })).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows a generic error message on server failure", async () => {
      vi.mocked(fetchCard).mockRejectedValue(new Error("Server error 500: Internal Server Error"));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Failed to load card")).toBeInTheDocument();
      });
      expect(screen.getByText(/Server error 500/)).toBeInTheDocument();
    });

    it("shows 'Card not found' message on 404", async () => {
      vi.mocked(fetchCard).mockRejectedValue(new Error("Server error 404: Not Found"));

      renderPage("nonexistent");

      await waitFor(() => {
        expect(screen.getByText("Card not found")).toBeInTheDocument();
      });
      expect(screen.getByText(/This card doesn't exist/)).toBeInTheDocument();
    });

    it("shows 'Back to dashboard' link on error", async () => {
      vi.mocked(fetchCard).mockRejectedValue(new Error("Server error 404: Not Found"));

      renderPage("bad-id");

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /back to dashboard/i })).toBeInTheDocument();
      });
    });

    it("shows a network error message when backend is unreachable", async () => {
      vi.mocked(fetchCard).mockRejectedValue(
        new Error("Could not reach the backend. Check that the server is running."),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Could not reach the backend/)).toBeInTheDocument();
      });
    });
  });

  describe("success state", () => {
    it("renders card name and issuer", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.getByText("American Express")).toBeInTheDocument();
    });

    it("renders the verdict badge", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Keep if you use the credits")).toBeInTheDocument();
      });
    });

    it("renders annual fee, max credits, and best-case net", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ annual_fee: 895, total_max_credits: 2984 }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("$895")).toBeInTheDocument();
      });
      expect(screen.getByText("$2984")).toBeInTheDocument();
      expect(screen.getByText("+$2089")).toBeInTheDocument();
    });

    it("renders credits grouped under their tier labels", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      // "Easy" appears as both a tier heading <p> and a credit badge <span>
      await waitFor(() => {
        expect(screen.getAllByText("Easy").length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getAllByText("Plan ahead").length).toBeGreaterThanOrEqual(1);
    });

    it("renders active credit names", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Uber Cash")).toBeInTheDocument();
      });
      expect(screen.getByText("Fine Hotels + Resorts")).toBeInTheDocument();
    });

    it("renders removed credits with Removed badge", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Removed")).toBeInTheDocument();
      });
    });

    it("renders earn rates", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("5×")).toBeInTheDocument();
      });
      expect(screen.getByText("Flights")).toBeInTheDocument();
    });

    it("renders points section with best redemption option", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Transfer partners")).toBeInTheDocument();
      });
      expect(screen.getByText("2¢/pt")).toBeInTheDocument();
    });

    it("renders insurance coverage items", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Purchase protection")).toBeInTheDocument();
      });
    });

    it("renders timeline events", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Saks credit removed.")).toBeInTheDocument();
      });
      expect(screen.getByText("Major refresh.")).toBeInTheDocument();
    });

    it("renders the back navigation link", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /all cards/i })).toBeInTheDocument();
      });
    });
  });
});
