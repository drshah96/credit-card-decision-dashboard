import { describe, it, expect, afterEach, vi } from "vitest";
import { initAnalytics, trackEvent, trackPageView } from "../../src/utils/analytics";

afterEach(() => {
  delete window.gtag;
  delete window.dataLayer;
  document.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove());
  vi.unstubAllEnvs();
});

describe("initAnalytics", () => {
  it("does not load gtag in a non-production environment", () => {
    initAnalytics();

    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.gtag).toBeUndefined();
  });

  it("configures gtag to send collect hits through the first-party proxy in production", () => {
    vi.stubEnv("PROD", true);

    initAnalytics();

    // window.gtag pushes every call onto dataLayer rather than sending
    // anything itself — that's what the async-loaded google script reads
    // from, so this is the only way to observe the config call's arguments.
    expect(window.dataLayer).toContainEqual([
      "config",
      "G-BP9B4GDZES",
      {
        send_page_view: false,
        transport_url: "https://thewalletaudit.com",
        first_party_collection: true,
      },
    ]);
  });
});

describe("trackEvent", () => {
  it("forwards the event name and params to window.gtag when present", () => {
    const calls: unknown[][] = [];
    window.gtag = (...args: unknown[]) => calls.push(args);

    trackEvent("view_card", { card_id: "chase-sapphire-preferred", issuer: "Chase" });

    expect(calls).toEqual([["event", "view_card", { card_id: "chase-sapphire-preferred", issuer: "Chase" }]]);
  });

  it("does nothing when window.gtag is not present", () => {
    delete window.gtag;

    expect(() => trackEvent("view_card", { card_id: "chase-sapphire-preferred" })).not.toThrow();
  });
});

describe("trackPageView", () => {
  it("forwards a page_view event with the given path to window.gtag", () => {
    const calls: unknown[][] = [];
    window.gtag = (...args: unknown[]) => calls.push(args);

    trackPageView("/cards/chase-sapphire-preferred");

    expect(calls).toEqual([["event", "page_view", { page_path: "/cards/chase-sapphire-preferred" }]]);
  });

  it("does nothing when window.gtag is not present", () => {
    delete window.gtag;

    expect(() => trackPageView("/compare")).not.toThrow();
  });
});
