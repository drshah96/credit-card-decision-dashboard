"""Pre-shared API keys, stored only as hashes. A 256-bit random key needs no slow hash."""

import hashlib
import hmac
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

# Never split a key on "_": the base64url secret can contain it.
KEY_RE = re.compile(r"^twa_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$")
_BEARER_RE = re.compile(r"^bearer +(\S+)$", re.IGNORECASE)
MAX_RECORDS = 50
DEFAULT_EXPIRY_DAYS = 90


class KeyRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: Annotated[str, Field(pattern=r"^[0-9a-f]{8}$")]
    sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    label: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[\x20-\x7e]+$")]
    created: date
    expires: date | None
    per_minute: Annotated[int | None, Field(ge=1, le=600)] = None
    per_day: Annotated[int | None, Field(ge=1, le=100_000)] = None
    contact: Annotated[str | None, Field(max_length=128, pattern=r"^[\x20-\x7e]+$")] = None


class _Records(BaseModel):
    records: Annotated[list[KeyRecord], Field(max_length=MAX_RECORDS)]

    @model_validator(mode="after")
    def _ids_and_hashes_are_unique(self) -> "_Records":
        for attr in ("id", "sha256"):
            values = [getattr(r, attr) for r in self.records]
            if len(set(values)) != len(values):
                raise ValueError(f"duplicate {attr} in key records")
        return self


_RECORD_LIST = TypeAdapter(list[KeyRecord])


def parse_records(raw: str) -> list[KeyRecord]:
    """Raises ValueError on anything malformed. Callers must not echo the error text."""
    return _Records(records=_RECORD_LIST.validate_json(raw)).records


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


class KeyStore:
    def __init__(self, records: list[KeyRecord]) -> None:
        self._by_id = {r.id: r for r in records}

    def __len__(self) -> int:
        return len(self._by_id)

    def verify(self, authorization: str | None, today: date | None = None) -> KeyRecord | None:
        """The record for a valid Authorization header value, else None."""
        bearer = _BEARER_RE.match(authorization or "")
        if bearer is None:
            return None
        key = bearer.group(1)
        parsed = KEY_RE.match(key)
        if parsed is None:
            return None
        record = self._by_id.get(parsed.group(1))
        if record is None:
            return None
        if record.expires is not None and record.expires < (today or _utc_today()):
            return None
        digest = hashlib.sha256(key.encode()).hexdigest()
        return record if hmac.compare_digest(digest, record.sha256) else None


def mint_key(
    label: str, expires: date | None, contact: str | None = None, today: date | None = None
) -> tuple[str, KeyRecord]:
    """A new key, returned once, and the record to store. Nothing is written anywhere."""
    key_id = secrets.token_hex(4)
    key = f"twa_{key_id}_{secrets.token_urlsafe(32)}"
    record = KeyRecord(
        id=key_id,
        sha256=hashlib.sha256(key.encode()).hexdigest(),
        label=label,
        created=today or _utc_today(),
        expires=expires,
        contact=contact,
    )
    return key, record


def default_expiry(today: date | None = None) -> date:
    return (today or _utc_today()) + timedelta(days=DEFAULT_EXPIRY_DAYS)
