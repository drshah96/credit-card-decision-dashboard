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

  // The bug that kept this property on zero hits for its entire lifetime:
  // gtag.js only treats a dataLayer entry as a command when it is an
  // Arguments object. Pushing a rest-parameter array instead looks correct in
  // every inspection — the queued sequence reads exactly right — but gtag.js
  // silently ignores it, so no measurement id is ever configured and no
  // request is attempted. The earlier version of this suite asserted the
  // array shape, so it passed against the broken code. Pin the real contract.
  it("queues commands as Arguments objects, not arrays, or gtag.js ignores them", () => {
    vi.stubEnv("PROD", true);

    initAnalytics();

    const entries = window.dataLayer!;
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
      expect(Array.isArray(entry)).toBe(false);
    }
  });

  it("configures gtag with manual SPA page views, sent straight to Google (no proxy for now)", () => {
    vi.stubEnv("PROD", true);

    initAnalytics();

    // window.gtag pushes every call onto dataLayer rather than sending
    // anything itself — that's what the async-loaded google script reads
    // from, so this is the only way to observe the config call's arguments.
    // Read via Array.from because the entries are Arguments objects.
    const configs = window
      .dataLayer!.map((e) => Array.from(e as IArguments))
      .filter((e) => e[0] === "config");
    expect(configs).toContainEqual(["config", "G-MVE5H49V1S", { send_page_view: false }]);
  });

  it("grants consent by default, before config runs", () => {
    vi.stubEnv("PROD", true);

    initAnalytics();

    const dataLayer = window.dataLayer!.map((e) => Array.from(e as IArguments));
    const consentIndex = dataLayer.findIndex(
      (entry) => entry[0] === "consent" && entry[1] === "default",
    );
    const configIndex = dataLayer.findIndex((entry) => entry[0] === "config");

    expect(consentIndex).toBeGreaterThanOrEqual(0);
    expect(dataLayer[consentIndex]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "granted",
        analytics_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      },
    ]);
    // Google reads consent state at config time — granting it after would
    // be too late, since gtag.js locks in denied-by-omission behavior once
    // config has already run.
    expect(consentIndex).toBeLessThan(configIndex);
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
