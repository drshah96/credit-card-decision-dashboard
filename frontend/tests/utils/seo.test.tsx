import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSeo, pageTitle, SITE_URL } from "@/utils/seo";

function head(selector: string, attr = "content") {
  return document.head.querySelector(selector)?.getAttribute(attr) ?? null;
}

describe("useSeo", () => {
  beforeEach(() => {
    document.head.querySelectorAll("meta, link[rel=canonical]").forEach((el) => el.remove());
    document.title = "";
  });

  it("sets title, description and canonical for a route", () => {
    renderHook(() =>
      useSeo({ title: "Sapphire Reserve — Chase", description: "A card.", path: "/cards/csr" }),
    );

    expect(document.title).toBe("Sapphire Reserve — Chase");
    expect(head('meta[name="description"]')).toBe("A card.");
    expect(head('link[rel="canonical"]', "href")).toBe(`${SITE_URL}/cards/csr`);
  });

  it("mirrors title and description into the social tags", () => {
    renderHook(() => useSeo({ title: "T", description: "D", path: "/x" }));

    expect(head('meta[property="og:title"]')).toBe("T");
    expect(head('meta[name="twitter:title"]')).toBe("T");
    expect(head('meta[property="og:description"]')).toBe("D");
    expect(head('meta[name="twitter:description"]')).toBe("D");
    expect(head('meta[property="og:url"]')).toBe(`${SITE_URL}/x`);
  });

  it("updates tags in place rather than appending duplicates", () => {
    const { rerender } = renderHook((props: Parameters<typeof useSeo>[0]) => useSeo(props), {
      initialProps: { title: "First", description: "One", path: "/a" },
    });
    rerender({ title: "Second", description: "Two", path: "/b" });

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll("link[rel=canonical]")).toHaveLength(1);
    expect(head('meta[name="description"]')).toBe("Two");
    expect(head('link[rel="canonical"]', "href")).toBe(`${SITE_URL}/b`);
  });

  it("leaves tags untouched while a page is still loading its data", () => {
    renderHook(() => useSeo({ title: "Loaded", description: "Real", path: "/a" }));
    // A second page mounts before its query resolves — undefined must not
    // blank out what's already there
    renderHook(() => useSeo({ title: undefined, description: undefined, path: undefined }));

    expect(document.title).toBe("Loaded");
    expect(head('meta[name="description"]')).toBe("Real");
  });

  it("pageTitle suffixes the site name", () => {
    expect(pageTitle("Compare Cards")).toBe("Compare Cards | The Wallet Audit");
  });
});
