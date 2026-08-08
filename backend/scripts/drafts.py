"""CLI for the card review queue.

    uv run python -m backend.scripts.drafts add   <slug> <source_url> <json_file>
    uv run python -m backend.scripts.drafts list   [--status pending]
    uv run python -m backend.scripts.drafts show   <draft_id>
    uv run python -m backend.scripts.drafts promote <draft_id> [--notes "..."]
    uv run python -m backend.scripts.drafts reject  <draft_id> --notes "..."

`add` validates the JSON against the same Pydantic Card schema the API
returns before it's allowed into the queue — a draft that doesn't parse
never becomes something a reviewer has to puzzle over. `promote` re-validates
before writing, then runs it through the shared upsert_card() so a promoted
draft and a hand-authored card go through identical code.

`promote` and `reject` are the human review gate, so they refuse to run
unless stdin is a terminal. See _require_interactive() below.
"""

import argparse
import json
import sys
from datetime import datetime, timezone

from pydantic import ValidationError

from backend.db import session_scope
from backend.db_models import CardDraft
from backend.models import Card
from backend.scripts.upsert import upsert_card

INTERACTIVE_ONLY = ("promote", "reject")


def _require_interactive(command: str) -> None:
    """Refuse to run when stdin isn't a terminal.

    Approving or rejecting a draft is the one step in this pipeline meant to be
    a person's decision. Everything else is mechanical and safe to automate:
    `add` only writes to the queue, `list` and `show` only read.

    The check is on *how* the command was invoked rather than on what it looks
    like, which is what makes it hold. An agent, a script, a CI job and a piped
    shell all arrive here the same way, with no terminal on stdin, regardless of
    which tool is driving or how the command string is spelled. Pattern-matching
    the command text instead would both miss invocations that don't look like
    the pattern and fire on ones that merely mention it.

    Consequence worth knowing before changing this: promotion happens in a real
    terminal, not through an assistant's shell tool. That is the intent, not a
    side effect. If it ever becomes genuinely obstructive, the alternative is an
    explicit --confirm flag, which keeps the deliberate-act property while
    allowing an in-session run.
    """
    if sys.stdin.isatty():
        return
    sys.exit(
        f"error: '{command}' needs an interactive terminal and stdin is not one.\n"
        f"Approving or rejecting a draft is the human review gate for the catalog, "
        f"so it is deliberately not runnable from an agent, a script, or a pipe.\n"
        f"Run it yourself:  uv run python -m backend.scripts.drafts {command} <draft-id>"
    )


def cmd_add(args: argparse.Namespace) -> None:
    with open(args.json_file) as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        sys.exit(
            f"error: {args.json_file} does not contain a JSON object (got {type(raw).__name__})"
        )

    if raw.get("id") != args.slug:
        sys.exit(
            f"error: JSON 'id' ({raw.get('id')!r}) does not match slug argument ({args.slug!r})"
        )

    try:
        Card(**raw)
    except ValidationError as exc:
        sys.exit(f"error: extracted JSON does not match the Card schema:\n{exc}")

    with session_scope() as session:
        draft = CardDraft(
            card_slug=args.slug,
            source_url=args.source_url,
            extracted_json=json.dumps(raw, indent=2),
            status="pending",
        )
        session.add(draft)
        session.flush()
        print(f"draft #{draft.draft_id} added for '{args.slug}' — status: pending")


def cmd_list(args: argparse.Namespace) -> None:
    with session_scope() as session:
        query = session.query(CardDraft)
        if args.status:
            query = query.filter_by(status=args.status)
        drafts = query.order_by(CardDraft.fetched_at.desc()).all()
        if not drafts:
            print("no drafts found")
            return
        for d in drafts:
            print(
                f"#{d.draft_id:<4} {d.status:<9} {d.card_slug:<14} {d.fetched_at}  {d.source_url}"
            )


def cmd_show(args: argparse.Namespace) -> None:
    with session_scope() as session:
        draft = session.get(CardDraft, args.draft_id)
        if draft is None:
            sys.exit(f"error: no draft #{args.draft_id}")
        print(f"draft #{draft.draft_id}  [{draft.status}]")
        print(f"card_slug:   {draft.card_slug}")
        print(f"source_url:  {draft.source_url}")
        print(f"fetched_at:  {draft.fetched_at}")
        if draft.reviewer_notes:
            print(f"notes:       {draft.reviewer_notes}")
        print()
        print(draft.extracted_json)


def cmd_promote(args: argparse.Namespace) -> None:
    with session_scope() as session:
        draft = session.get(CardDraft, args.draft_id)
        if draft is None:
            sys.exit(f"error: no draft #{args.draft_id}")
        if draft.status == "approved":
            sys.exit(f"error: draft #{args.draft_id} was already promoted at {draft.reviewed_at}")
        if draft.status == "rejected":
            sys.exit(
                f"error: draft #{args.draft_id} was rejected at {draft.reviewed_at} "
                f"({draft.reviewer_notes!r}) — fix the extracted JSON and add it as a new draft "
                "instead of promoting a rejected one"
            )

        data = json.loads(draft.extracted_json)
        try:
            Card(**data)
        except ValidationError as exc:
            sys.exit(f"error: draft no longer matches the Card schema, fix and re-add:\n{exc}")

        card = upsert_card(session, data)
        draft.status = "approved"
        draft.reviewer_notes = args.notes
        draft.reviewed_at = datetime.now(timezone.utc)
        print(f"promoted draft #{draft.draft_id} -> card '{card.slug}' (card_id={card.card_id})")


def cmd_reject(args: argparse.Namespace) -> None:
    with session_scope() as session:
        draft = session.get(CardDraft, args.draft_id)
        if draft is None:
            sys.exit(f"error: no draft #{args.draft_id}")
        draft.status = "rejected"
        draft.reviewer_notes = args.notes
        draft.reviewed_at = datetime.now(timezone.utc)
        print(f"rejected draft #{draft.draft_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Card ingestion review queue")
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="add a pending draft from a JSON file")
    p_add.add_argument("slug")
    p_add.add_argument("source_url")
    p_add.add_argument("json_file")
    p_add.set_defaults(func=cmd_add)

    p_list = sub.add_parser("list", help="list drafts")
    p_list.add_argument("--status", choices=["pending", "approved", "rejected"])
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show", help="show one draft's full extracted JSON")
    p_show.add_argument("draft_id", type=int)
    p_show.set_defaults(func=cmd_show)

    p_promote = sub.add_parser("promote", help="approve a draft and upsert it into the live tables")
    p_promote.add_argument("draft_id", type=int)
    p_promote.add_argument("--notes")
    p_promote.set_defaults(func=cmd_promote)

    p_reject = sub.add_parser("reject", help="reject a draft")
    p_reject.add_argument("draft_id", type=int)
    p_reject.add_argument("--notes", required=True)
    p_reject.set_defaults(func=cmd_reject)

    args = parser.parse_args()
    if args.command in INTERACTIVE_ONLY:
        _require_interactive(args.command)
    args.func(args)


if __name__ == "__main__":
    main()
