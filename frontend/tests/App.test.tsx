import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";

// The routed pages fetch on mount; this suite only cares about the shell
// (skip link, landmark), so the data layer is stubbed out entirely.
vi.mock("@/api/cards", () => ({
  fetchCard: vi.fn().mockResolvedValue(null),
  fetchCards: vi.fn().mockResolvedValue([]),
  fetchIssuers: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/utils/sessionTracking", () => ({
  recordPageView: vi.fn(),
}));

function renderApp(route = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App accessibility shell", () => {
  it("wraps routed content in a single main landmark", () => {
    renderApp();

    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute("id", "main");
    // Exactly one — duplicate landmarks defeat the purpose
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("offers a skip link pointing at that landmark", () => {
    renderApp();

    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main");
    // It must be the first focusable thing on the page, or it can't do its job
    const focusables = document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables[0]).toBe(skip);
  });
});
