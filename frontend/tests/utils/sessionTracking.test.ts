import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordPageView } from "@/utils/sessionTracking";
import { postEvent } from "@/api/events";

vi.mock("@/api/events", () => ({
  postEvent: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordPageView", () => {
  it("generates a session id on first use and persists it in localStorage", () => {
    recordPageView("issuer_view", "Chase");

    expect(postEvent).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(postEvent).mock.calls[0][0];
    expect(payload.event_type).toBe("issuer_view");
    expect(payload.issuer).toBe("Chase");
    expect(payload.session_id).toBeTruthy();
    expect(localStorage.getItem("wa_session_id")).toBe(payload.session_id);
  });

  it("reuses the same session id across multiple calls", () => {
    recordPageView("issuer_view", "Chase");
    recordPageView("card_view", "Chase", "chase-sapphire-preferred");

    const [firstPayload] = vi.mocked(postEvent).mock.calls[0];
    const [secondPayload] = vi.mocked(postEvent).mock.calls[1];
    expect(secondPayload.session_id).toBe(firstPayload.session_id);
    expect(secondPayload.card_id).toBe("chase-sapphire-preferred");
  });

  it("forwards document.referrer as-is", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue(
      "https://www.google.com/search?q=amex+gold",
    );

    recordPageView("issuer_view", "Amex");

    const payload = vi.mocked(postEvent).mock.calls[0][0];
    expect(payload.referrer).toBe("https://www.google.com/search?q=amex+gold");
  });

  it("omits referrer entirely on a direct visit (empty document.referrer)", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue("");

    recordPageView("issuer_view", "Amex");

    const payload = vi.mocked(postEvent).mock.calls[0][0];
    expect(payload.referrer).toBeUndefined();
  });

  it("still tracks (with a fresh id) if localStorage throws", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => recordPageView("issuer_view", "Amex")).not.toThrow();
    expect(postEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postEvent).mock.calls[0][0].session_id).toBeTruthy();

    getItemSpy.mockRestore();
  });
});
