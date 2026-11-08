"""Mint and check MCP API keys.

    uv run python -m backend.scripts.mcp_keys mint --label "first reviewer" [--expires YYYY-MM-DD]
    uv run python -m backend.scripts.mcp_keys check < candidate.json

mint refuses unless both its input and its output are a terminal, so a live key doesn't end up in
a pipe, a file or an agent's transcript. It prints the key once and the record to append to
MCP_API_KEYS, and writes nothing.
"""

import argparse
import json
import sys
from datetime import date

from backend.mcp_server.keys import default_expiry, mint_key, parse_records


def _mint(args: argparse.Namespace) -> int:
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print(
            "error: mint needs a real terminal. Run it yourself, without a pipe or redirect.",
            file=sys.stderr,
        )
        return 2
    if args.no_expiry:
        expires = None
    else:
        expires = date.fromisoformat(args.expires) if args.expires else default_expiry()
    key, record = mint_key(args.label, expires, args.contact)
    print("Key, shown once. Store it in a password manager:\n")
    print(f"  {key}\n")
    print("Append this record to the MCP_API_KEYS array in Render, then save and deploy:\n")
    print(f"  {json.dumps(record.model_dump(mode='json'), separators=(',', ':'))}\n")
    return 0


def _check(_args: argparse.Namespace) -> int:
    try:
        records = parse_records(sys.stdin.read())
    except ValueError:
        print("error: not a valid MCP_API_KEYS value", file=sys.stderr)
        return 1
    for record in records:
        print(f"{record.id}  {record.label}  expires={record.expires}")
    print(f"{len(records)} record(s) valid")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    mint = commands.add_parser("mint")
    mint.add_argument("--label", required=True)
    mint.add_argument("--contact")
    when = mint.add_mutually_exclusive_group()
    when.add_argument("--expires")
    when.add_argument("--no-expiry", action="store_true")
    mint.set_defaults(func=_mint)
    check = commands.add_parser("check")
    check.set_defaults(func=_check)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
