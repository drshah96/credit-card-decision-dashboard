"""expand page_views event_type to cover all pages and selections

Revision ID: f5e891bf35ba
Revises: ddb6cc70abfa
Create Date: 2026-08-04 23:47:07.049418

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5e891bf35ba'
down_revision: Union[str, Sequence[str], None] = 'ddb6cc70abfa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_EVENT_TYPES = "'issuer_view','card_view'"
NEW_EVENT_TYPES = (
    "'issuer_view','card_view','home_view','top_pick_view',"
    "'compare_view','methodology_view','top_pick_card_selected',"
    "'compare_card_selected'"
)


def upgrade() -> None:
    """Upgrade schema."""
    # Alembic autogenerate doesn't detect CHECK constraint content changes,
    # so this is hand-written. batch_alter_table (not a plain
    # drop_constraint/create_check_constraint) because SQLite can't alter a
    # CHECK constraint in place — batch mode rebuilds the table under the
    # hood, same pattern already used for the secured_variant_id unique
    # constraint migration.
    with op.batch_alter_table("page_views") as batch_op:
        batch_op.drop_constraint("ck_page_view_event_type", type_="check")
        batch_op.create_check_constraint(
            "ck_page_view_event_type", f"event_type IN ({NEW_EVENT_TYPES})"
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("page_views") as batch_op:
        batch_op.drop_constraint("ck_page_view_event_type", type_="check")
        batch_op.create_check_constraint(
            "ck_page_view_event_type", f"event_type IN ({OLD_EVENT_TYPES})"
        )
