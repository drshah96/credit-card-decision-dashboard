import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/premium cards aren't about credits/i)).toBeInTheDocument();
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
});