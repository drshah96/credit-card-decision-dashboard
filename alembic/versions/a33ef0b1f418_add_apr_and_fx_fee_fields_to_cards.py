"""add apr and fx fee fields to cards

Revision ID: a33ef0b1f418
Revises: 4fa0da85f81c
Create Date: 2026-08-01 21:31:57.631188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a33ef0b1f418'
down_revision: Union[str, Sequence[str], None] = '4fa0da85f81c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # All five nullable — NULL means "not yet audited" for that card, so no
    # server_default footgun here (that only bites NOT NULL columns against
    # an already-populated table, see the points_pool_receiver migration).
    op.add_column('cards', sa.Column('intro_apr_purchases_rate', sa.String(), nullable=True))
    op.add_column('cards', sa.Column('intro_apr_purchases_months', sa.Integer(), nullable=True))
    op.add_column(
        'cards', sa.Column('intro_apr_balance_transfers_rate', sa.String(), nullable=True)
    )
    op.add_column(
        'cards', sa.Column('intro_apr_balance_transfers_months', sa.Integer(), nullable=True)
    )
    op.add_column('cards', sa.Column('foreign_transaction_fee', sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cards', 'foreign_transaction_fee')
    op.drop_column('cards', 'intro_apr_balance_transfers_months')
    op.drop_column('cards', 'intro_apr_balance_transfers_rate')
    op.drop_column('cards', 'intro_apr_purchases_months')
    op.drop_column('cards', 'intro_apr_purchases_rate')
