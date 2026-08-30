"""add ongoing apr and fee text fields to cards

Revision ID: bffe96fda8b4
Revises: a33ef0b1f418
Create Date: 2026-08-01 22:03:22.768725

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "bffe96fda8b4"
down_revision: Union[str, Sequence[str], None] = "a33ef0b1f418"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # All nullable — NULL means "not yet audited" for that card, no
    # server_default needed (see the earlier intro-APR migration for why
    # that only matters for NOT NULL columns).
    op.add_column("cards", sa.Column("variable_apr", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("balance_transfer_apr", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("balance_transfer_fee", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("foreign_transaction_fee_rate", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("cards", "foreign_transaction_fee_rate")
    op.drop_column("cards", "balance_transfer_fee")
    op.drop_column("cards", "balance_transfer_apr")
    op.drop_column("cards", "variable_apr")
