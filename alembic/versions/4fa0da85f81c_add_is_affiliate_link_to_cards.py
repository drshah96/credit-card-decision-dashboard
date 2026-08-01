"""add is_affiliate_link to cards

Revision ID: 4fa0da85f81c
Revises: b1a8a02ceab5
Create Date: 2026-08-01 10:16:51.501666

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4fa0da85f81c'
down_revision: Union[str, Sequence[str], None] = 'b1a8a02ceab5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default (not just the ORM's Python-side default=False) — the
    # table already has 103 rows, and a NOT NULL column needs a value for
    # every one of them at ALTER time. Matches the points_pool_receiver
    # precedent for the same situation.
    op.add_column(
        'cards',
        sa.Column('is_affiliate_link', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cards', 'is_affiliate_link')
