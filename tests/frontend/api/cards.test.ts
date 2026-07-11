import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCards, fetchCard } from "@/api/cards";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  } as Response);
}

function mockError(status: number, statusText: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  } as Response);
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── fetchCards ───────────────────────────────────────────────────────────────

describe("fetchCards", () => {
  it("returns parsed card array on success", async () => {
    const cards = [{ id: "amex", name: "The Platinum Card" }];
    mockFetch.mockReturnValueOnce(mockOk(cards));

    const result = await fetchCards();

    expect(result).toEqual(cards);
    expect(mockFetch).toHaveBeenCalledWith("/api/cards");
  });

  it("throws a descriptive error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchCards()).rejects.toThrow(
      "Could not reach the backend. Check that the server is running.",
    );
  });

  it("throws with status info on HTTP error", async () => {
    mockFetch.mockReturnValueOnce(mockError(500, "Internal Server Error"));

    await expect(fetchCards()).rejects.toThrow("Server error 500");
  });

  it("throws when response is not an array", async () => {
    mockFetch.mockReturnValueOnce(mockOk({ id: "amex" }));

    await expect(fetchCards()).rejects.toThrow(
      "Unexpected response format: expected an array of cards.",
    );
  });

  it("throws when response is null", async () => {
    mockFetch.mockReturnValueOnce(mockOk(null));

    await expect(fetchCards()).rejects.toThrow(
      "Unexpected response format: expected an array of cards.",
    );
  });
});

// ─── fetchCard ────────────────────────────────────────────────────────────────

describe("fetchCard", () => {
  it("returns parsed card object on success", async () => {
    const card = { id: "amex", name: "The Platinum Card" };
    mockFetch.mockReturnValueOnce(mockOk(card));

    const result = await fetchCard("amex");

    expect(result).toEqual(card);
    expect(mockFetch).toHaveBeenCalledWith("/api/cards/amex");
  });

  it("throws a descriptive error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchCard("amex")).rejects.toThrow(
      "Could not reach the backend. Check that the server is running.",
    );
  });

  it("throws with status info on HTTP 404", async () => {
    mockFetch.mockReturnValueOnce(mockError(404, "Not Found"));

    await expect(fetchCard("nonexistent")).rejects.toThrow("Server error 404");
  });

  it("throws with status info on HTTP 500", async () => {
    mockFetch.mockReturnValueOnce(mockError(500, "Internal Server Error"));

    await expect(fetchCard("amex")).rejects.toThrow("Server error 500");
  });

  it("throws when response is an array instead of an object", async () => {
    mockFetch.mockReturnValueOnce(mockOk([{ id: "amex" }]));

    await expect(fetchCard("amex")).rejects.toThrow(
      "Unexpected response format: expected a card object.",
    );
  });

  it("throws when response is null", async () => {
    mockFetch.mockReturnValueOnce(mockOk(null));

    await expect(fetchCard("amex")).rejects.toThrow(
      "Unexpected response format: expected a card object.",
    );
  });

  it("throws when response is a primitive", async () => {
    mockFetch.mockReturnValueOnce(mockOk("just a string"));

    await expect(fetchCard("amex")).rejects.toThrow(
      "Unexpected response format: expected a card object.",
    );
  });
});