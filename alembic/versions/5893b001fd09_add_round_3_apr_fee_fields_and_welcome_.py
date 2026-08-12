"""add round 3 apr fee fields and welcome bonus to cards

Revision ID: 5893b001fd09
Revises: bffe96fda8b4
Create Date: 2026-08-03 17:43:36.508963

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5893b001fd09"
down_revision: Union[str, Sequence[str], None] = "bffe96fda8b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # All nullable — NULL means "not yet audited" for that card (or, for
    # pay_over_time_fee, "not applicable to this issuer"). No server_default
    # needed; see the earlier intro-APR migration for why that only matters
    # for NOT NULL columns.
    op.add_column("cards", sa.Column("cash_advance_apr", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("penalty_apr", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("penalty_apr_trigger", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("pay_over_time_fee", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("late_payment_fee", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("returned_payment_fee", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("returned_check_fee", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("welcome_bonus_bonus", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("welcome_bonus_requirement", sa.String(), nullable=True))
    op.add_column("cards", sa.Column("welcome_bonus_estimated_value", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("cards", "welcome_bonus_estimated_value")
    op.drop_column("cards", "welcome_bonus_requirement")
    op.drop_column("cards", "welcome_bonus_bonus")
    op.drop_column("cards", "returned_check_fee")
    op.drop_column("cards", "returned_payment_fee")
    op.drop_column("cards", "late_payment_fee")
    op.drop_column("cards", "pay_over_time_fee")
    op.drop_column("cards", "penalty_apr_trigger")
    op.drop_column("cards", "penalty_apr")
    op.drop_column("cards", "cash_advance_apr")
