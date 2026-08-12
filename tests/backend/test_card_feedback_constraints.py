"""The card_feedback CHECK constraints, pinned against drift nothing else sees.

Two gaps this closes, both raised by schema-reviewer.

`alembic check` compares tables, columns, indexes and unique constraints. It
does **not** compare CHECK constraints — which is the one class of object the
migration's `copy_from` exists to preserve, and therefore the one class nothing
verified. The ORM's constraint text and the migration's constraint text are
maintained by hand in two files and agree today only because someone diffed all
eleven by eye.

And the branch-exclusivity constraint names holder-only columns one by one.
Adding a holder-only column without adding it to that list is silent: the
column simply escapes the rule, and an interested row could carry it.
"""

import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from backend.db_models import LIKED_FEATURES, CardFeedback, CardFeedbackFeature

REPO_ROOT = Path(__file__).resolve().parents[2]

TABLE = "card_feedback"
CHILD_TABLE = "card_feedback_features"

# Columns that both branches share, or that are bookkeeping. Everything else is
# holder-only by definition and must appear in the exclusivity constraint. A new
# column lands in neither set until someone classifies it, which is the point.
SHARED_OR_BOOKKEEPING = {
    "feedback_id",
    "submitted_at",
    "card_slug",
    "respondent_type",
    "comment",
    "session_id",
    "device_type",
    "review_status",
    "reviewed_at",
}

EXCLUSIVITY = "ck_card_feedback_interested_has_no_holder_fields"


def _orm_checks() -> dict[str, str]:
    return {
        c.name: str(c.sqltext)
        for c in CardFeedback.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }


@pytest.fixture(scope="module")
def migrated_db(tmp_path_factory: pytest.TempPathFactory):
    """A SQLite file built the way production builds one: `alembic upgrade head`.

    Everything below reads from this rather than from `backend.db.engine`,
    because conftest points that engine at a database built with `create_all`
    from ORM metadata. Asking it what the schema looks like asks the ORM to
    confirm itself.
    """
    db = tmp_path_factory.mktemp("migrated") / "schema.sqlite"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": f"sqlite:///{db}"},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic upgrade head failed:\n{result.stderr}"
    return db


def _table_ddl(db, table: str) -> str:
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
    assert row, f"the migrations did not create {table}"
    return row[0]


@pytest.fixture(scope="module")
def migrated_ddl(migrated_db) -> str:
    """The CREATE TABLE produced by running the migrations, not by create_all.

    This distinction is the whole point. conftest builds the test database from
    ORM metadata, so comparing the ORM against it is circular: change the model
    and the database changes with it, and the two can never disagree. Production
    runs `alembic upgrade head`, so the only way to catch the model and the
    migrations drifting apart is to build a database the way production does.

    A first version of this file compared against the create_all database and
    reported everything as fine while the two said different things.

    This is also the only place the SQLite migration path executes at all. CI
    runs migrations against Postgres, where batch_alter_table never rebuilds a
    table, so the branch that does the intricate work has been running
    unverified.
    """
    return _table_ddl(migrated_db, TABLE)


def _database_checks(ddl: str) -> dict[str, str]:
    """Constraint name -> its condition, as the database actually stores it.

    Scanned with balanced parentheses rather than a regex. A non-greedy
    `CHECK \\((.*?)\\)` stops at the first closing paren, which for
    `length(comment) <= 1000` is the one inside `length(` — so that constraint
    silently parsed as absent and the comparison below reported it as drift.
    """
    out: dict[str, str] = {}
    for match in re.finditer(r"CONSTRAINT (ck_card_feedback_\w+) CHECK \(", ddl):
        depth, i = 1, match.end()
        while depth and i < len(ddl):
            depth += (ddl[i] == "(") - (ddl[i] == ")")
            i += 1
        out[match.group(1)] = _norm(ddl[match.end() : i - 1])
    return out


def _norm(sql: str) -> str:
    """Collapse whitespace so formatting differences are not reported as drift."""
    return re.sub(r"\s+", " ", sql).strip()


def test_every_orm_check_constraint_exists_in_the_database_with_the_same_condition(
    migrated_ddl: str,
) -> None:
    """The ORM declares them; the migration creates them; nothing compared the
    two. Tests build the schema with create_all from the ORM, production runs
    the migration, so a divergence would pass CI and enforce something else in
    production.

    Compares the condition, not just the name. A first version of this test
    checked only that the name was present, which passed happily while the ORM
    said one thing and the database enforced another.
    """
    in_db = _database_checks(migrated_ddl)
    assert len(in_db) >= 8, f"only parsed {len(in_db)} constraints out of the DDL; regex stale?"
    drift = [
        f"{name}: model has {_norm(condition)!r}, database has {in_db.get(name)!r}"
        for name, condition in _orm_checks().items()
        if in_db.get(name) != _norm(condition)
    ]
    assert drift == [], "\n".join(drift)


def test_the_database_has_no_check_constraint_the_model_does_not_declare(
    migrated_ddl: str,
) -> None:
    """The other direction. A constraint left behind by a migration would
    reject writes the model believes are legal."""
    in_db = set(re.findall(r"CONSTRAINT (ck_card_feedback_\w+)", migrated_ddl))
    assert in_db - set(_orm_checks()) == set()


def test_every_holder_only_column_is_named_in_the_exclusivity_constraint() -> None:
    """Adding a holder-only column without adding it here is silent: an
    interested row could then carry it, and the branches stop being exclusive
    one column at a time."""
    condition = _orm_checks()[EXCLUSIVITY]
    columns = {c.name for c in CardFeedback.__table__.columns}
    holder_only = sorted(columns - SHARED_OR_BOOKKEEPING)
    assert holder_only, "the classification lists every column as shared; is it stale?"
    unnamed = [c for c in holder_only if not re.search(rf"\b{c}\b", condition)]
    assert unnamed == [], (
        f"{unnamed} are holder-only but not named in {EXCLUSIVITY}, so an "
        "interested row could carry them"
    )


def test_the_classification_covers_every_column() -> None:
    """The forcing function for the test above: a column in neither set means
    nobody decided which branch it belongs to."""
    columns = {c.name for c in CardFeedback.__table__.columns}
    condition = _orm_checks()[EXCLUSIVITY]
    unclassified = sorted(
        c
        for c in columns
        if c not in SHARED_OR_BOOKKEEPING and not re.search(rf"\b{c}\b", condition)
    )
    assert unclassified == []


# Written out because the docstring writes them out. Only the values this
# codebase could plausibly reach are here; an unmapped word fails loudly below
# rather than silently skipping the comparison.
WORD_NUMBERS = {
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
}

COUNTS_SENTENCE = re.compile(r"(\w+) CHECK\s+constraints across (\w+) columns")


def test_the_child_table_docstring_cites_the_real_constraint_and_column_counts(
    migrated_ddl: str,
) -> None:
    """`CardFeedbackFeature`'s docstring argues for the child table by citing how
    much `card_feedback` costs to rebuild, in constraints and columns. Those
    numbers are the reason the table exists, so they get quoted forward into
    review comments and ADRs, and nothing else notices when a later migration
    makes them wrong.

    This already happened once. The docstring cited ten constraints across
    fourteen columns, which were the numbers for the rejected design, the table
    as it would have been with a `liked_feature` column on it. The shipped table
    has eight and thirteen.

    Reads the numbers out of the docstring rather than repeating them, so this
    test cannot drift from the prose it is pinning. Adding a constraint or a
    column to `card_feedback` now fails here until the docstring is updated to
    match.
    """
    doc = CardFeedbackFeature.__doc__ or ""
    match = COUNTS_SENTENCE.search(doc)
    assert match, (
        "CardFeedbackFeature's docstring no longer states its counts as "
        "'<n> CHECK constraints across <n> columns'. Either restore the phrasing "
        "or update COUNTS_SENTENCE, but do not drop the numbers: they are the "
        "argument for the child table existing."
    )

    claimed_checks, claimed_columns = (WORD_NUMBERS.get(w.lower()) for w in match.groups())
    assert claimed_checks and claimed_columns, (
        f"unmapped number word in {match.group(0)!r}; add it to WORD_NUMBERS"
    )

    actual_checks = len(_database_checks(migrated_ddl))
    actual_columns = len(CardFeedback.__table__.columns)
    assert (claimed_checks, claimed_columns) == (actual_checks, actual_columns), (
        f"CardFeedbackFeature's docstring claims card_feedback carries "
        f"{claimed_checks} CHECK constraints across {claimed_columns} columns, but it "
        f"carries {actual_checks} across {actual_columns}. Update the docstring, and "
        "the counterfactual in the sentence after it, which is one column and two "
        "constraints above these."
    )


def test_the_indexes_survived_the_migration_rebuild(migrated_db) -> None:
    """SQLite cannot ALTER a column to nullable, so the migration rebuilds the
    table. The rebuild dropped every index on the first attempt and nothing
    failed: the table kept working and every per-card aggregate would have
    started scanning.

    Read off the migrated database, not off `backend.db.engine`. conftest
    points that engine at a scratch file built with `create_all`, so asking it
    which indexes exist asks the ORM to confirm its own declarations — it would
    pass whether or not the rebuild kept a single one, which is the failure this
    test names in its first sentence. Same circularity the `migrated_ddl`
    docstring warns about, in the one test that was not using it.
    """
    with sqlite3.connect(migrated_db) as conn:
        names = {r[1] for r in conn.execute(f"PRAGMA index_list('{TABLE}')")}
    assert {
        "ix_card_feedback_card_slug",
        "ix_card_feedback_session_id",
        "ix_card_feedback_submitted_at",
    } <= names


@pytest.fixture(scope="module")
def migrated_child_ddl(migrated_db) -> str:
    """The child table's CREATE TABLE as the migrations actually produce it.

    Separate from `migrated_ddl` above and for the same reason that one exists.
    `test_liked_feature_options.py` compares the option list against
    `CardFeedbackFeature.__table__`, which is the ORM comparing itself to
    itself: it proves the Python objects agree, not that the database enforces
    them. `alembic check` cannot close the gap either, because it does not
    compare CHECK constraints at all.
    """
    return _table_ddl(migrated_db, CHILD_TABLE)


def test_the_migrated_feature_check_lists_exactly_the_canonical_options(
    migrated_child_ddl: str,
) -> None:
    """The option list lives in the ORM, the Pydantic Literal, a TypeScript
    union, the form's labels and this migration. The first four are pinned
    against each other; this is the only thing checking the fifth.

    Adding an option to LIKED_FEATURES without adding it to the migration's
    CHECK gives a database that rejects an option the form offers, and every
    other test passes because they all read the ORM.
    """
    in_db = re.findall(r"'(\w+)'", migrated_child_ddl)
    assert sorted(in_db) == sorted(LIKED_FEATURES), (
        "the CHECK constraint the migration creates does not match LIKED_FEATURES"
    )


def test_the_child_table_keeps_its_unique_constraint_through_the_migration(
    migrated_child_ddl: str,
) -> None:
    """It is what makes the resubmission delete-and-reinsert safe, and it is
    also the index standing in for one on feedback_id."""
    assert "uq_card_feedback_features_row" in migrated_child_ddl


def _downgrade(db, allow_loss: bool) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}"}
    if allow_loss:
        env["ALEMBIC_ALLOW_FEEDBACK_DATA_LOSS"] = "1"
    else:
        env.pop("ALEMBIC_ALLOW_FEEDBACK_DATA_LOSS", None)
    return subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "93fb9fe16594"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def populated_db(tmp_path):
    """A migrated database holding one holder row that named a feature.

    The holder case specifically: an interested row is obviously unrepresentable
    by the old schema, but a holder row survives the downgrade while the answer
    it gave to the feature question cannot, which is the loss that is easy to
    miss.
    """
    db = tmp_path / "downgrade.sqlite"
    up = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": f"sqlite:///{db}"},
        capture_output=True,
        text=True,
    )
    assert up.returncode == 0, up.stderr
    with sqlite3.connect(db) as conn:
        conn.execute(
            "INSERT INTO card_feedback (card_slug, respondent_type, rating, review_status) "
            "VALUES ('amex-platinum', 'holder', 5, 'pending')"
        )
        conn.execute(
            "INSERT INTO card_feedback_features (feedback_id, feature) VALUES (1, 'earn_rates')"
        )
        conn.commit()
    return db


def test_downgrade_refuses_to_discard_a_holders_feature_pick(populated_db) -> None:
    """The holder's own row survives a downgrade, so counting only interested
    rows would let this through silently. Nothing exercised downgrade at all
    before this test, which is how that went unnoticed."""
    result = _downgrade(populated_db, allow_loss=False)
    assert result.returncode != 0, "downgrade destroyed a holder's feature pick without asking"
    assert "feature picks made by holders" in result.stderr

    # And it really did refuse: the row is still there.
    with sqlite3.connect(populated_db) as conn:
        assert conn.execute("SELECT count(*) FROM card_feedback_features").fetchone()[0] == 1


def test_downgrade_proceeds_once_the_loss_is_accepted(populated_db) -> None:
    result = _downgrade(populated_db, allow_loss=True)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(populated_db) as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert CHILD_TABLE not in tables
        cols = {r[1] for r in conn.execute("PRAGMA table_info(card_feedback)")}
        assert "respondent_type" not in cols
        # The holder row itself survives; only its feature pick was lost.
        assert conn.execute("SELECT count(*) FROM card_feedback").fetchone()[0] == 1


def test_downgrade_of_an_empty_database_needs_no_override(tmp_path) -> None:
    """With nothing to lose the guard must not fire, or every developer
    resetting a dev database has to set an environment variable to do it."""
    db = tmp_path / "empty.sqlite"
    up = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": f"sqlite:///{db}"},
        capture_output=True,
        text=True,
    )
    assert up.returncode == 0, up.stderr
    result = _downgrade(db, allow_loss=False)
    assert result.returncode == 0, result.stderr
