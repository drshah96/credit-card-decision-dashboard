from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from backend.db import session_scope
from backend.db_models import PageView, SessionModel


def record_page_view(
    session_id: str,
    event_type: str,
    issuer: str | None,
    card_slug: str | None,
    referrer: str | None = None,
    country: str | None = None,
    device_type: str | None = None,
) -> None:
    """Upsert the session row (creating it on first sight, else just bumping
    last_seen_at) and insert one page_views row. Fire-and-forget from the
    frontend's side — see backend/main.py's /api/events route — so this
    stays a single cheap write, no queue or batching needed at this scale."""
    with session_scope() as session:
        existing = session.get(SessionModel, session_id)
        if existing is None:
            try:
                # A SAVEPOINT, not the outer transaction: two requests racing
                # to record the same brand-new session_id (React StrictMode
                # double-invoking an effect on mount, or two tabs opened at
                # once) can both see no existing row above and both attempt
                # this INSERT — the loser hits sessions' primary-key UNIQUE
                # constraint. Recover by re-querying instead of letting that
                # surface as an unhandled 500 — same pattern already used by
                # backend/scripts/upsert.py's _get_or_create for the same
                # class of race.
                with session.begin_nested():
                    session.add(
                        SessionModel(
                            id=session_id,
                            referrer=referrer,
                            country=country,
                            device_type=device_type,
                        )
                    )
                    session.flush()
            except IntegrityError:
                existing = session.get(SessionModel, session_id)
                existing.last_seen_at = func.now()
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
