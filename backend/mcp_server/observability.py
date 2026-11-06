"""One JSON line per authenticated request. Never a key, an Authorization value or an IP."""

import json
import logging
import re
import sys
import time
from collections import Counter
from collections.abc import Callable

_ACCESS_LOG_ARGS = 5
_KEY_ANYWHERE = re.compile(r"twa_[0-9a-f]{8}_[A-Za-z0-9_-]+")

logger = logging.getLogger("backend.mcp_server")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False


def emit(level: int = logging.INFO, **fields: object) -> None:
    logger.log(level, json.dumps(fields, separators=(",", ":"), ensure_ascii=True))


def scrub_path(path: str) -> str:
    """Drop the query on /mcp, which takes none, and mask anything shaped like a key elsewhere."""
    bare = path.split("?", 1)[0]
    return _KEY_ANYWHERE.sub("[redacted]", bare if bare.rstrip("/") == "/mcp" else path)


class _AccessLogScrubber(logging.Filter):
    """Uvicorn logs the full URL, so a key sent there would reach the logs even when refused."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == _ACCESS_LOG_ARGS and isinstance(args[2], str):
            record.args = (*args[:2], scrub_path(args[2]), *args[3:])
        return True


_scrubber = _AccessLogScrubber()


def scrub_access_log() -> None:
    logging.getLogger("uvicorn.access").addFilter(_scrubber)


class RejectionAggregator:
    """Pre-auth rejections, emitted at most once a window, so a flood cannot flood the log."""

    def __init__(self, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self._window = window_seconds
        self._clock = clock
        self._counts: Counter[str] = Counter()
        self._started = clock()

    def add(self, kind: str) -> None:
        self._counts[kind] += 1
        if self._clock() - self._started >= self._window:
            self.flush()

    def flush(self) -> None:
        if self._counts:
            emit(
                event="mcp_rejections",
                window_seconds=int(self._window),
                counts=dict(sorted(self._counts.items())),
            )
        self._counts.clear()
        self._started = self._clock()
