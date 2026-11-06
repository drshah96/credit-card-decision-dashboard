"""One JSON line per authenticated request. Never a key, an Authorization value or an IP."""

import json
import logging
import sys
import time
from collections import Counter
from collections.abc import Callable

logger = logging.getLogger("backend.mcp_server")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False


def emit(level: int = logging.INFO, **fields: object) -> None:
    logger.log(level, json.dumps(fields, separators=(",", ":"), ensure_ascii=True))


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
