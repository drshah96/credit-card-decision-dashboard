"""card feedback: interested respondents

Revision ID: 17bf796f577f
Revises: 93fb9fe16594
Create Date: 2026-08-12

Adds the second branch of the feedback form: someone who does not hold the card
but is interested in it, answering which feature caught their eye.

Hand-written rather than left as autogenerate produced it, for two reasons.

Autogenerate emitted the three column operations and **none of the six CHECK
constraints**, because it does not compare CHECK constraints at all. Left alone,
the ORM would carry the constraints and the database would not, and
`alembic check` would report no drift because it uses the same comparison.

And `rating` becomes nullable on a table that already exists, which SQLite
cannot do with ALTER. That needs batch mode, which rebuilds the table — and
SQLAlchemy cannot reflect CHECK constraints from SQLite, so a naive rebuild
would silently drop the five constraints the table already has. `copy_from`
supplies the full definition so the rebuild keeps them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "17bf796f577f"
down_revision: Union[str, Sequence[str], None] = "93fb9fe16594"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_CHECKS = [
    ("ck_card_feedback_respondent_type", "respondent_type IN ('holder','interested')"),
    (
        "ck_card_feedback_liked_feature",
        "liked_feature IS NULL OR liked_feature IN "
        "('earn_rates','credits','welcome_bonus','lounge_access','insurance',"
        "'no_annual_fee','intro_apr','transfer_partners')",
    ),
    (
        "ck_card_feedback_holder_has_rating",
        "respondent_type <> 'holder' OR rating IS NOT NULL",
    ),
    (
        "ck_card_feedback_interested_has_no_holder_fields",
        "respondent_type <> 'interested' OR ("
        "rating IS NULL AND held_for IS NULL AND would_keep IS NULL "
        "AND maximizes_value IS NULL)",
    ),
    (
        "ck_card_feedback_liked_feature_is_interest_only",
        "liked_feature IS NULL OR respondent_type = 'interested'",
    ),
]


def _table(rating_nullable: bool, with_new_columns: bool, with_new_checks: bool) -> sa.Table:
    """The table as it stands at a given point, for batch mode's copy_from.

    Spelled out rather than reflected because SQLite reflection returns no
    CHECK constraints, and a rebuild from a reflected definition would drop
    every one of them without failing.

    The three indexes are declared here for the same reason and were missed on
    the first attempt: batch mode rebuilds the table from this definition, so
    anything absent from it is silently gone afterwards. `alembic check`
    caught it, which is the whole argument for running that in CI.
    """
    columns = [
        sa.Column("feedback_id", sa.Integer(), primary_key=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
            index=True,
        ),
        sa.Column("card_slug", sa.String(), nullable=False, index=True),
        sa.Column("rating", sa.Integer(), nullable=rating_nullable),
        sa.Column("maximizes_value", sa.String(), nullable=True),
        sa.Column("held_for", sa.String(), nullable=True),
        sa.Column("would_keep", sa.Boolean(), nullable=True),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True, index=True),
        sa.Column("device_type", sa.String(), nullable=True),
        sa.Column("review_status", sa.String(), server_default="pending", nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    ]
    if with_new_columns:
        columns += [
            sa.Column("respondent_type", sa.String(), server_default="holder", nullable=False),
            sa.Column("liked_feature", sa.String(), nullable=True),
        ]
    constraints = [
        sa.CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 5"
            if rating_nullable
            else "rating BETWEEN 1 AND 5",
            name="ck_card_feedback_rating_range",
        ),
        sa.CheckConstraint(
            "maximizes_value IS NULL OR maximizes_value IN ('yes','partly','no')",
            name="ck_card_feedback_maximizes_value",
        ),
        sa.CheckConstraint(
            "held_for IS NULL OR held_for IN ('under_6m','6_to_12m','1_to_2y','2_to_5y','over_5y')",
            name="ck_card_feedback_held_for",
        ),
        sa.CheckConstraint(
            "review_status IN ('pending','published','rejected')",
            name="ck_card_feedback_review_status",
        ),
        sa.CheckConstraint("length(comment) <= 1000", name="ck_card_feedback_comment_length"),
        sa.UniqueConstraint("session_id", "card_slug", name="uq_card_feedback_session_card"),
    ]
    if with_new_checks:
        # The downgrade's copy_from has to describe the table as it actually
        # is, constraints included, or batch mode builds a definition that
        # never had them and dropping them fails with "No such constraint".
        constraints += [sa.CheckConstraint(cond, name=name) for name, cond in NEW_CHECKS]
    return sa.Table("card_feedback", sa.MetaData(), *columns, *constraints)


INDEXES = [
    ("ix_card_feedback_card_slug", "card_slug"),
    ("ix_card_feedback_session_id", "session_id"),
    ("ix_card_feedback_submitted_at", "submitted_at"),
]


def _recreate_indexes() -> None:
    """Batch mode rebuilds the table and does not carry its indexes across,
    even when copy_from declares them. Declaring index=True there is not
    enough — verified, the rebuilt table came back with none. So they are
    recreated explicitly after every rebuild, in both directions.

    Losing them would not fail anything: the table would keep working and
    every per-card aggregate would just start scanning. `alembic check` is
    what noticed, by comparing the ORM's indexes against the database.
    """
    for name, column in INDEXES:
        op.create_index(name, "card_feedback", [column], unique=False)


def upgrade() -> None:
    """Add the two columns, relax rating, and land all the constraints.

    Every existing row is a holder with a rating, so the conditional
    constraints hold for the data already in the table and this needs no
    backfill beyond the server_default.
    """
    op.add_column(
        "card_feedback",
        sa.Column("respondent_type", sa.String(), server_default="holder", nullable=False),
    )
    op.add_column("card_feedback", sa.Column("liked_feature", sa.String(), nullable=True))

    with op.batch_alter_table(
        "card_feedback",
        copy_from=_table(rating_nullable=False, with_new_columns=True, with_new_checks=False),
    ) as batch:
        batch.alter_column("rating", existing_type=sa.Integer(), nullable=True)
        batch.drop_constraint("ck_card_feedback_rating_range", type_="check")
        batch.create_check_constraint(
            "ck_card_feedback_rating_range", "rating IS NULL OR rating BETWEEN 1 AND 5"
        )
        for name, condition in NEW_CHECKS:
            batch.create_check_constraint(name, condition)

    _recreate_indexes()


def downgrade() -> None:
    """Reverse it. Any interested-respondent rows would violate the restored
    NOT NULL on rating, so they are removed first: they are rows the previous
    schema had no way to represent."""
    op.execute("DELETE FROM card_feedback WHERE respondent_type = 'interested'")

    with op.batch_alter_table(
        "card_feedback",
        copy_from=_table(rating_nullable=True, with_new_columns=True, with_new_checks=True),
    ) as batch:
        for name, _ in NEW_CHECKS:
            batch.drop_constraint(name, type_="check")
        batch.drop_constraint("ck_card_feedback_rating_range", type_="check")
        batch.create_check_constraint("ck_card_feedback_rating_range", "rating BETWEEN 1 AND 5")
        batch.alter_column("rating", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("liked_feature")
        batch.drop_column("respondent_type")

    _recreate_indexes()
