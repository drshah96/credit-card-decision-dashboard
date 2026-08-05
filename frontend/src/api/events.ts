// In dev, Vite proxies /api → localhost:8000; in production VITE_API_URL
// points at the deployed backend — see api/cards.ts, which does the same.
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export interface EventPayload {
  session_id: string;
  event_type: "issuer_view" | "card_view";
  issuer?: string;
  card_id?: string;
  referrer?: string;
}

// Fire-and-forget: session/page-view tracking should never block the page
// or surface an error to the visitor it's tracking. See backend/main.py's
// POST /api/events and backend/services/events.py record_page_view for the
// server side.
//
// Deliberately NOT using navigator.sendBeacon here, despite it being the
// textbook choice for unload-safe fire-and-forget tracking. Verified live
// against production (thewalletaudit.com -> api.thewalletaudit.com, a
// genuinely cross-origin request) that sendBeacon() reports success
// (returns true) but silently fails to deliver the request — confirmed
// across every variant tried (application/json and text/plain content
// types, both the Cloudflare-proxied domain and Render's raw origin
// directly) — while a plain fetch delivered successfully 100% of the time
// in the same tests. keepalive: true gives fetch a similar (if not
// identical) unload-survival guarantee to sendBeacon in modern browsers,
// without the silent-failure risk.
export function postEvent(payload: EventPayload): void {
  const url = `${BASE_URL}/events`;
  const body = JSON.stringify(payload);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Silently ignore — tracking must never surface an error to the visitor.
  });
}
