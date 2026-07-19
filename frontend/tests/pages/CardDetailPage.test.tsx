import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CardDetailPage from "@/pages/CardDetailPage";
import type { Card, Credit } from "@/types/cards";

// ─── Mock API module ──────────────────────────────────────────────────────────

vi.mock("@/api/cards", () => ({
  fetchCard: vi.fn(),
}));

// Import after mock so we get the mocked version
import { fetchCard } from "@/api/cards";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCredit(overrides: Partial<Credit> = {}): Credit {
  return {
    id: "uber",
    name: "Uber Cash",
    subtitle: "$15/mo",
    max_annual: 200,
    default_value: 0,
    tier: "easy",
    removed: false,
    description: "Monthly Uber Cash for rides and Eats.",
    tips: [],
    ...overrides,
  };
}

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

    it("shows 'Unknown error' when the thrown value is not an Error instance", async () => {
      // Non-Error throws (e.g. a plain string) hit the `error instanceof Error` false branch
      vi.mocked(fetchCard).mockRejectedValue("plain string error");

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Unknown error")).toBeInTheDocument();
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
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ annual_fee: 895, credits: [makeCredit({ max_annual: 2984 })] }),
      );

      renderPage();

      await waitFor(() => {
        // $895 appears in both the header strip and the calculator
        expect(screen.getAllByText("$895").length).toBeGreaterThanOrEqual(2);
      });
      // "$2984" also appears on the credit row's own max badge — assert at least one
      expect(screen.getAllByText("$2984").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("+$2089")).toBeInTheDocument();
    });

    it("renders credits grouped under their tier labels", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Effortless")).toBeInTheDocument();
      });
      expect(screen.getByText("Plan a little")).toBeInTheDocument();
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
        // "Transfer partners" appears twice: once as the panel heading, once as the redemption method
        expect(screen.getAllByText("Transfer partners").length).toBeGreaterThanOrEqual(2);
      });
      expect(screen.getByText("2.00¢")).toBeInTheDocument();
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

    it("shows net cost as a plain amount when annual fee exceeds max credits", async () => {
      // netCost = 395 - 100 = 295 > 0 → shows "$295" (not "+$295")
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ annual_fee: 395, credits: [makeCredit({ max_annual: 100 })] }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("$295")).toBeInTheDocument();
      });
    });

    it("hides the Services section when the card has no services", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ services: [] }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText("Included Services")).not.toBeInTheDocument();
    });

    it("renders multiple services with each service visible", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          services: [
            { name: "Platinum Concierge", detail: "24/7 help booking dining and travel." },
            { name: "Car Rental Privileges", detail: "Elite status with Hertz and Avis." },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Platinum Concierge")).toBeInTheDocument();
      });
      expect(screen.getByText("Car Rental Privileges")).toBeInTheDocument();
    });

    it("renders a status perk with partial strength (some pips unfilled)", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          status_perks: [
            { name: "Marriott Gold", strength: 3, note: "Mid-tier hotel status." },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        // Strength 3/5 means dots 4 and 5 are unfilled — exercises the bg-white/10 branch
        expect(screen.getByLabelText(/Strength: 3 out of 5/)).toBeInTheDocument();
      });
    });

    it("renders the additional cards section when options are present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          additional_cards: {
            title: "Share it",
            options: [
              {
                name: "Companion Platinum",
                fee: "$0",
                is_free: true,
                benefits: [
                  { text: "Earns Membership Rewards", included: true },
                  { text: "No lounge access", included: false },
                ],
              },
            ],
            note: "Up to 3 additional cards.",
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Companion Platinum")).toBeInTheDocument();
      });
      expect(screen.getByText("Earns Membership Rewards")).toBeInTheDocument();
      expect(screen.getByText("No lounge access")).toBeInTheDocument();
      expect(screen.getByText("Up to 3 additional cards.")).toBeInTheDocument();
    });

    it("shows '— none here —' for an empty tier group", async () => {
      // Fixture: uber=easy, fhr=plan, saks is removed → niche group is empty
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("— none here —")).toBeInTheDocument();
      });
    });

    it("shows '0 transfer out' when airline and hotel counts are both zero", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          transfer_partners: {
            airline_count: 0,
            hotel_count: 0,
            highlight: "No transfer partners.",
            recent_changes: "",
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        // Rendered as <b>0</b>transfer out — queryable as combined text content
        expect(screen.getByText(/transfer out/)).toBeInTheDocument();
      });
      // airline/hotel counts should NOT appear
      expect(screen.queryByText(/airlines/)).not.toBeInTheDocument();
    });

    it("renders protection_note when present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Purchase protection is best-in-class.")).toBeInTheDocument();
      });
    });

    it("does not render protection_note when absent", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ protection_note: "" }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText("Purchase protection is best-in-class.")).not.toBeInTheDocument();
    });

    it("renders rental_note when present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Use CSR or Venture X for rentals.")).toBeInTheDocument();
      });
    });

    it("does not render rental_note when absent", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ rental_note: "" }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText("Use CSR or Venture X for rentals.")).not.toBeInTheDocument();
    });

    it("renders pip label 'elite' for maximum-strength perk", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          status_perks: [
            { name: "Global Lounge Collection", strength: 5, note: "Best in class." },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/Strength: 5 out of 5/)).toBeInTheDocument();
      });
      expect(screen.getByText("elite")).toBeInTheDocument();
    });

    it("renders correct dot class for each insurance level", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          insurance: [
            { coverage: "Strong Coverage", detail: "$10k", level: "strong" },
            { coverage: "Good Coverage", detail: "$5k", level: "good" },
            { coverage: "Mid Coverage", detail: "$1k", level: "mid" },
            { coverage: "No Coverage", detail: "None", level: "none" },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Strong Coverage")).toBeInTheDocument();
      });

      // Insurance grid splits into two halves; DOM order matches original array order
      const dots = document.querySelectorAll(".ins-dot");
      expect(dots[0]).toHaveClass("d-strong");
      expect(dots[1]).toHaveClass("d-good");
      expect(dots[2]).toHaveClass("d-mid");
      expect(dots[3]).toHaveClass("d-none");
    });
  });

  describe("credit calculator", () => {
    it("renders the calculator panel with the annual fee", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(/Will the credits offset the \$895 fee/),
        ).toBeInTheDocument();
      });
    });

    it("shows $0 credits used when all default_values are 0", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Will the credits offset the \$895 fee/)).toBeInTheDocument();
      });
      // With all default_values at 0, credits used = $0
      const creditsUsed = screen.getAllByText("$0");
      expect(creditsUsed.length).toBeGreaterThanOrEqual(1);
    });

    it("shows correct initial sum when default_values are non-zero", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          annual_fee: 395,
          credits: [
            {
              id: "travel",
              name: "Annual Travel Credit",
              subtitle: "Capital One Travel",
              max_annual: 300,
              default_value: 300,
              tier: "easy",
              removed: false,
              description: "A $300 credit on portal bookings.",
              tips: [],
            },
            {
              id: "anniv",
              name: "Anniversary Miles",
              subtitle: "auto-posted",
              max_annual: 100,
              default_value: 100,
              tier: "easy",
              removed: false,
              description: "10,000 miles on anniversary.",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        // Credits used = $300 + $100 = $400, fee = $395, net = +$5 — shown both in the
        // header's best-case net (same $400 total, since max_annual == default_value here)
        // and the calculator's verdict, so at least one match rather than exactly one.
        expect(screen.getAllByText("+$5").length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getByText("Ahead by")).toBeInTheDocument();
    });

    it("updates the calculator when a slider is changed", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/How much of Uber Cash/i)).toBeInTheDocument();
      });

      // Move Uber Cash slider to $150
      fireEvent.change(screen.getByLabelText(/How much of Uber Cash/i), {
        target: { value: "150" },
      });

      // $150 credits used, $895 fee, short by $745
      expect(screen.getByText("−$745")).toBeInTheDocument();
    });

    it("resets all sliders to default values when Reset is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/How much of Uber Cash/i)).toBeInTheDocument();
      });

      // Move slider, then reset
      fireEvent.change(screen.getByLabelText(/How much of Uber Cash/i), {
        target: { value: "200" },
      });
      expect(screen.getByText("−$695")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /reset sliders/i }));

      // Back to $0 (all default_values are 0 in the fixture)
      expect(screen.getByText("−$895")).toBeInTheDocument();
    });

    it("moves a credit to a different tier when tier button is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Move Uber Cash to harder tier/i })).toBeInTheDocument();
      });

      // Uber Cash starts in "easy" — ▲ is disabled (already at top tier)
      expect(screen.getByRole("button", { name: /Move Uber Cash to easier tier/i })).toBeDisabled();

      // Move Uber Cash DOWN to "plan"
      fireEvent.click(screen.getByRole("button", { name: /Move Uber Cash to harder tier/i }));

      // Now in "plan" — ▲ is enabled (can move back to easy)
      expect(screen.getByRole("button", { name: /Move Uber Cash to easier tier/i })).not.toBeDisabled();
    });

    it("shows 'No monetary value' for a non-removed credit with max_annual of 0", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          credits: [
            {
              id: "zero",
              name: "Zero Max Credit",
              subtitle: "no cash value",
              max_annual: 0,
              default_value: 0,
              tier: "easy",
              removed: false,
              description: "",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("No monetary value")).toBeInTheDocument();
      });
    });

    it("does not render the tips section when a credit has no description or tips", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          credits: [
            {
              id: "bare",
              name: "Bare Credit",
              subtitle: "no extras",
              max_annual: 100,
              default_value: 0,
              tier: "easy",
              removed: false,
              description: "",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Bare Credit")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Tips & details/)).not.toBeInTheDocument();
    });

    it("renders a Reset sliders button", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /reset sliders/i })).toBeInTheDocument();
      });
    });

    it("renders a progress bar labelled with fee coverage", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("progressbar", { name: /\$0 of \$895 fee covered/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows 'most of the fee' verdict when credits cover 60–99% of the fee", async () => {
      // fee=$395, default_value=$260 → 65.8% coverage (>= 60% but < 100%)
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          annual_fee: 395,
          credits: [
            {
              id: "travel",
              name: "Travel Credit",
              subtitle: "Portal",
              max_annual: 300,
              default_value: 260,
              tier: "easy",
              removed: false,
              description: "Travel credit.",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Credits recoup/i)).toBeInTheDocument();
      });
      // "most" branch verdict — not the "only recoup" (<60%) branch
      expect(screen.queryByText(/Credits only recoup/i)).not.toBeInTheDocument();
    });

    it("shows 'only recoup' verdict when credits cover less than 60% of the fee", async () => {
      // fee=$895, default_value=$150 → 16.8% coverage (< 60%)
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          annual_fee: 895,
          credits: [
            {
              id: "travel",
              name: "Travel Credit",
              subtitle: "Portal",
              max_annual: 300,
              default_value: 150,
              tier: "easy",
              removed: false,
              description: "Travel credit.",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Credits only recoup/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/\$150 of \$895/i)).toBeInTheDocument();
      // "only recoup" branch verdict — not the "most" branch
      expect(screen.queryByText(/Credits recoup.*most/i)).not.toBeInTheDocument();
    });

    it("moves a credit up to an easier tier when the up button is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Move Uber Cash to harder tier/i })).toBeInTheDocument();
      });

      // Move Uber Cash DOWN to "plan" — ▲ becomes enabled
      fireEvent.click(screen.getByRole("button", { name: /Move Uber Cash to harder tier/i }));
      expect(screen.getByRole("button", { name: /Move Uber Cash to easier tier/i })).not.toBeDisabled();

      // Move it back UP to "easy" — ▲ becomes disabled again (back at top tier)
      fireEvent.click(screen.getByRole("button", { name: /Move Uber Cash to easier tier/i }));
      expect(screen.getByRole("button", { name: /Move Uber Cash to easier tier/i })).toBeDisabled();
    });

    it("shows 'more than cover the fee' verdict when credits exceed the fee", async () => {
      // totalUsed=350, annualFee=300 → net=+50 → net >= 0 branch
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          annual_fee: 300,
          credits: [
            {
              id: "travel",
              name: "Travel Credit",
              subtitle: "Portal",
              max_annual: 400,
              default_value: 350,
              tier: "easy",
              removed: false,
              description: "Travel credit.",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/more than cover the fee/i)).toBeInTheDocument();
      });
      expect(screen.getByText("Ahead by")).toBeInTheDocument();
      expect(screen.getByText("+$50")).toBeInTheDocument();
    });

    it("clamps progress bar aria-valuenow to annual fee when credits exceed fee", async () => {
      // totalUsed=350, annualFee=300 → Math.min(350, 300) = 300 = aria-valuemax
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          annual_fee: 300,
          credits: [
            {
              id: "travel",
              name: "Travel Credit",
              subtitle: "Portal",
              max_annual: 400,
              default_value: 350,
              tier: "easy",
              removed: false,
              description: "Travel credit.",
              tips: [],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuenow", "300");
        expect(bar).toHaveAttribute("aria-valuemax", "300");
      });
    });
  });

  describe("credit modal", () => {
    it("opens the modal when a credit name button is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Monthly Uber Cash for rides and Eats.")).toBeInTheDocument();
    });

    it("shows the tier label and credit name in the modal header", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));

      // Uber Cash is in the "easy" tier → "Effortless credit"
      expect(screen.getByText(/Effortless credit/i)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Uber Cash" })).toBeInTheDocument();
      expect(screen.getByText("Up to $200/yr")).toBeInTheDocument();
    });

    it("renders tricks & hacks tips in the modal", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));

      expect(screen.getByText("Add the card in the Uber app.")).toBeInTheDocument();
    });

    it("closes the modal when the X button is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Close/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes the modal when the backdrop is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Click the backdrop (the fixed overlay div that wraps the dialog)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireEvent.click(screen.getByRole("dialog").parentElement!);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes the modal when Escape is pressed", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens the modal for a removed credit", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Saks — REMOVED" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Saks — REMOVED" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("The $100/yr Saks credit was removed.")).toBeInTheDocument();
    });

    it("shows warn:: tips with red ! bullet", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          credits: [
            {
              id: "warn-credit",
              name: "Warn Credit",
              subtitle: "test",
              max_annual: 100,
              default_value: 0,
              tier: "easy",
              removed: false,
              description: "A test credit.",
              tips: ["warn::This is a warning tip."],
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Warn Credit" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Warn Credit" }));

      expect(screen.getByText("This is a warning tip.")).toBeInTheDocument();
      // The warn tip li should have the "warn" class (CSS renders the red "!" via ::before)
      const tipEl = screen.getByText("This is a warning tip.").closest("li");
      expect(tipEl).toHaveClass("warn");
    });

    it("locks body scroll when modal is open and restores it on close", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Uber Cash" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Uber Cash" }));
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.click(screen.getByRole("button", { name: /Close/i }));
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("routing edge cases", () => {
    it("does not call fetchCard when there is no card ID in the URL", () => {
      // Rendering CardDetailPage on a route without :id gives id=undefined → skipToken
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/cards"]}>
            <Routes>
              <Route path="/cards" element={<CardDetailPage />} />
              <Route path="/" element={<div>Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(vi.mocked(fetchCard)).not.toHaveBeenCalled();
    });
  });
});

