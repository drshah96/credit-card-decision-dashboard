from sqlalchemy import func

from backend.db import session_scope
from backend.db_models import PageView, SessionModel


def record_page_view(
    session_id: str,
    event_type: str,
    issuer: str | None,
    card_slug: str | None,
    referrer: str | None = None,
) -> None:
    """Upsert the session row (creating it on first sight, else just bumping
    last_seen_at) and insert one page_views row. Fire-and-forget from the
    frontend's side — see backend/main.py's /api/events route — so this
    stays a single cheap write, no queue or batching needed at this scale."""
    with session_scope() as session:
        existing = session.get(SessionModel, session_id)
        if existing is None:
            session.add(SessionModel(id=session_id, referrer=referrer))
        else:
            existing.last_seen_at = func.now()
        session.add(
            PageView(
                session_id=session_id,
                event_type=event_type,
                issuer=issuer,
                card_slug=card_slug,
            )
        )
