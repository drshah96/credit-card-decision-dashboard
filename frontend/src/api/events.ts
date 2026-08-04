// In dev, Vite proxies /api → localhost:8000; in production VITE_API_URL
// points at the deployed backend — see api/cards.ts, which does the same.
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export interface EventPayload {
  session_id: string;
  event_type: "issuer_view" | "card_view";
  issuer?: string;
  card_id?: string;
}

// Fire-and-forget: session/page-view tracking should never block the page
// or surface an error to the visitor it's tracking. See backend/main.py's
// POST /api/events and backend/services/events.py record_page_view for the
// server side.
export function postEvent(payload: EventPayload): void {
  const url = `${BASE_URL}/events`;
  const body = JSON.stringify(payload);

  // sendBeacon survives page navigation/unload (a regular fetch can get
  // cancelled mid-flight when the user clicks to the next page) and never
  // blocks waiting on a response. Not available in every environment (e.g.
  // some test runners), so fall back to a normal, unawaited fetch — still
  // fire-and-forget, just without the unload-survival guarantee.
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Silently ignore — tracking must never surface an error to the visitor.
  });
}
