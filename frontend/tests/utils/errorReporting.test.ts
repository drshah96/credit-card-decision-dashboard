import { describe, it, expect, vi, beforeEach } from "vitest";

// The reporter keeps module-level state (dedupe set, per-load counter), so
// each test imports a fresh copy — otherwise one test's reports would eat
// the next test's budget.
async function freshReporter() {
  vi.resetModules();
  return import("@/utils/errorReporting");
}

function mockFetch() {
  const calls: unknown[][] = [];
  const fn = vi.fn((...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve(new Response("{}"));
  });
  vi.stubGlobal("fetch", fn);
  return { fn, body: (i: number) => JSON.parse((calls[i][1] as RequestInit).body as string) };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("reportError", () => {
  it("posts message, stack, pathname and session id", async () => {
    const { reportError } = await freshReporter();
    const { fn, body } = mockFetch();

    const err = new Error("boom");
    reportError(err, "\n    at CardDetailPage");

    expect(fn).toHaveBeenCalledTimes(1);
    const sent = body(0);
    expect(sent.message).toBe("Error: boom");
    expect(sent.stack).toContain("boom");
    expect(sent.component_stack).toContain("CardDetailPage");
    expect(sent.path).toBe(window.location.pathname);
    expect(typeof sent.session_id).toBe("string");
    // pathname only — never a query string (contract with ClientErrorIn).
    expect(sent.path).not.toContain("?");
  });

  it("dedupes repeats of the same error", async () => {
    const { reportError } = await freshReporter();
    const { fn } = mockFetch();

    for (let i = 0; i < 10; i++) reportError(new Error("same message"));

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after five distinct errors per page load", async () => {
    const { reportError } = await freshReporter();
    const { fn } = mockFetch();

    for (let i = 0; i < 12; i++) reportError(new Error(`distinct ${i}`));

    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("truncates oversized fields to the backend caps", async () => {
    const { reportError } = await freshReporter();
    const { body } = mockFetch();

    const err = new Error("x".repeat(2000));
    err.stack = "y".repeat(10000);
    reportError(err);

    const sent = body(0);
    expect(sent.message.length).toBeLessThanOrEqual(500);
    expect(sent.stack.length).toBeLessThanOrEqual(4000);
  });

  it("copes with non-Error values", async () => {
    const { reportError } = await freshReporter();
    const { fn, body } = mockFetch();

    reportError("a rejected string");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(body(0).message).toContain("a rejected string");
  });

  it("never throws, even when fetch itself is broken", async () => {
    const { reportError } = await freshReporter();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("network stack on fire");
      }),
    );

    expect(() => reportError(new Error("original"))).not.toThrow();
  });
});

describe("installGlobalErrorReporting", () => {
  it("reports window errors and unhandled rejections", async () => {
    const { installGlobalErrorReporting } = await freshReporter();
    const { fn } = mockFetch();

    installGlobalErrorReporting();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("global boom"), message: "global boom" }),
    );
    // jsdom lacks a PromiseRejectionEvent constructor; a hand-built event
    // with the same shape exercises the same listener.
    const rejection = new Event("unhandledrejection") as Event & { reason: unknown };
    rejection.reason = new Error("async boom");
    window.dispatchEvent(rejection);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
