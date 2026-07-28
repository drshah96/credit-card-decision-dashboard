import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import IssuersPage from "@/pages/IssuersPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<IssuersPage />} />
        <Route path="/issuer/:issuerSlug" element={<div>Issuer page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("IssuersPage", () => {
  it("renders the header copy", () => {
    renderPage();
    expect(screen.getByText(/build a smarter card portfolio/i)).toBeInTheDocument();
  });

  it("renders one tile per issuer", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /view american express cards/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view chase cards/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view capital one cards/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view citi cards/i })).toBeInTheDocument();
  });

  it("links each tile to its issuer page", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /view chase cards/i })).toHaveAttribute(
      "href",
      "/issuer/chase",
    );
    expect(screen.getByRole("link", { name: /view capital one cards/i })).toHaveAttribute(
      "href",
      "/issuer/capital-one",
    );
  });

  describe("headline rotation analytics", () => {
    afterEach(() => {
      delete window.gtag;
      vi.useRealTimers();
    });

    it("fires headline_view with the first variant on mount", () => {
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);

      renderPage();

      expect(calls).toContainEqual([
        "event",
        "headline_view",
        { headline_variant: "Build a smarter card portfolio." },
      ]);
    });

    it("fires headline_view again with the next variant once the headline rotates", () => {
      vi.useFakeTimers();
      const calls: unknown[][] = [];
      window.gtag = (...args: unknown[]) => calls.push(args);

      renderPage();
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(calls).toContainEqual([
        "event",
        "headline_view",
        { headline_variant: "Don't just carry premium cards." },
      ]);
    });
  });
});