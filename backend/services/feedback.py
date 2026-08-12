"""Recording one visitor's experience of a card.

Deliberately thinner than services/events.py: that one upserts a session row
before inserting, because analytics is only useful joined to a session. This
one does not. Feedback stands on its own, `session_id` is stored loose and may
be absent entirely, and making a written opinion depend on an analytics table
existing first would be the tail wagging the dog.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.db import session_scope
from backend.db_models import CardFeedback


def record_card_feedback(
    card_slug: str,
    respondent_type: str = "holder",
    rating: int | None = None,
    liked_feature: str | None = None,
    maximizes_value: str | None = None,
    held_for: str | None = None,
    would_keep: bool | None = None,
    comment: str | None = None,
    session_id: str | None = None,
    device_type: str | None = None,
) -> int:
    """Insert one row and return its id.

    Returns the id rather than None (unlike record_page_view, which is
    fire-and-forget) because the caller is a person who pressed a button and
    is owed a real answer: the endpoint reports success only if a row was
    actually written.

    `comment` is normalised here rather than at the edge: whitespace stripped,
    and an empty or whitespace-only string stored as NULL. Otherwise "did they
    leave a comment" becomes two questions — is it NULL, and is it blank —
    every time this table is read.
    """
    cleaned = (comment.strip() if comment else None) or None
    values = dict(
        respondent_type=respondent_type,
        rating=rating,
        liked_feature=liked_feature,
        maximizes_value=maximizes_value,
        held_for=held_for,
        would_keep=would_keep,
        comment=cleaned,
        device_type=device_type,
    )

    with session_scope() as session:
        # Resubmitting replaces rather than duplicating. uq_card_feedback_session_card
        # makes a second insert an IntegrityError, and a 500 is the wrong answer to
        # someone changing their mind, or to a double-click, or to a retried fetch.
        #
        # Re-submitting also resets review_status to pending: the text under review
        # is not the text that was reviewed any more, so carrying a "published"
        # verdict across an edit would publish something nobody approved.
        existing = None
        if session_id is not None:
            existing = session.scalar(
                select(CardFeedback).where(
                    CardFeedback.session_id == session_id,
                    CardFeedback.card_slug == card_slug,
                )
            )
        if existing is not None:
            for field, value in values.items():
                setattr(existing, field, value)
            existing.review_status = "pending"
            existing.reviewed_at = None
            session.flush()
            return existing.feedback_id

        feedback = CardFeedback(card_slug=card_slug, session_id=session_id, **values)
        session.add(feedback)
        try:
            session.flush()
        except IntegrityError:
            # Two submissions from one session raced. The row that won is the
            # answer; this one is the same person saying the same thing twice.
            session.rollback()
            winner = session.scalar(
                select(CardFeedback).where(
                    CardFeedback.session_id == session_id,
                    CardFeedback.card_slug == card_slug,
                )
            )
            if winner is None:
                raise
            return winner.feedback_id
        return feedback.feedback_id
