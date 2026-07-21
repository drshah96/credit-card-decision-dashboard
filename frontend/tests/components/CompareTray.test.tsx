import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompareTray } from "@/components/CompareTray";
import type { CardSummary } from "@/types/cards";

vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
}));

import { fetchCards } from "@/api/cards";

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

const ALL_SUMMARIES: CardSummary[] = [
  makeSummary({ id: "amex-platinum", name: "The Platinum Card", issuer: "American Express" }),
  makeSummary({
    id: "chase-sapphire-reserve",
    name: "Sapphire Reserve",
    issuer: "Chase",
    annual_fee: 795,
  }),
];

function renderTray(initialPath = "/issuer/amex") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<CompareTray />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(fetchCards).mockResolvedValue(ALL_SUMMARIES);
});

describe("CompareTray", () => {
  it("renders nothing when no cards are picked", () => {
    const { container } = renderTray();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a thumbnail and name for each picked card once mounted", async () => {
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum", "chase-sapphire-reserve"]));
    renderTray();

    await waitFor(() => {
      expect(screen.getByText("The Platinum Card")).toBeInTheDocument();
    });
    expect(screen.getByText("Sapphire Reserve")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compare (2)" })).toHaveAttribute(
      "href",
      "/compare?cards=amex-platinum,chase-sapphire-reserve",
    );
  });

  it("removing a card from the tray updates localStorage and the remaining count", async () => {
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum", "chase-sapphire-reserve"]));
    renderTray();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove the platinum card/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /remove the platinum card/i }));

    expect(screen.queryByText("The Platinum Card")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compare (1)" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("compare-cards")!)).toEqual(["chase-sapphire-reserve"]);
  });

  it("hides itself on the /compare page even if cards are picked", () => {
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum"]));
    const { container } = renderTray("/compare?cards=amex-platinum");
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to the card id as a label if the summary hasn't loaded yet", async () => {
    vi.mocked(fetchCards).mockReturnValue(new Promise(() => {}));
    localStorage.setItem("compare-cards", JSON.stringify(["amex-platinum"]));
    renderTray();

    await waitFor(() => {
      expect(screen.getByText("amex-platinum")).toBeInTheDocument();
    });
  });
});
