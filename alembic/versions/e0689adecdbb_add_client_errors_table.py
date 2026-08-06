"""add client_errors table

Revision ID: e0689adecdbb
Revises: a1c4d7e92f30
Create Date: 2026-08-06 17:51:15.994113

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0689adecdbb'
down_revision: Union[str, Sequence[str], None] = 'a1c4d7e92f30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """First-party frontend error capture (issue #149) — see ClientError in
    backend/db_models.py for what each column is and the PII stance. Plain
    create_table, so none of the batch_alter_table ceremony the constraint
    migrations need."""
    op.create_table(
        "client_errors",
        sa.Column("error_id", sa.Integer(), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("path", sa.String(), nullable=True),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("stack", sa.String(), nullable=True),
        sa.Column("component_stack", sa.String(), nullable=True),
        sa.Column("device_type", sa.String(), nullable=True),
    )
    op.create_index("ix_client_errors_occurred_at", "client_errors", ["occurred_at"])
    op.create_index("ix_client_errors_session_id", "client_errors", ["session_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_client_errors_session_id", table_name="client_errors")
    op.drop_index("ix_client_errors_occurred_at", table_name="client_errors")
    op.drop_table("client_errors")
