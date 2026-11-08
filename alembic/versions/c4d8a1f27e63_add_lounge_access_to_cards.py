"""add lounge_access to cards

Revision ID: c4d8a1f27e63
Revises: b7c1e4a90d22
Create Date: 2026-11-07

Hand-written, for two reasons. Autogenerate does not emit CHECK constraints, so
the ORM would carry this one and the database would not. And batch mode would
rebuild `cards` on SQLite, which cannot reflect the table's existing
ck_card_verdict_status and would silently drop it.

ALTER TABLE with a column-level CHECK works unchanged on SQLite and Postgres, and
needs no rebuild. Dropping the column removes its constraint on both.

The column is nullable with no default: null means not yet audited, which is what
every card is until the next seed.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8a1f27e63"
down_revision: Union[str, Sequence[str], None] = "b7c1e4a90d22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cards ADD COLUMN lounge_access VARCHAR "
        "CONSTRAINT ck_card_lounge_access "
        "CHECK (lounge_access IN ('included','passes','paid','none'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE cards DROP COLUMN lounge_access")
