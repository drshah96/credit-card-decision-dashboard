import { describe, it, expect, vi, afterEach } from "vitest";
import { postEvent } from "@/api/events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postEvent", () => {
  it("always uses fetch, never navigator.sendBeacon, even when sendBeacon is available", () => {
    // Regression test: sendBeacon() reports success (returns true) but was
    // confirmed live against production to silently fail to deliver the
    // request — see the comment in src/api/events.ts. Guards against
    // reintroducing it as the primary/preferred path.
    const sendBeacon = vi.fn().mockReturnValue(true);
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("fetch", mockFetch);

    postEvent({ session_id: "s1", event_type: "issuer_view", issuer: "Chase" });

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends a fire-and-forget POST with keepalive", () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    postEvent({ session_id: "s2", event_type: "card_view", card_id: "citi-strata-premier" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({
      session_id: "s2",
      event_type: "card_view",
      card_id: "citi-strata-premier",
    });
  });

  it("never throws, even if the fetch call rejects", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() => postEvent({ session_id: "s3", event_type: "issuer_view" })).not.toThrow();
  });
});
