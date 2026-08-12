"""card feedback: interested respondents

Revision ID: b7c1e4a90d22
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

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7c1e4a90d22"
down_revision: Union[str, Sequence[str], None] = "93fb9fe16594"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_CHECKS = [
    ("ck_card_feedback_respondent_type", "respondent_type IN ('holder','interested')"),
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
    """Restore the indexes the rebuild dropped, on the backends that rebuild.

    The two backends diverge here and the naive version was wrong on each in
    turn. SQLite cannot ALTER a column to nullable, so batch mode copies the
    table, and on the Alembic version installed here the rebuilt table came
    back with no indexes even though copy_from declares them. Postgres can
    ALTER in place, so batch mode never rebuilds and every index survives.

    Whether a given Alembic version recreates them is not worth depending on
    either way: the inspector guard below is idempotent, so this is correct
    if they survive and correct if they do not.

    Recreating unconditionally therefore worked locally and failed on Postgres
    with `DuplicateTable: relation "ix_card_feedback_card_slug" already
    exists`. Asking the database which indexes it actually has is the only
    version that is right on both.

    Losing them silently would fail nothing: the table keeps working and every
    per-card aggregate quietly starts scanning. `alembic check` caught the
    SQLite half; the Neon preview migration caught the Postgres half.
    """
    existing = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("card_feedback")}
    for name, column in INDEXES:
        if name not in existing:
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

    op.create_table(
        "card_feedback_features",
        sa.Column("feedback_feature_id", sa.Integer(), nullable=False),
        sa.Column("feedback_id", sa.Integer(), nullable=False),
        sa.Column("feature", sa.String(), nullable=False),
        sa.CheckConstraint(
            "feature IN ('earn_rates','insurance','no_annual_fee','credits',"
            "'intro_apr_purchases','redemption_rate','intro_apr_balance_transfer',"
            "'transfer_partners','lounge_access','status_perks')",
            name="ck_card_feedback_features_feature",
        ),
        sa.ForeignKeyConstraint(["feedback_id"], ["card_feedback.feedback_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("feedback_feature_id"),
        # Leads with feedback_id, so it serves the join too. No separate index
        # on feedback_id; see the model docstring for why that is deliberate.
        sa.UniqueConstraint("feedback_id", "feature", name="uq_card_feedback_features_row"),
    )

    # The documented way to read feature answers, because the raw table cannot
    # be read correctly without a join and nothing stops you trying.
    #
    # card_feedback_features carries no respondent_type, deliberately: it is on
    # the parent and a second copy is a drift surface. The cost is that
    # `SELECT feature, count(*) ... GROUP BY feature` returns a plausible number
    # that is wrong twice over. Holders answer the question optionally and
    # interested respondents must answer it, so the two contribute at different
    # rates; and the form withholds the intro-APR options from holders, so those
    # two can only come from one branch while the rest come from both. A pooled
    # count therefore ranks a single-branch numerator against two-branch ones.
    #
    # Documentation loses that argument to SELECT * every time. A view makes the
    # correct join the obvious thing to query instead of a rule to remember.
    op.execute(
        "CREATE VIEW v_card_feedback_features AS "
        "SELECT f.feedback_feature_id, f.feedback_id, f.feature, "
        "p.card_slug, p.respondent_type, p.review_status, p.submitted_at "
        "FROM card_feedback_features f "
        "JOIN card_feedback p ON p.feedback_id = f.feedback_id"
    )


def downgrade() -> None:
    """Reverse it.

    Two different rows are destroyed here, and both are counted before anything
    is dropped.

    Interested rows violate the restored NOT NULL on rating, so they have to
    go. There is no honest conversion: turning one into a holder row would mean
    inventing a rating, and an invented rating lands in the per-card average.

    Feature picks go too, and not only the interested ones. `features` is
    optional for holders but real, so a holder row survives this downgrade
    while the answer they gave to one of its questions does not — the previous
    schema has nowhere to put it. Counting only the interested rows would let
    that loss through silently, which is the failure this guard exists to
    prevent, so both are counted and either one is enough to stop.

    It refuses rather than deletes. Nothing runs downgrade automatically —
    render.yaml runs `alembic upgrade head` only — so an operator is always
    present and a hard stop costs them a minute, against rows that are the only
    copy of what a visitor wrote.
    """
    # Counted before anything is destroyed, so the guard is not deciding
    # whether to raise about a table it has already dropped. A raise inside a
    # migration would roll the DDL back on both backends, but ordering the
    # check first means that is a backstop rather than the mechanism.
    bind = op.get_bind()
    interested = bind.execute(
        sa.text("SELECT count(*) FROM card_feedback WHERE respondent_type = 'interested'")
    ).scalar_one()
    holder_features = bind.execute(
        sa.text(
            "SELECT count(*) FROM card_feedback_features f "
            "JOIN card_feedback p ON p.feedback_id = f.feedback_id "
            "WHERE p.respondent_type = 'holder'"
        )
    ).scalar_one()

    if (interested or holder_features) and os.environ.get(
        "ALEMBIC_ALLOW_FEEDBACK_DATA_LOSS"
    ) != "1":
        raise RuntimeError(
            f"{interested} interested-respondent rows and {holder_features} feature "
            "picks made by holders cannot be represented by the previous schema and "
            "would be deleted. The holders' own rows survive; only the answer they "
            "gave to that one question is lost. All of it is the only copy of what "
            "those visitors wrote: there is no export and no analytics duplicate. "
            "Re-run with ALEMBIC_ALLOW_FEEDBACK_DATA_LOSS=1 to accept that."
        )

    # The view first: Postgres refuses to drop a table a view depends on, so
    # leaving this until after drop_table would fail there and pass on SQLite,
    # which does not check.
    op.execute("DROP VIEW IF EXISTS v_card_feedback_features")

    # Children next, explicitly. ON DELETE CASCADE does not fire during SQLite
    # migrations: alembic/env.py builds its own engine and never sees
    # backend/db.py's PRAGMA foreign_keys=ON listener, so the FK is inert here.
    op.drop_table("card_feedback_features")
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
        batch.drop_column("respondent_type")

    _recreate_indexes()
