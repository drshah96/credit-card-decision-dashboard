"""The feature option list exists in four places. This is the only thing
comparing them.

The list appears as a tuple in `db_models.py`, a CHECK constraint on
`card_feedback_features`, a Pydantic `Literal`, and a TypeScript union — and
the labels the form renders are keyed off a fifth copy. The ADR that added
`redemption_rate` and renamed `intro_apr` proved this list changes, and a
mismatch between any two copies is a 422 for an option the form offers, or a
dead option nobody can pick.

Parsing the TypeScript from Python follows `tests/backend/test_catalog_files.py`,
which already reads a `.ts` source rather than keeping a hand-typed copy of what
it asserts. A test that copies the list is a fifth place for it to be wrong.
"""

import pathlib
import re
import typing

from backend.db_models import LIKED_FEATURES, CardFeedbackFeature
from backend.models import MAX_FEATURES, CardFeedbackIn

ROOT = pathlib.Path(__file__).resolve().parents[2]
FEEDBACK_TS = ROOT / "frontend" / "src" / "api" / "feedback.ts"
FEATURES_TS = ROOT / "frontend" / "src" / "utils" / "cardFeatures.ts"


def _typescript_union() -> list[str]:
    source = FEEDBACK_TS.read_text()
    block = source[
        source.index("export type LikedFeature") : source.index(
            ";", source.index("export type LikedFeature")
        )
    ]
    return re.findall(r'"(\w+)"', block)


def _typescript_labels() -> list[str]:
    source = FEATURES_TS.read_text()
    start = source.index("LIKED_FEATURE_LABELS")
    block = source[start : source.index("};", start)]
    return re.findall(r"^\s{2}(\w+):", block, re.M)


def _pydantic_literal() -> list[str]:
    field = CardFeedbackIn.model_fields["features"]
    # list[Literal[...]] | None -> the Literal's arguments
    for arg in typing.get_args(field.annotation):
        for inner in typing.get_args(arg):
            values = typing.get_args(inner)
            if values:
                return list(values)
    raise AssertionError("could not find the Literal inside the features annotation")


def _check_constraint() -> list[str]:
    for constraint in CardFeedbackFeature.__table__.constraints:
        if constraint.name == "ck_card_feedback_features_feature":
            return re.findall(r"'(\w+)'", str(constraint.sqltext))
    raise AssertionError("the feature CHECK constraint is gone")


def test_each_source_was_actually_parsed() -> None:
    """Every assertion below compares two parsed lists, so a parser that
    silently returns nothing would make them all pass."""
    for name, values in [
        ("db_models tuple", list(LIKED_FEATURES)),
        ("CHECK constraint", _check_constraint()),
        ("Pydantic Literal", _pydantic_literal()),
        ("TypeScript union", _typescript_union()),
        ("form labels", _typescript_labels()),
    ]:
        assert len(values) >= 5, f"{name} parsed as {values}"


def test_all_four_copies_of_the_option_list_agree() -> None:
    canonical = sorted(LIKED_FEATURES)
    assert sorted(_check_constraint()) == canonical, "the CHECK constraint disagrees"
    assert sorted(_pydantic_literal()) == canonical, "the Pydantic Literal disagrees"
    assert sorted(_typescript_union()) == canonical, "the TypeScript union disagrees"


def test_every_option_has_a_label_and_every_label_an_option() -> None:
    """A label with no option renders nothing; an option with no label renders
    an empty checkbox."""
    assert sorted(_typescript_labels()) == sorted(LIKED_FEATURES)


def test_the_pick_cap_agrees_across_the_language_boundary() -> None:
    """The form stops offering options at its own cap and the API enforces
    another. If the frontend's were the larger of the two, someone would fill in
    the form, press submit and get a 422 for an answer the page invited.

    Read out of the TypeScript rather than duplicated here, for the same reason
    the option list is.
    """
    source = FEEDBACK_TS.read_text()
    match = re.search(r"export const MAX_FEATURES\s*=\s*(\d+)", source)
    assert match, "MAX_FEATURES is no longer exported from api/feedback.ts"
    assert int(match.group(1)) == MAX_FEATURES, (
        f"the form allows {match.group(1)} picks and the API allows "
        f"{MAX_FEATURES}; the smaller one is the real limit and the larger one "
        "is a 422 waiting for a visitor"
    )


def test_the_cap_is_not_larger_than_the_option_list() -> None:
    """A cap above the number of options is unreachable, and would mean the
    'pick up to N' hint on the form names a number nobody can reach. Cards offer
    a subset of these, so this is the loosest possible version of that check."""
    assert 1 <= MAX_FEATURES <= len(LIKED_FEATURES)


def test_the_retired_and_renamed_values_are_gone_everywhere() -> None:
    """`welcome_bonus` was removed because the page does not render it, and
    `intro_apr` was renamed because 33 cards carry both intro types and the
    labels sit side by side. A stored option id is a data format: leaving an
    old name in one copy is how a 422 reaches production."""
    everywhere = (
        set(LIKED_FEATURES)
        | set(_check_constraint())
        | set(_pydantic_literal())
        | set(_typescript_union())
        | set(_typescript_labels())
    )
    assert "welcome_bonus" not in everywhere
    assert "intro_apr" not in everywhere
