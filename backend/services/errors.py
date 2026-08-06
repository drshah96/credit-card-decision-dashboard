"""Persistence for frontend-reported JavaScript errors — see ClientError in
backend/db_models.py for the table's reasoning and issue #149 for why this
exists. Mirrors the shape of services/events.py: one narrow function the
route handler calls, session_scope inside, no return value the caller could
be tempted to surface to the visitor."""

from backend.db import session_scope
from backend.db_models import ClientError


def record_client_error(
    *,
    message: str,
    session_id: str | None,
    path: str | None,
    stack: str | None,
    component_stack: str | None,
    device_type: str | None,
) -> None:
    with session_scope() as db:
        db.add(
            ClientError(
                message=message,
                session_id=session_id,
                path=path,
                stack=stack,
                component_stack=component_stack,
                device_type=device_type,
            )
        )
