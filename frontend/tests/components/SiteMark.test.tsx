import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// The mark ships as fixed-size files chosen by device pixel ratio, so the CSS
// display size and the generated files are a contract. If the display size
// grows past 48px every variant is undersized and the logo goes blurry on the
// densest screens — which no test can see, since jsdom applies no stylesheet
// and blur is a rendering property. What is checkable is the number that
// drives it.
describe("brand mark resolution contract", () => {
  const css = readFileSync(join(__dirname, "..", "..", "src", "index.css"), "utf-8");

  it("never renders the mark larger than the 1x asset, 48px", () => {
    const sizes = [...css.matchAll(/--sitemark-logo-h:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(48);
  });

  it("offers a variant for 1x, 2x and 3x", () => {
    render(<MemoryRouter><SiteMark /></MemoryRouter>);
    // alt="" makes it presentational, so it has no img role to query by.
    const img = document.querySelector("img.sitemark-logo") as HTMLImageElement;
    expect(img).not.toBeNull();
    const srcset = img.getAttribute("srcset") ?? "";
    for (const d of ["1x", "2x", "3x"]) expect(srcset).toContain(d);
    // Intrinsic size, so the header reserves space before the image loads.
    expect(img).toHaveAttribute("width", "48");
    expect(img).toHaveAttribute("height", "48");
  });
});
