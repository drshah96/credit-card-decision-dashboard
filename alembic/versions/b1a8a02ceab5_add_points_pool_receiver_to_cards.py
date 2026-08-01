"""add points_pool_receiver to cards

Revision ID: b1a8a02ceab5
Revises: f3b7589665a8
Create Date: 2026-07-31 20:47:44.960891

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1a8a02ceab5'
down_revision: Union[str, Sequence[str], None] = 'f3b7589665a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default (not just the ORM's Python-side default=False) — the
    # table already has 103 rows, and a NOT NULL column needs a value for
    # every one of them at ALTER time. Matches the existing
    # points_per_100k_label precedent for the same situation.
    op.add_column(
        'cards',
        sa.Column('points_pool_receiver', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cards', 'points_pool_receiver')
