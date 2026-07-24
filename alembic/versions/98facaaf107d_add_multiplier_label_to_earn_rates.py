"""add multiplier_label to earn_rates

Revision ID: 98facaaf107d
Revises: d593910b187c
Create Date: 2026-07-21 12:56:17.957769

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '98facaaf107d'
down_revision: Union[str, Sequence[str], None] = 'd593910b187c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "earn_rates",
        sa.Column("multiplier_label", sa.String(), nullable=False, server_default=""),
    )
    # Backfill existing rows from the old parsed float so nothing regresses to
    # an empty label before the next full reseed from JSON (which will restore
    # the original strings, e.g. "5%", "Up to 4×", verbatim).
    op.execute(
        "UPDATE earn_rates SET multiplier_label = printf('%g×', multiplier_x) "
        "WHERE multiplier_label = ''"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("earn_rates", "multiplier_label")
