"""add verdict_short_tag to cards

Revision ID: d593910b187c
Revises: a45d60514c16
Create Date: 2026-07-20 17:13:24.879286

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd593910b187c'
down_revision: Union[str, Sequence[str], None] = 'a45d60514c16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "cards",
        sa.Column("verdict_short_tag", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("cards", "verdict_short_tag")
