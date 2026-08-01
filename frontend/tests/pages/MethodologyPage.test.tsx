import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MethodologyPage from "@/pages/MethodologyPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/methodology"]}>
      <Routes>
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/" element={<div>Card Issuers page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MethodologyPage", () => {
  it("renders the header", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /methodology & transparency/i }),
    ).toBeInTheDocument();
  });

  it("states the core stance: ranked by math, never by business relationship", () => {
    renderPage();
    expect(screen.getByText(/we rank by math, not by who pays us/i)).toBeInTheDocument();
    expect(
      screen.getByText(/will never change because of a business relationship/i),
    ).toBeInTheDocument();
  });

  it("does not link out to the source repository", () => {
    // Regression guard: the whole point of "prose-only" is that this claim
    // doesn't depend on a URL staying public forever. No github.com link
    // anywhere on the page.
    renderPage();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(/github\.com/i);
    }
  });

  it("explains the Top Pick effective-value formula", () => {
    renderPage();
    expect(
      screen.getByText(/effective value = multiplier × the card's best realistic redemption/i),
    ).toBeInTheDocument();
  });

  it("explains points pooling is scoped to My Cards, never the default ranking", () => {
    renderPage();
    expect(
      screen.getByText(/never applies to the default, whole-catalog ranking/i),
    ).toBeInTheDocument();
  });

  it("explains the credit calculator starts from a realistic default, not the maximum", () => {
    renderPage();
    expect(
      screen.getByText(/starts with a realistic, hand-estimated default, not the maximum/i),
    ).toBeInTheDocument();
  });

  it("explains Best-case net is the optimistic ceiling, distinct from the calculator", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /what "best-case net" means/i }),
    ).toBeInTheDocument();
  });

  it("is honest about what the ranking doesn't account for", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /what this site doesn't account for/i }),
    ).toBeInTheDocument();
  });

  it("links back to the Card Issuers page from both the top and bottom of the page", () => {
    renderPage();
    const backLinks = screen.getAllByRole("link", { name: /back to card issuers/i });
    expect(backLinks).toHaveLength(2);
    for (const link of backLinks) {
      expect(link).toHaveAttribute("href", "/");
    }
  });
});
