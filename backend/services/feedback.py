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
from backend.db_models import CardFeedback, CardFeedbackFeature


def record_card_feedback(
    card_slug: str,
    respondent_type: str = "holder",
    rating: int | None = None,
    features: list[str] | None = None,
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
            # Replaced, not added to. Without the delete a resubmission would
            # leave the previous pick attached, so someone who changed their
            # mind would end up having named two features.
            session.query(CardFeedbackFeature).filter_by(feedback_id=existing.feedback_id).delete()
            _add_features(session, existing.feedback_id, features)
            session.flush()
            return existing.feedback_id

        feedback = CardFeedback(card_slug=card_slug, session_id=session_id, **values)
        session.add(feedback)
        try:
            session.flush()
        except IntegrityError:
            # Two submissions from one session raced. The row that won is the
            # answer; this one is the same person saying the same thing twice.
            #
            # Only reachable with a session id. Without one there is nothing to
            # race: NULLs are mutually distinct under
            # uq_card_feedback_session_card, so a unique violation cannot
            # happen, and the only way here is a CHECK violation. Recovering
            # from that would look up `session_id IS NULL AND card_slug = ?`,
            # match an unrelated stranger's unsessioned row, and return their
            # feedback_id with a 201 while this submission was silently lost.
            session.rollback()
            if session_id is None:
                raise
            winner = session.scalar(
                select(CardFeedback).where(
                    CardFeedback.session_id == session_id,
                    CardFeedback.card_slug == card_slug,
                )
            )
            if winner is None:
                raise
            # The winner's children are left alone. A race here is one person
            # double-submitting the same form state, so the row that won
            # already carries these exact answers.
            return winner.feedback_id

        _add_features(session, feedback.feedback_id, features)
        session.flush()
        return feedback.feedback_id


def _add_features(session, feedback_id: int, features: list[str] | None) -> None:
    """Attach the chosen features to a feedback row.

    Inside the caller's session_scope on purpose: a submission and its picks
    are one fact, and a partial write would leave a row claiming someone named
    nothing when they did.
    """
    for feature in features or []:
        session.add(CardFeedbackFeature(feedback_id=feedback_id, feature=feature))
