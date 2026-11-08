"""Runs keep-warm's real script with fake curl, date and sleep, so the hours are tested for real."""

import pathlib
import stat
import subprocess

import pytest
import yaml

WORKFLOW = pathlib.Path(__file__).resolve().parents[2] / ".github/workflows/keep-warm.yml"
CONFIG = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
SCRIPT = CONFIG["jobs"]["ping"]["steps"][0]["run"]
FAKE_CURL = """#!/bin/sh
echo "$*" >> "$CALLS"
case "$*" in
  */mcp*) printf '%s' "$MCP_STATUS" ;;
  *time_total*) printf '0.1' ;;
esac
"""
FAKE_DATE = """#!/bin/sh
case "$*" in
  *%H:%M:%S*) echo "$FAKE_HOUR:00:00" ;;
  *) echo "$FAKE_HOUR" ;;
esac
"""


def _run(tmp_path: pathlib.Path, hour: str, mcp_status: str = "401") -> tuple[int, list[str]]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in {
        "curl": FAKE_CURL,
        "date": FAKE_DATE,
        "sleep": "#!/bin/sh\nexit 0\n",
    }.items():
        fake = bin_dir / name
        fake.write_text(body)
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    calls = tmp_path / "calls"
    calls.touch()
    env = {
        "PATH": f"{bin_dir}:/usr/bin:/bin",
        "CALLS": str(calls),
        "FAKE_HOUR": hour,
        "MCP_STATUS": mcp_status,
    }
    result = subprocess.run(["bash", "-c", SCRIPT], env=env, capture_output=True, text=True)
    return result.returncode, calls.read_text().splitlines()


def _count(calls: list[str], path: str) -> int:
    return sum(call.rstrip().endswith(path) for call in calls)


def test_a_run_starts_every_30_minutes_at_every_hour():
    # PyYAML reads the bare key "on" as the boolean True.
    assert CONFIG[True]["schedule"] == [{"cron": "0,30 * * * *"}]


@pytest.mark.parametrize("hour", ["00", "03", "11", "14", "23"])
def test_the_database_check_runs_outside_the_quiet_hours(tmp_path, hour):
    code, calls = _run(tmp_path, hour)
    assert code == 0
    assert _count(calls, "/healthz") == 11
    assert _count(calls, "/health") == 2
    assert _count(calls, "/mcp") == 2


# 08 and 09 matter: read without the base prefix they are invalid octal numbers in bash.
@pytest.mark.parametrize("hour", ["04", "08", "09", "10"])
def test_overnight_keeps_render_awake_and_probes_mcp_without_waking_neon(tmp_path, hour):
    code, calls = _run(tmp_path, hour)
    assert code == 0
    assert _count(calls, "/healthz") == 11
    assert _count(calls, "/health") == 0
    assert _count(calls, "/mcp") == 2


@pytest.mark.parametrize("hour", ["05", "14"])
def test_a_broken_mcp_endpoint_fails_the_run_at_any_hour(tmp_path, hour):
    code, _ = _run(tmp_path, hour, mcp_status="503")
    assert code == 1


def test_the_mcp_probe_sends_an_invalid_key_so_anonymous_access_still_answers_401(tmp_path):
    _, calls = _run(tmp_path, "14")
    probes = [call for call in calls if call.rstrip().endswith("/mcp")]
    assert probes
    assert all("authorization: Bearer keep-warm-probe" in call for call in probes)
