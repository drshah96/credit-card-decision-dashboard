import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { CARDS_LAST_AUDITED, LAST_AUDITED } from "@/utils/routeMeta";

describe("Footer", () => {
  it("links to the methodology page", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /how we rank cards/i })).toHaveAttribute(
      "href",
      "/methodology",
    );
  });

  // The footer is the only place on the site that tells a visitor how to reach
  // us at all, and corrections from cardholders are the cheapest source of the
  // per-card accuracy this catalog is built on.
  it("offers a contact address for corrections", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /hello@thewalletaudit\.com/i })).toHaveAttribute(
      "href",
      "mailto:hello@thewalletaudit.com",
    );
  });

  // A pass that skipped cards must say so, because the MCP server reports those cards as unverified.
  it("says how many cards the last re-check covered, and never calls it full", () => {
    const { container } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(`finished ${LAST_AUDITED} and covered ${CARDS_LAST_AUDITED} of them`);
    expect(text).not.toMatch(/full\s+issuer-by-issuer/i);
  });
});
