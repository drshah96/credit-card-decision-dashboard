// First-party frontend error capture — the answer to "a crash on a card page
// is invisible unless the visitor emails us" (issue #149). Reports land in
// our own client_errors table next to page_views, in the same Neon console
// the analytics already get read from, instead of a third-party service:
// nothing about a visitor leaves our infrastructure, there's no account or
// SDK, and the bundle cost is this file.
//
// Two rules the whole file is built around:
//   1. Reporting must never throw, block, or surface anything to the
//      visitor. Every path is wrapped; failure to report is itself silent.
//   2. Volume is bounded client-side, not just server-side. A render loop
//      can fire the same error hundreds of times a second — dedupe by
//      message and stop after a handful per page load, so the server-side
//      rate limiter (shared with /api/events) is a backstop, not the plan.
import { getSessionId } from "./sessionTracking";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

const MAX_REPORTS_PER_PAGE_LOAD = 5;
const reported = new Set<string>();
let reportCount = 0;

export function reportError(error: unknown, componentStack?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = `${err.name}: ${err.message}`.slice(0, 500);

    const key = message.slice(0, 200);
    if (reported.has(key) || reportCount >= MAX_REPORTS_PER_PAGE_LOAD) return;
    reported.add(key);
    reportCount += 1;

    fetch(`${BASE_URL}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        session_id: getSessionId(),
        // pathname only, by contract with ClientErrorIn on the backend —
        // query strings from inbound links never reach the table.
        path: window.location.pathname.slice(0, 512),
        stack: err.stack?.slice(0, 4000),
        component_stack: componentStack?.slice(0, 4000),
      }),
      // Same unload-survival choice as api/events.ts, for the same reason:
      // sendBeacon was verified live to silently drop cross-origin JSON.
      keepalive: true,
    }).catch(() => {
      // A failed error report must not itself become an error.
    });
  } catch {
    // See rule 1.
  }
}

/** Call once at boot. Catches everything the ErrorBoundary can't: errors
 * outside the React tree, and unhandled promise rejections (React error
 * boundaries only see errors thrown during rendering — an async fetch
 * blowing up in an event handler never reaches them). */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    if (event.error) reportError(event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason);
  });
}
