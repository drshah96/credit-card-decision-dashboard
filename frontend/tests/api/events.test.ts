import { describe, it, expect, vi, afterEach } from "vitest";
import { postEvent } from "@/api/events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postEvent", () => {
  it("uses navigator.sendBeacon when available, with a JSON blob", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });

    postEvent({ session_id: "s1", event_type: "issuer_view", issuer: "Chase" });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    expect(url).toContain("/events");
    expect(blob.type).toBe("application/json");
  });

  it("falls back to a fire-and-forget fetch when sendBeacon is unavailable", () => {
    vi.stubGlobal("navigator", {});
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

  it("never throws, even if the fetch fallback rejects", () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() => postEvent({ session_id: "s3", event_type: "issuer_view" })).not.toThrow();
  });
});
