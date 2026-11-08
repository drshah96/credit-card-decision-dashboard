"""mint refuses without a terminal on both ends, so a live key can't be captured by accident."""

import io
import json
import sys
from datetime import date

import pytest

from backend.mcp_server.keys import KeyRecord, KeyStore, mint_key
from backend.scripts import mcp_keys


class _Stdin(io.StringIO):
    def __init__(self, text: str = "", tty: bool = False) -> None:
        super().__init__(text)
        self._tty = tty

    def isatty(self) -> bool:
        return self._tty


def _set_terminals(monkeypatch, stdin: bool, stdout: bool) -> None:
    monkeypatch.setattr("sys.stdin", _Stdin(tty=stdin))
    monkeypatch.setattr(sys.stdout, "isatty", lambda: stdout)


@pytest.mark.parametrize(
    ("stdin", "stdout"),
    [(False, True), (True, False), (False, False)],
    ids=["piped_input", "captured_output", "neither"],
)
def test_mint_refuses_without_a_terminal_on_both_ends(monkeypatch, capsys, stdin, stdout):
    _set_terminals(monkeypatch, stdin, stdout)
    assert mcp_keys.main(["mint", "--label", "x"]) == 2
    captured = capsys.readouterr()
    assert "twa_" not in captured.out + captured.err


def test_minted_record_verifies_the_printed_key(monkeypatch, capsys):
    _set_terminals(monkeypatch, stdin=True, stdout=True)
    assert mcp_keys.main(["mint", "--label", "reviewer", "--expires", "2999-01-01"]) == 0
    lines = [line.strip() for line in capsys.readouterr().out.splitlines()]
    key = next(line for line in lines if line.startswith("twa_"))
    record = KeyRecord.model_validate(json.loads(next(ln for ln in lines if ln.startswith("{"))))
    assert record.expires == date(2999, 1, 1)
    assert KeyStore([record]).verify(f"Bearer {key}") == record


def test_check_validates_and_never_prints_hashes(monkeypatch, capsys):
    _, record = mint_key("reviewer", None)
    raw = json.dumps([record.model_dump(mode="json")])
    monkeypatch.setattr("sys.stdin", _Stdin(raw))
    assert mcp_keys.main(["check"]) == 0
    output = capsys.readouterr().out
    assert record.id in output and record.sha256 not in output

    monkeypatch.setattr("sys.stdin", _Stdin("nonsense"))
    assert mcp_keys.main(["check"]) == 1
