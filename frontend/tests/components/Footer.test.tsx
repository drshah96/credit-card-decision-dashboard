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
});
