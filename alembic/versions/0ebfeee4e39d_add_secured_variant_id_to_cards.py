"""add secured_variant_id to cards

Revision ID: 0ebfeee4e39d
Revises: 379007a7a62e
Create Date: 2026-07-31 16:37:21.876622

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ebfeee4e39d'
down_revision: Union[str, Sequence[str], None] = '379007a7a62e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # batch_alter_table, not a plain op.add_column/create_unique_constraint:
    # SQLite has no ALTER TABLE ADD CONSTRAINT (see
    # NotImplementedError: "No support for ALTER of constraints in SQLite
    # dialect"), so adding a column and its unique constraint in one step
    # needs Alembic's copy-and-move batch mode there. On Postgres (what
    # production actually runs, per render.yaml) batch mode transparently
    # emits the plain ALTER statements instead.
    with op.batch_alter_table('cards') as batch_op:
        batch_op.add_column(sa.Column('secured_variant_id', sa.String(), nullable=True))
        batch_op.create_unique_constraint('uq_cards_secured_variant_id', ['secured_variant_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('cards') as batch_op:
        batch_op.drop_constraint('uq_cards_secured_variant_id', type_='unique')
        batch_op.drop_column('secured_variant_id')
