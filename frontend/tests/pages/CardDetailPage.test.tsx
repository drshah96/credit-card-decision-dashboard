import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CardDetailPage from "@/pages/CardDetailPage";
import type { Card, CardSummary, Credit } from "@/types/cards";

// ─── Mock API module ──────────────────────────────────────────────────────────

vi.mock("@/api/cards", () => ({
  fetchCard: vi.fn(),
  fetchCards: vi.fn(),
}));
// Real tracking behavior (session id generation, sendBeacon/fetch) is
// covered in tests/utils/sessionTracking.test.ts — here it's just mocked out
// so these page tests aren't incidentally exercising a live fetch fallback.
// (GA4's trackEvent in utils/analytics doesn't need this: it safely no-ops
// via window.gtag?.(...) when gtag was never loaded, unlike postEvent's
// fetch fallback.)
vi.mock("@/utils/sessionTracking", () => ({
  recordPageView: vi.fn(),
}));

// Import after mock so we get the mocked version
import { fetchCard, fetchCards } from "@/api/cards";
import { recordPageView } from "@/utils/sessionTracking";

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
    secured_variant_id: null,
    is_secured_variant_of: null,
    points_pool_id: null,
    points_pool_receiver: false,
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

function renderTree(cardId = "amex", state?: { from?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/cards/${cardId}`, state }]}>
        <Routes>
          <Route path="/cards/:id" element={<CardDetailPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/issuer/:issuerSlug" element={<div>Issuer page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage(cardId = "amex", state?: { from?: string }) {
  return render(renderTree(cardId, state));
}

// Earning/Value, Status & Perks, Insurance & Protections, and Fees now live
// behind tabs (see the "Details" section in CardDetailPage.tsx) instead of
// being always-visible sections — tests asserting on non-default-tab content
// need to switch tabs first. findByRole already waits for the tab to exist,
// so this doubles as the "page finished loading" wait these tests used to do
// via a heading/text lookup.
// Each tab renders a full label and a short one, with CSS showing only the
// right one per breakpoint. jsdom doesn't apply the stylesheet, so both are
// present and the accessible name is their concatenation ("Value &
// RedemptionValue"). Match on the full label as a substring rather than
// exactly, so these tests don't depend on CSS being loaded.
async function findTab(name: string) {
  return screen.findByRole("tab", {
    name: (accessibleName: string) => accessibleName.includes(name),
  });
}

async function switchToTab(name: string) {
  fireEvent.click(await findTab(name));
}

// The "Your take, so far" hero widget's verdict text now lives behind its
// info button in a modal (matching CreditModal's popup pattern) instead of
// always rendered inline.
async function openHeroTakeInfo() {
  const btn = await screen.findByRole("button", { name: "What this means" });
  fireEvent.click(btn);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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
        expect(screen.getByRole("link", { name: /back to all issuers/i })).toBeInTheDocument();
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

    it("uses the card name as the page's h1", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      // Level matters: this is the page's top-level heading, matching every
      // other route. It was an h2 until the accessibility pass.
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { level: 1, name: "The Platinum Card" }),
        ).toBeInTheDocument();
      });
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("links the card name to official_url when present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ official_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/" }),
      );

      renderPage();

      const link = await screen.findByRole("link", { name: "The Platinum Card" });
      expect(link).toHaveAttribute(
        "href",
        "https://www.americanexpress.com/us/credit-cards/card/platinum/",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders the card name as plain text (no link) when official_url is absent", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ official_url: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByRole("link", { name: "The Platinum Card" })).not.toBeInTheDocument();
    });

    it("links the card image to official_url when present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          id: "amex-platinum",
          official_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
        }),
      );

      renderPage("amex-platinum");

      const img = await screen.findByAltText("The Platinum Card card art");
      const link = img.closest("a");
      expect(link).toHaveAttribute(
        "href",
        "https://www.americanexpress.com/us/credit-cards/card/platinum/",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders the card image without a link when official_url is absent", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ id: "amex-platinum", official_url: null }));

      renderPage("amex-platinum");

      const img = await screen.findByAltText("The Platinum Card card art");
      expect(img.closest("a")).toBeNull();
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
        expect(screen.getByText("$895")).toBeInTheDocument();
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

    it("does not render a credit marked removed in the Credits section — it's tracked in History instead", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Fine Hotels + Resorts")).toBeInTheDocument();
      });
      expect(screen.queryByText("Saks — REMOVED")).not.toBeInTheDocument();
      expect(screen.queryByText("Removed")).not.toBeInTheDocument();
      // The removal is still visible — just in the History timeline, not Credits.
      expect(screen.getByText("Saks credit removed.")).toBeInTheDocument();
    });

    it("renders earn rates", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("5×")).toBeInTheDocument();
      });
      expect(screen.getByText("Flights")).toBeInTheDocument();
    });

    it("sorts earn rates by multiplier descending, ties broken alphabetically by category", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          earn_rates: [
            { emoji: "💳", multiplier: "1×", category: "Everything else", highlight: false, is_base: true },
            { emoji: "🛒", multiplier: "3×", category: "Zebra Store", highlight: true, is_base: false },
            { emoji: "🌐", multiplier: "5×", category: "Chase Travel portal", highlight: true, is_base: false },
            { emoji: "⛽", multiplier: "3×", category: "Apple Store", highlight: true, is_base: false },
            { emoji: "🎯", multiplier: "Up to 4×", category: "Capped category", highlight: true, is_base: false },
          ],
        }),
      );

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText("Chase Travel portal")).toBeInTheDocument();
      });

      const categories = Array.from(container.querySelectorAll(".el")).map((el) => el.textContent);
      expect(categories).toEqual([
        "Chase Travel portal",
        "Capped category",
        "Apple Store",
        "Zebra Store",
        "Everything else",
      ]);
    });

    it("renders points section with best redemption option", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();
      await switchToTab("Value & Redemption");

      await waitFor(() => {
        // "Transfer partners" appears twice: once as the panel heading, once as the redemption method
        expect(screen.getAllByText("Transfer partners").length).toBeGreaterThanOrEqual(2);
      });
      expect(screen.getByText("2.00¢")).toBeInTheDocument();
    });

    it("renders insurance coverage items", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();
      await switchToTab("Insurance & Protections");

      expect(screen.getByText("Purchase protection")).toBeInTheDocument();
    });

    it("renders interest rates & fees with real audited data", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          variable_apr: "20.24%-28.74%",
          intro_apr_purchases: { rate: "0%", months: 15 },
          balance_transfer_apr: "19.49%-27.99%",
          intro_apr_balance_transfers: { rate: "0%", months: 15 },
          balance_transfer_fee: "Either $5 or 5% of the amount of each transfer, whichever is greater",
          foreign_transaction_fee: true,
          foreign_transaction_fee_rate: "3%",
        }),
      );

      renderPage();
      await switchToTab("Fees");

      // Intro offer and ongoing rate fold into one row, not two separate ones.
      expect(
        screen.getByText("0% intro APR for 15 months, after that 20.24%-28.74%"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("0% intro APR for 15 months, after that 19.49%-27.99%"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Either $5 or 5% of the amount of each transfer, whichever is greater"),
      ).toBeInTheDocument();
      expect(screen.getByText("3%")).toBeInTheDocument();
    });

    it("falls back to an em dash for interest/fee fields that aren't yet audited", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard()); // all null by default

      renderPage();
      await switchToTab("Fees");

      // Purchase APR, balance transfer APR, balance_transfer_fee, foreign
      // transaction fee, cash advance APR, penalty APR, late payment fee,
      // returned payment fee, and returned check fee all fall back — Pay
      // Over Time fee's row is omitted entirely when null (issuer-specific,
      // not "unaudited"), so it isn't counted here.
      expect(screen.getAllByText("—")).toHaveLength(9);
    });

    it("renders round-3 rates/fees with real audited data", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          cash_advance_apr: "29.99%",
          penalty_apr: "29.99%",
          penalty_apr_trigger: "after a payment more than 60 days late",
          pay_over_time_fee: "1.33% of the Pay Over Time balance",
          late_payment_fee: "Up to $41",
          returned_payment_fee: "Up to $41",
          returned_check_fee: "Up to $41",
        }),
      );

      renderPage();
      await switchToTab("Fees");

      expect(screen.getByText("29.99%, after a payment more than 60 days late")).toBeInTheDocument();
      expect(screen.getByText("1.33% of the Pay Over Time balance")).toBeInTheDocument();
      expect(screen.getAllByText("Up to $41")).toHaveLength(3);
    });

    it("omits the Pay Over Time fee row entirely when null, unlike the other round-3 fields", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();
      await switchToTab("Fees");

      expect(screen.queryByText("Pay Over Time fee")).not.toBeInTheDocument();
    });

    it('shows "None" for a card confirmed to have no foreign transaction fee', async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ foreign_transaction_fee: false }));

      renderPage();
      await switchToTab("Fees");

      expect(screen.getByText("None")).toBeInTheDocument();
    });

    // Welcome bonus rendering is disabled: sign-up offers rotate on the
    // issuer's own promotional calendar, much faster than APR/fee data
    // drifts, so a stale bonus reads as an active (wrong) promotional claim
    // rather than a dated fact — a worse failure mode for a decision-support
    // site that isn't trying to promote applying. The data still flows
    // through the schema/API; only the render (in CardDetailPage.tsx) is
    // off. This test documents the prior behavior in case it's re-enabled.
    // it("renders the welcome bonus block with real audited data", async () => {
    //   vi.mocked(fetchCard).mockResolvedValue(
    //     makeCard({
    //       welcome_bonus: {
    //         bonus: "80,000 Membership Rewards points",
    //         requirement: "after spending $8,000 in the first 6 months",
    //         estimated_value: "$1,600",
    //       },
    //     }),
    //   );
    //
    //   renderPage();
    //
    //   await waitFor(() => {
    //     expect(screen.getByText("Welcome bonus")).toBeInTheDocument();
    //   });
    //   expect(screen.getByText("80,000 Membership Rewards points")).toBeInTheDocument();
    //   expect(
    //     screen.getByText("after spending $8,000 in the first 6 months"),
    //   ).toBeInTheDocument();
    //   expect(screen.getByText("Worth an estimated $1,600")).toBeInTheDocument();
    // });

    it("never renders the welcome bonus block, even when the card has audited bonus data", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          welcome_bonus: {
            bonus: "80,000 Membership Rewards points",
            requirement: "after spending $8,000 in the first 6 months",
            estimated_value: "$1,600",
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText("Welcome bonus")).not.toBeInTheDocument();
    });

    it("omits the welcome bonus block entirely when not yet audited", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard()); // welcome_bonus: null

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText("Welcome bonus")).not.toBeInTheDocument();
    });

    it("renders timeline events", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Saks credit removed.")).toBeInTheDocument();
      });
      expect(screen.getByText("Major refresh.")).toBeInTheDocument();
    });

    it("renders a back navigation link to the card's issuer page", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        const link = screen.getByRole("link", { name: /american express cards/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "/issuer/amex");
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
      await switchToTab("Status & Perks");

      expect(screen.getByText("Platinum Concierge")).toBeInTheDocument();
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
      await switchToTab("Status & Perks");

      // Strength 3/5 means dots 4 and 5 are unfilled — exercises the bg-white/10 branch
      expect(screen.getByLabelText(/Strength: 3 out of 5/)).toBeInTheDocument();
    });

    it("wires each tab to the panel it opens", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      const earnTab = await findTab("Earn");
      expect(earnTab).toHaveAttribute("aria-selected", "true");
      expect(earnTab).toHaveAttribute("aria-controls", "panel-earn");

      const panel = screen.getByRole("tabpanel");
      expect(panel).toHaveAttribute("id", "panel-earn");
      expect(panel).toHaveAttribute("aria-labelledby", "tab-earn");

      // Unselected tabs must not point at a panel that isn't mounted
      const feesTab = await findTab("Fees");
      expect(feesTab).toHaveAttribute("aria-selected", "false");
      expect(feesTab).not.toHaveAttribute("aria-controls");

      await switchToTab("Fees");
      expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-fees");
      expect(await findTab("Fees")).toHaveAttribute(
        "aria-controls",
        "panel-fees",
      );
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
      await switchToTab("Status & Perks");

      expect(screen.getByText("Companion Platinum")).toBeInTheDocument();
      expect(screen.getByText("Earns Membership Rewards")).toBeInTheDocument();
      expect(screen.getByText("No lounge access")).toBeInTheDocument();
      // The note is behind the "i" now, not rendered inline
      expect(screen.queryByText("Up to 3 additional cards.")).not.toBeInTheDocument();
    });

    it("opens the additional cards note in a modal from the info button", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          additional_cards: {
            title: "Authorized users",
            options: [
              { name: "Authorized User", fee: "$195 ea", is_free: false, benefits: [] },
            ],
            note: "After the 2025 refresh, authorized users cost $195 each.",
          },
        }),
      );

      renderPage();
      await switchToTab("Status & Perks");

      fireEvent.click(screen.getByRole("button", { name: "About additional cards" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      // Modal title comes from additional_cards.title, not a hardcoded string
      expect(screen.getByText("Authorized users")).toBeInTheDocument();
      expect(
        screen.getByText("After the 2025 refresh, authorized users cost $195 each."),
      ).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("omits the additional cards info button when there is no note", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          additional_cards: {
            title: "Authorized users",
            options: [
              { name: "Authorized User", fee: "$0", is_free: true, benefits: [] },
            ],
            note: "",
          },
        }),
      );

      renderPage();
      await switchToTab("Status & Perks");

      expect(screen.getByText("Authorized User")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "About additional cards" }),
      ).not.toBeInTheDocument();
    });

    it("shows 'None here' for an empty tier group", async () => {
      // Fixture: uber=easy, fhr=plan, saks is removed → niche group is empty
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("None here")).toBeInTheDocument();
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
      await switchToTab("Value & Redemption");

      await waitFor(() => {
        // Rendered as <b>0</b>transfer out — queryable as combined text content
        expect(screen.getByText(/transfer out/)).toBeInTheDocument();
      });
      // airline/hotel counts should NOT appear
      expect(screen.queryByText(/airlines/)).not.toBeInTheDocument();
    });

    it("does not make the transfer partners panel clickable when no partner detail exists", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();
      await switchToTab("Value & Redemption");

      await waitFor(() => {
        expect(screen.getByText("Deepest airline list of any bank currency.")).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /view full transfer partner list/i })).not.toBeInTheDocument();
      expect(screen.queryByText("View list →")).not.toBeInTheDocument();
    });

    it("opens a modal listing airline and hotel partners when the transfer partners panel is clicked", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          transfer_partners: {
            airline_count: 2,
            hotel_count: 1,
            highlight: "Deepest airline list of any bank currency.",
            recent_changes: "",
            partners: [
              { name: "Flying Blue", type: "airline", ratio: "1:1" },
              { name: "Virgin Atlantic", type: "airline", ratio: "1:1" },
              { name: "Marriott Bonvoy", type: "hotel", ratio: "1:1", notes: "Best redemption value." },
            ],
          },
        }),
      );

      renderPage();
      await switchToTab("Value & Redemption");

      const panel = await screen.findByRole("button", { name: /view full transfer partner list/i });
      expect(screen.getByText("View list →")).toBeInTheDocument();

      fireEvent.click(panel);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Flying Blue")).toBeInTheDocument();
      expect(screen.getByText("Virgin Atlantic")).toBeInTheDocument();
      expect(screen.getByText("Marriott Bonvoy")).toBeInTheDocument();
      expect(screen.getByText("Best redemption value.")).toBeInTheDocument();
      expect(screen.getAllByText("1:1")).toHaveLength(3);
    });

    it("closes the transfer partners modal on Escape", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({
          transfer_partners: {
            airline_count: 1,
            hotel_count: 0,
            highlight: "Deepest airline list of any bank currency.",
            recent_changes: "",
            partners: [{ name: "Flying Blue", type: "airline", ratio: "1:1" }],
          },
        }),
      );

      renderPage();
      await switchToTab("Value & Redemption");

      const panel = await screen.findByRole("button", { name: /view full transfer partner list/i });
      fireEvent.click(panel);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("renders protection_note when present", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();
      await switchToTab("Insurance & Protections");

      expect(screen.getByText("Purchase protection is best-in-class.")).toBeInTheDocument();
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
      await switchToTab("Insurance & Protections");

      expect(screen.getByText("Use CSR or Venture X for rentals.")).toBeInTheDocument();
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
      await switchToTab("Status & Perks");

      expect(screen.getByLabelText(/Strength: 5 out of 5/)).toBeInTheDocument();
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
      await switchToTab("Insurance & Protections");

      expect(screen.getByText("Strong Coverage")).toBeInTheDocument();

      // Insurance grid splits into two halves; DOM order matches original array order
      const dots = document.querySelectorAll(".ins-dot");
      expect(dots[0]).toHaveClass("d-strong");
      expect(dots[1]).toHaveClass("d-good");
      expect(dots[2]).toHaveClass("d-mid");
      expect(dots[3]).toHaveClass("d-none");
    });
  });

  describe("credits: 'your take, so far' hero widget & sliders", () => {
    it("renders the hero widget with the annual fee", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Your take, so far")).toBeInTheDocument();
      });
      expect(screen.getByText(/of \$895 fee, from the credits below/)).toBeInTheDocument();
    });

    it("shows $0 in the hero widget when all default_values are 0", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Your take, so far")).toBeInTheDocument();
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
        // Credits used = $300 + $100 = $400 — shown in the hero widget's total
        expect(screen.getAllByText("$400").length).toBeGreaterThanOrEqual(1);
      });
      // fee $395 - $400 credits = +$5, shown both in the header's best-case net
      // stat and the hero widget (default_value == max_annual here, so they match)
      expect(screen.getAllByText("+$5").length).toBeGreaterThanOrEqual(1);
    });

    it("updates the hero widget's total when a slider is changed", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/How much of Uber Cash/i)).toBeInTheDocument();
      });

      // Move Uber Cash slider to $150
      fireEvent.change(screen.getByLabelText(/How much of Uber Cash/i), {
        target: { value: "150" },
      });

      expect(screen.getAllByText("$150").length).toBeGreaterThanOrEqual(1);
    });

    it("fills the slider track in proportion to the value", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());

      renderPage();

      // Uber Cash maxes at $200 in the fixture
      const slider = await screen.findByLabelText(/How much of Uber Cash/i);
      expect(slider).toHaveStyle({ "--slider-fill": "0%" });

      fireEvent.change(slider, { target: { value: "50" } });
      expect(slider).toHaveStyle({ "--slider-fill": "25%" });

      fireEvent.change(slider, { target: { value: "200" } });
      expect(slider).toHaveStyle({ "--slider-fill": "100%" });
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
      expect(screen.getAllByText("$200").length).toBeGreaterThanOrEqual(1);

      fireEvent.click(screen.getByRole("button", { name: /reset sliders/i }));

      // Back to $0 (all default_values are 0 in the fixture)
      const creditsUsed = screen.getAllByText("$0");
      expect(creditsUsed.length).toBeGreaterThanOrEqual(1);
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
      await openHeroTakeInfo();

      expect(screen.getByText(/Credits recoup/i)).toBeInTheDocument();
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
      await openHeroTakeInfo();

      expect(screen.getByText(/Credits only recoup/i)).toBeInTheDocument();
      // "$150 of $895" appears both in the modal verdict and the hero widget's
      // sub-line below the status bar
      expect(screen.getAllByText(/\$150 of \$895/i).length).toBeGreaterThanOrEqual(1);
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
      await openHeroTakeInfo();

      expect(screen.getByText(/more than cover the fee/i)).toBeInTheDocument();
      expect(screen.getByText(/ahead \$50/i)).toBeInTheDocument();
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

  describe("back link", () => {
    it("returns to the exact filtered issuer URL it was linked from", async () => {
      // An issuer page's card tile passes its current URL (filter included)
      // as router state — the back link should use that verbatim, not the
      // plain /issuer/{slug} it'd otherwise construct, so an active filter
      // like "Dining" survives going back.
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ issuer: "Chase", network: "VISA INFINITE" }),
      );
      renderPage("amex", { from: "/issuer/chase?filter=Dining" });

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /chase cards/i })).toHaveAttribute(
          "href",
          "/issuer/chase?filter=Dining",
        );
      });
    });

    it("labels the back link using the state URL's issuer even before the card finishes loading", () => {
      // Regression: backTo used to prefer state.from unconditionally, but
      // backLabel only read the issuer resolved from `card` data — so while
      // the card was still loading (or if the fetch failed), the link
      // pointed at the right filtered issuer URL but showed "All issuers"
      // instead of "Chase cards".
      vi.mocked(fetchCard).mockReturnValue(new Promise(() => {}));
      renderPage("amex", { from: "/issuer/chase?filter=Dining" });

      expect(screen.getByRole("link", { name: /chase cards/i })).toHaveAttribute(
        "href",
        "/issuer/chase?filter=Dining",
      );
    });

    it("falls back to the plain issuer URL when arriving with no router state", async () => {
      // E.g. a shared link straight to a card — there's no "from" to honor,
      // so it should construct the issuer's default URL rather than crash
      // or link nowhere.
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ issuer: "Chase" }));
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /chase cards/i })).toHaveAttribute(
          "href",
          "/issuer/chase",
        );
      });
    });

    it("returns to Top Pick, labeled accordingly, when linked from there", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ issuer: "Chase" }));
      renderPage("amex", { from: "/top-picks" });

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /top pick/i })).toHaveAttribute(
          "href",
          "/top-picks",
        );
      });
    });

    it("returns to Compare Cards, with its ?cards selection intact, when linked from there", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ issuer: "Chase" }));
      renderPage("amex", { from: "/compare?cards=amex,chase-sapphire-reserve" });

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /compare cards/i })).toHaveAttribute(
          "href",
          "/compare?cards=amex,chase-sapphire-reserve",
        );
      });
    });

    it("labels the back link plainly when linked from another card's detail page", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ issuer: "Chase" }));
      renderPage("amex", { from: "/cards/amex-secured" });

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "← Back" })).toHaveAttribute(
          "href",
          "/cards/amex-secured",
        );
      });
    });
  });

  describe("secured/unsecured pairing note", () => {
    it("shows a link to the secured version, with its name, when this is the unsecured primary", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ id: "amex", secured_variant_id: "amex-secured" }),
      );
      vi.mocked(fetchCards).mockResolvedValue([
        { id: "amex-secured", name: "The Platinum Secured Card" } as CardSummary,
      ]);
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByText(/also available/)).toHaveTextContent("The Platinum Secured Card");
      });
      expect(screen.getByRole("link", { name: /view the secured version/i })).toHaveAttribute(
        "href",
        "/cards/amex-secured",
      );
    });

    it("shows a link back to the unsecured primary, with its name, when this is the secured card", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ id: "amex-secured", is_secured_variant_of: "amex" }),
      );
      vi.mocked(fetchCards).mockResolvedValue([
        { id: "amex", name: "The Platinum Card" } as CardSummary,
      ]);
      renderPage("amex-secured");

      await waitFor(() => {
        expect(screen.getByText(/this is the secured version of/i)).toHaveTextContent(
          "The Platinum Card",
        );
      });
      expect(screen.getByRole("link", { name: /view the unsecured version/i })).toHaveAttribute(
        "href",
        "/cards/amex",
      );
    });

    it("renders no pairing note for a card with neither field set", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());
      renderPage("amex");

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText(/also available/)).not.toBeInTheDocument();
      expect(screen.queryByText(/this is the secured version of/i)).not.toBeInTheDocument();
      expect(fetchCards).not.toHaveBeenCalled();
    });
  });

  describe("affiliate disclosure", () => {
    it("shows nothing for a card with no affiliate relationship (every card today)", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ is_affiliate_link: false }));
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "The Platinum Card" })).toBeInTheDocument();
      });
      expect(screen.queryByText(/advertising disclosure/i)).not.toBeInTheDocument();
    });

    it("shows a plain-language commission disclosure naming the card when its link is flagged as affiliate", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ name: "The Platinum Card", is_affiliate_link: true }),
      );
      renderPage();

      const disclosureLabel = await screen.findByText(/advertising disclosure/i);
      const disclosure = disclosureLabel.parentElement!;
      expect(disclosure).toHaveTextContent(
        "we may earn a commission if you apply for The Platinum Card",
      );
      expect(disclosure).toHaveTextContent("never changes which cards we recommend");
    });

    it("renders before both existing outbound links (the card name and the card image), not after", async () => {
      vi.mocked(fetchCard).mockResolvedValue(
        makeCard({ id: "amex-platinum", is_affiliate_link: true, official_url: "https://amex.com" }),
      );
      renderPage("amex-platinum");

      const disclosureLabel = await screen.findByText(/advertising disclosure/i);
      const disclosure = disclosureLabel.parentElement!;
      // Exact name, not a substring match — the card image link's accessible
      // name is "The Platinum Card card art" (from its alt text), which
      // would also match a loose regex here and make this ambiguous.
      const outboundLink = await screen.findByRole("link", { name: "The Platinum Card" });
      // DOCUMENT_POSITION_FOLLOWING means `outboundLink` comes AFTER
      // `disclosure` in the DOM — i.e. the disclosure is first.
      const position = disclosure.compareDocumentPosition(outboundLink);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("compare widget", () => {
    it("shows an Add to Compare button when the card isn't picked yet", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "+ Add to Compare" })).toBeInTheDocument();
      });
    });

    it("adding to compare switches to the In Compare state with a View Compare link", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "+ Add to Compare" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "+ Add to Compare" }));

      expect(screen.getByRole("button", { name: "✓ In Compare" })).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /view compare \(1\)/i });
      expect(link).toHaveAttribute("href", "/compare?cards=amex");
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual(["amex"]);
    });

    it("clicking In Compare removes the card again", async () => {
      vi.mocked(fetchCard).mockResolvedValue(makeCard());
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "+ Add to Compare" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "+ Add to Compare" }));
      fireEvent.click(screen.getByRole("button", { name: "✓ In Compare" }));

      expect(screen.getByRole("button", { name: "+ Add to Compare" })).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual([]);
    });

    it("shows a full-compare message once 4 other cards are already picked", async () => {
      localStorage.setItem(
        "compare-cards",
        JSON.stringify(["chase-a", "chase-b", "chase-c", "chase-d"]),
      );
      vi.mocked(fetchCard).mockResolvedValue(makeCard());
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Compare full (4/4)")).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: "+ Add to Compare" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /view compare/i })).toHaveAttribute(
        "href",
        "/compare?cards=chase-a,chase-b,chase-c,chase-d",
      );
    });
  });

  describe("analytics", () => {
    afterEach(() => {
      delete window.gtag;
    });

    it("fires a view_card event with the card's id and issuer once it loads", async () => {
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);
      vi.mocked(fetchCard).mockResolvedValue(makeCard({ id: "amex-platinum", issuer: "American Express" }));

      renderPage("amex-platinum");

      await waitFor(() => {
        expect(calls).toContainEqual([
          "event",
          "view_card",
          { card_id: "amex-platinum", issuer: "American Express" },
        ]);
      });
    });

    it("does not fire view_card while the card is still loading or failed to load", async () => {
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);
      vi.mocked(fetchCard).mockRejectedValue(new Error("Server error 500: Internal Server Error"));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Failed to load card")).toBeInTheDocument();
      });
      expect(calls).toEqual([]);
    });
  });
});


// ─── Preference signals ───────────────────────────────────────────────────────
//
// These four events exist to feed a future recommendation system: what someone
// does with a card says more about fit than any inferred demographic. GA4 calls
// are observed through window.gtag (same pattern the view_card tests use);
// backend calls through the mocked recordPageView, since that's where the data
// has to land to be queryable.
describe("preference signal tracking", () => {
  // Without this, a failure between useFakeTimers() and the end of a test
  // leaves timers faked, and every later test hangs in findBy* polling.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a slider value once it settles, not on every step", async () => {
    vi.mocked(fetchCard).mockResolvedValue(makeCard());

    renderPage();

    // Find the slider on real timers first: findBy* polls, so installing fake
    // timers before this point hangs the query rather than the debounce.
    const slider = await screen.findByLabelText(/How much of Uber Cash/i);

    vi.useFakeTimers();
    // A drag fires a change per step; only the settled value should post
    fireEvent.change(slider, { target: { value: "50" } });
    fireEvent.change(slider, { target: { value: "100" } });
    fireEvent.change(slider, { target: { value: "150" } });

    const slid = () =>
      vi.mocked(recordPageView).mock.calls.filter((c) => c[0] === "credit_slider_set");
    expect(slid()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(900);

    expect(slid()).toHaveLength(1);
    // event_type, issuer, card id, credit id, value
    expect(slid()[0]).toEqual(["credit_slider_set", "American Express", "amex", "uber", "150"]);
  });

  it("records a tier move with the destination tier", async () => {
    vi.mocked(fetchCard).mockResolvedValue(makeCard());

    renderPage();

    // Uber Cash starts in "easy"; the down arrow moves it to "plan"
    const down = await screen.findByRole("button", { name: /Move Uber Cash to harder tier/i });
    fireEvent.click(down);

    const moves = vi.mocked(recordPageView).mock.calls.filter((c) => c[0] === "credit_tier_moved");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual(["credit_tier_moved", "American Express", "amex", "uber", "plan"]);
  });

  it("records which details tab was opened, but not re-clicks of the active one", async () => {
    vi.mocked(fetchCard).mockResolvedValue(makeCard());

    renderPage();

    await switchToTab("Fees");
    await switchToTab("Fees"); // already active — must not count again

    const tabs = vi.mocked(recordPageView).mock.calls.filter((c) => c[0] === "card_tab_viewed");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toEqual(["card_tab_viewed", "American Express", "amex", "fees"]);
  });

  it("records a click through to the issuer's own site", async () => {
    vi.mocked(fetchCard).mockResolvedValue(
      makeCard({ official_url: "https://americanexpress.com/platinum" }),
    );

    renderPage();

    const link = await screen.findByTitle(/Open The Platinum Card on American Express's site/i);
    fireEvent.click(link);

    const clicks = vi.mocked(recordPageView).mock.calls.filter(
      (c) => c[0] === "issuer_link_clicked",
    );
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toEqual(["issuer_link_clicked", "American Express", "amex"]);
  });
});

// jsdom applies no stylesheet, so the divider itself is invisible to a test.
// The class that suppresses it is not, and that is the thing that was wrong:
// the feedback block was given `noDivider`, which exists only for blocks whose
// own content supplies a full-width rule right below (the tab bar), so the two
// do not stack. The feedback form supplies nothing of the kind, and the
// heading lost its rule.
describe("section headings keep their divider unless their content replaces it", () => {
  it("does not suppress the divider under the feedback heading", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { name: "Do you hold this card?" });
    const head = heading.closest(".block-head");
    expect(head).not.toBeNull();
    expect(head!.className).not.toContain("no-divider");
  });

  it("still suppresses it under Details, whose tab bar supplies its own", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { name: "Explore the full picture" });
    expect(heading.closest(".block-head")!.className).toContain("no-divider");
  });
});
