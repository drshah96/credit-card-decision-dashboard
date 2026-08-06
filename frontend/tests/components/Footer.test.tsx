import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "@/components/Footer";

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
});
