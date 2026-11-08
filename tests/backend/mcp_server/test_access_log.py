"""A key sent in a URL must not reach uvicorn's access log. TestClient bypasses that log."""

import logging
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
import uvicorn
from uvicorn.logging import AccessFormatter

from backend.main import app
from backend.mcp_server import mcp_endpoint
from backend.mcp_server.observability import scrub_path

from .http_helpers import enabled_config

KEY = "twa_0123abcd_" + "s3cret_-" * 5 + "abc"


class _Lines(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.setFormatter(AccessFormatter('%(request_line)s" %(status_code)s', use_colors=False))
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(self.format(record))


@contextmanager
def real_server(snapshot, config) -> Iterator[tuple[str, _Lines]]:
    access = logging.getLogger("uvicorn.access")
    lines = _Lines()
    level = access.level
    access.addHandler(lines)
    access.setLevel(logging.INFO)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_config=None))
    thread = threading.Thread(target=server.run, daemon=True)
    try:
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(mcp_endpoint, "config_loader", lambda: config)
            patch.setattr(mcp_endpoint, "snapshot_builder", lambda: snapshot)
            thread.start()
            deadline = time.monotonic() + 15
            while not server.started:
                assert time.monotonic() < deadline, "uvicorn did not start"
                time.sleep(0.02)
            port = server.servers[0].sockets[0].getsockname()[1]
            yield f"http://127.0.0.1:{port}", lines
            server.should_exit = True
            thread.join(15)
    finally:
        server.should_exit = True
        access.removeHandler(lines)
        access.setLevel(level)


def _status(url: str, method: str = "GET") -> int:
    request = urllib.request.Request(url, method=method, data=b"{}" if method == "POST" else None)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def test_a_key_in_the_url_never_reaches_the_real_access_log(snapshot):
    config, real_key = enabled_config()
    secret = real_key.split("_", 2)[2]
    with real_server(snapshot, config) as (base, lines):
        assert _status(f"{base}/mcp?key={real_key}", "POST") == 401
        assert _status(f"{base}/mcp/?key={real_key}", "POST") == 404
        assert _status(f"{base}/healthz?key={real_key}") == 200
        assert _status(f"{base}/healthz?probe=1") == 200
    text = "\n".join(lines.lines)
    assert len(lines.lines) == 4, text
    assert secret not in text
    assert "POST /mcp HTTP/1.1" in lines.lines[0]
    assert "POST /mcp/ HTTP/1.1" in lines.lines[1]
    assert "[redacted]" in lines.lines[2]
    assert "/healthz?probe=1" in lines.lines[3]


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/mcp", "/mcp"),
        (f"/mcp?key={KEY}", "/mcp"),
        (f"/mcp/?token={KEY}&a=1", "/mcp/"),
        ("/mcp?token=not-shaped-like-a-key", "/mcp"),
        (f"/mcp/{KEY}", "/mcp/[redacted]"),
        (f"/?key={KEY}", "/?key=[redacted]"),
        (f"/api/cards?key={KEY}&ids=a,b", "/api/cards?key=[redacted]&ids=a,b"),
        ("/api/cards?ids=amex-gold,amex-green", "/api/cards?ids=amex-gold,amex-green"),
        ("/mcpx?a=1", "/mcpx?a=1"),
    ],
)
def test_scrub_path(path, expected):
    assert scrub_path(path) == expected


def test_scrubbing_tolerates_a_record_of_another_shape():
    from backend.mcp_server.observability import _scrubber

    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "plain", None, None)
    assert _scrubber.filter(record) is True
    assert record.args is None
