"""add partner_type to card_transfer_partners

Revision ID: 379007a7a62e
Revises: 57d71dbabced
Create Date: 2026-07-24 22:30:19.330139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '379007a7a62e'
down_revision: Union[str, Sequence[str], None] = '57d71dbabced'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('card_transfer_partners') as batch_op:
        batch_op.add_column(sa.Column('partner_type', sa.String(), nullable=True))
        batch_op.create_check_constraint(
            'ck_transfer_partner_type', "partner_type IN ('airline','hotel')"
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('card_transfer_partners') as batch_op:
        batch_op.drop_constraint('ck_transfer_partner_type', type_='check')
        batch_op.drop_column('partner_type')
