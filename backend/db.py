import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

_DEFAULT_SQLITE_PATH = os.path.join(os.path.dirname(__file__), "data", "card_catalog.db")


def _normalize_database_url(url: str) -> str:
    """Render (and other Heroku-style providers) hand out bare postgres:// or
    postgresql:// URLs, which SQLAlchemy resolves to the psycopg2 dialect by
    default — but this project installs psycopg (v3), not psycopg2. Force the
    psycopg3 dialect explicitly so those URLs work without a psycopg2 install.
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


DATABASE_URL = _normalize_database_url(
    os.environ.get("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")
)

if DATABASE_URL.startswith("sqlite"):
    _connect_args: dict = {"check_same_thread": False}
else:
    # connect_timeout caps how long libpq will sit on a TCP connect before
    # giving up. Without it the default is "wait indefinitely", which is not
    # a hypothetical: when Neon suspended this project's compute for an
    # unpaid invoice (2026-08-22 to 2026-08-27), connections to the Neon
    # endpoint neither succeeded nor were refused — they just hung. /health
    # inherited that hang and stopped answering at all, so the keep-warm
    # ping died on its own 90s curl timeout (exit 28) instead of getting the
    # fast 503 the endpoint is written to return, and Render's health check
    # hung the same way.
    #
    # 10s, not 2-3s: a genuinely cold Neon compute has to wake before it can
    # accept the connection, and a timeout tight enough to trip on a normal
    # wake-up would turn routine scale-to-zero into a fake outage.
    _connect_args = {"connect_timeout": 10}

# pool_pre_ping + pool_recycle: Neon's free tier auto-suspends its compute
# after a few minutes idle and can drop connections outright while
# suspended. Without pre_ping, SQLAlchemy hands a pooled connection back to
# the app without checking it's still alive, so the first query after any
# idle period risks a raw OperationalError instead of a transparent
# reconnect. Harmless no-op overhead on SQLite (local dev), where neither
# scenario applies.
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True, pool_recycle=300, connect_args=_connect_args
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

if DATABASE_URL.startswith("sqlite"):
    # SQLite ignores FOREIGN KEY constraints unless explicitly told to enforce them
    # per-connection — without this, the referential integrity the schema is built
    # on on Postgres silently doesn't apply in dev/test.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
