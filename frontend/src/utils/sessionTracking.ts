import { postEvent } from "../api/events";

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

export function recordPageView(
  eventType: "issuer_view" | "card_view",
  issuer?: string,
  cardId?: string,
): void {
  postEvent({
    session_id: getSessionId(),
    event_type: eventType,
    issuer,
    card_id: cardId,
  });
}
