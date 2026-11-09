"""add points_redeemable and open_to_new_applicants to cards

Revision ID: d9e3f1a7b2c4
Revises: c4d8a1f27e63
Create Date: 2026-11-08

Hand-written, like c4d8a1f27e63 and for the same reasons: autogenerate doesn't emit the CHECK
constraint, and batch mode would rebuild `cards` on SQLite and drop ck_card_verdict_status.
ALTER TABLE ADD COLUMN with a column-level CHECK and a constant default works on SQLite and
Postgres without a rebuild.

Both columns are NOT NULL with a default, so every existing row reads as a card whose rewards
can be spent anywhere and that is open to new applicants until the next seed says otherwise.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9e3f1a7b2c4"
down_revision: Union[str, Sequence[str], None] = "c4d8a1f27e63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cards ADD COLUMN points_redeemable VARCHAR NOT NULL DEFAULT 'anywhere' "
        "CONSTRAINT ck_card_points_redeemable "
        "CHECK (points_redeemable IN ('anywhere','store_only'))"
    )
    op.execute("ALTER TABLE cards ADD COLUMN open_to_new_applicants BOOLEAN NOT NULL DEFAULT TRUE")


def downgrade() -> None:
    op.execute("ALTER TABLE cards DROP COLUMN open_to_new_applicants")
    op.execute("ALTER TABLE cards DROP COLUMN points_redeemable")
