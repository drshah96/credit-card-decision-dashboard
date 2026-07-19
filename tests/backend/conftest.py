"""Points the app at a throwaway SQLite database before any backend module is
imported, so tests never read or write the real dev database. The DATABASE_URL
env var must be set before `backend.db` is first imported anywhere — that's
what creates the module-level engine — so this happens at conftest import
time, ahead of test collection.
"""

import json
import os
import tempfile
from pathlib import Path

import pytest

_tmp_fd, _tmp_db_path = tempfile.mkstemp(suffix=".db", prefix="wallet_audit_test_")
os.close(_tmp_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db_path}"

from backend.db import Base, SessionLocal, engine  # noqa: E402
from backend.scripts.upsert import upsert_card  # noqa: E402

_CARDS_DIR = Path(__file__).parent.parent.parent / "backend" / "data" / "cards"


@pytest.fixture(scope="session", autouse=True)
def _seed_test_database():
    Base.metadata.create_all(engine)
    session = SessionLocal()
    try:
        for path in sorted(_CARDS_DIR.glob("**/*.json")):
            if "staging" in path.parts:
                continue  # not yet promoted — shouldn't behave like a live card in tests
            upsert_card(session, json.loads(path.read_text()))
        session.commit()
    finally:
        session.close()

    yield

    engine.dispose()
    os.remove(_tmp_db_path)
