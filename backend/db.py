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

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
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
