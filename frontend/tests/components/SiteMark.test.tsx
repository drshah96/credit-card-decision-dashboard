import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SiteMark } from "@/components/SiteMark";

// jsdom applies no stylesheet, so this suite pins the things that survive
// without CSS: the lockup's structure, its accessible name, and the compact
// class the scroll handler toggles. The visual collapse itself is CSS
// (.sitemark.is-compact .sitemark-text { max-width: 0 }) and can't be
// asserted here — but the class that drives it can, which is the part a
// refactor is actually likely to break.

function renderMark() {
  return render(
    <MemoryRouter>
      <SiteMark />
    </MemoryRouter>,
  );
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
  // The handler defers its setState into a rAF; flush it.
  return act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
});

describe("SiteMark", () => {
  it("is a link home with a clean accessible name", () => {
    renderMark();
    const link = screen.getByRole("link", { name: "The Wallet Audit, home" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders the full three-line lockup as real text, not an image", () => {
    const { container } = renderMark();
    expect(container.querySelector(".sitemark-kicker")).toHaveTextContent("The");
    expect(container.querySelector(".sitemark-name")).toHaveTextContent("Wallet Audit");
    expect(container.querySelector(".sitemark-desc")).toHaveTextContent(
      "Honest points valuation",
    );
  });

  // The copy is authored in sentence case and uppercased in CSS so screen
  // readers announce "Wallet Audit" rather than spelling out capitals. If
  // someone "fixes" the markup to literal caps, that regresses silently.
  it("authors the wordmark in sentence case, leaving caps to CSS", () => {
    const { container } = renderMark();
    const text = container.querySelector(".sitemark-text")!.textContent ?? "";
    expect(text).not.toMatch(/WALLET AUDIT/);
  });

  it("hides the divider rule from assistive tech", () => {
    const { container } = renderMark();
    expect(container.querySelector(".sitemark-rule")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses no em or en dash in the accessible name", () => {
    const { container } = renderMark();
    const label = container.querySelector(".sitemark-link")!.getAttribute("aria-label") ?? "";
    expect(label).not.toMatch(/[—–]/);
  });

  it("goes compact once scrolled, and back at the top", async () => {
    const { container } = renderMark();
    const bar = container.querySelector(".sitemark")!;
    expect(bar.className).not.toMatch(/is-compact/);

    await scrollTo(400);
    expect(bar.className).toMatch(/is-compact/);

    await scrollTo(0);
    expect(bar.className).not.toMatch(/is-compact/);
  });
});
