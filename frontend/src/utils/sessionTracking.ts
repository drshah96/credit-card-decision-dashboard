import { postEvent, type EventType } from "../api/events";

const STORAGE_KEY = "wa_session_id";

// Anonymous, client-generated, no PII — see backend/db_models.py
// SessionModel for why this can't be a server-assigned id instead. Survives
// reloads and new tabs in the same browser; a cleared localStorage (or a
// different browser/device) just starts a new session, which is fine for
// traffic analysis at this scale.
function getSessionId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Storage can throw in some privacy modes — fall back to an in-memory
    // id for this page load rather than breaking the page over analytics.
    return crypto.randomUUID();
  }
}

export function recordPageView(eventType: EventType, issuer?: string, cardId?: string): void {
  postEvent({
    session_id: getSessionId(),
    event_type: eventType,
    issuer,
    card_id: cardId,
    // The full referring URL, e.g. "https://www.google.com/search?q=...".
    // Backend extracts just the host and only stores it on first-touch (see
    // backend/main.py track_event) — safe to send on every call even though
    // document.referrer stays constant across client-side route changes in
    // this SPA. Empty string on a direct visit, normalized to undefined so
    // it's omitted from the request body entirely rather than sent as "".
    referrer: document.referrer || undefined,
  });
}
