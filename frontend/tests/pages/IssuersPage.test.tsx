import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IssuersPage from "@/pages/IssuersPage";
import type { CardSummary } from "@/types/cards";

vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn(),
}));

import { fetchCards } from "@/api/cards";

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
    ...overrides,
  };
}

const FOUR_ISSUER_CARDS: CardSummary[] = [
  makeSummary({ id: "amex-platinum", issuer: "American Express" }),
  makeSummary({ id: "amex-gold", issuer: "American Express", verdict: { status: "situational", text: "" } }),
  makeSummary({ id: "chase-sapphire-reserve", issuer: "Chase" }),
  makeSummary({ id: "capital-one-venture-x", issuer: "Capital One" }),
  makeSummary({ id: "citi-strata-elite", issuer: "Citi" }),
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<IssuersPage />} />
          <Route path="/issuer/:issuerSlug" element={<div>Issuer page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IssuersPage", () => {
  it("shows a loading state while the query is pending", () => {
    vi.mocked(fetchCards).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/premium cards aren't about credits/i)).toBeInTheDocument();
  });

  it("shows an error message on failure", async () => {
    vi.mocked(fetchCards).mockRejectedValue(new Error("Server error 500: boom"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load cards")).toBeInTheDocument();
    });
  });

  it("renders one tile per issuer with the right card count", async () => {
    vi.mocked(fetchCards).mockResolvedValue(FOUR_ISSUER_CARDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("American Express")).toBeInTheDocument();
    });
    expect(screen.getByText("2 cards")).toBeInTheDocument(); // Amex
    expect(screen.getAllByText("1 card")).toHaveLength(3); // Chase, Capital One, Citi
  });

  it("links each tile to its issuer page", async () => {
    vi.mocked(fetchCards).mockResolvedValue(FOUR_ISSUER_CARDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /view chase cards/i })).toHaveAttribute(
        "href",
        "/issuer/chase",
      );
    });
    expect(screen.getByRole("link", { name: /view capital one cards/i })).toHaveAttribute(
      "href",
      "/issuer/capital-one",
    );
  });

  it("shows the keep-count subtitle when at least one card is rated keep", async () => {
    vi.mocked(fetchCards).mockResolvedValue(FOUR_ISSUER_CARDS);
    renderPage();

    await waitFor(() => {
      // Amex (1 of its 2 cards), plus Chase/Capital One/Citi's single fixture
      // card each — all four issuers land on exactly one "keep" here.
      expect(screen.getAllByText('1 rated "keep"')).toHaveLength(4);
    });
  });
});
