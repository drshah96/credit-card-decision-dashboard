"""Key format, verification and config validation. Bad config disables MCP, never raises."""

import hashlib
import json
import re
from datetime import date

import pytest

from backend.mcp_server import keys as keys_module
from backend.mcp_server.config import load_config
from backend.mcp_server.keys import KEY_RE, KeyStore, mint_key, parse_records

TODAY = date(2026, 11, 6)


def _store(expires=None, today=TODAY):
    key, record = mint_key("reviewer", expires, today=today)
    return key, record, KeyStore([record])


def test_mint_round_trip_stores_only_a_hash():
    key, record, store = _store()
    assert KEY_RE.match(key)
    assert store.verify(f"Bearer {key}", TODAY) == record
    assert record.sha256 == hashlib.sha256(key.encode()).hexdigest()
    assert key not in record.model_dump_json()


def test_a_secret_containing_underscores_still_parses():
    key = "twa_3f9a1c2e_" + "a_b-" * 10 + "abc"
    assert len(key.split("_", 2)[2]) == 43
    record = keys_module.KeyRecord(
        id="3f9a1c2e",
        sha256=hashlib.sha256(key.encode()).hexdigest(),
        label="x",
        created=TODAY,
        expires=None,
    )
    assert KeyStore([record]).verify(f"Bearer {key}", TODAY) == record


def test_scheme_is_case_insensitive():
    key, record, store = _store()
    assert store.verify(f"bEaReR {key}", TODAY) == record


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Bearer",
        "Basic abc",
        "Bearer not-a-key",
        "Bearer twa_00000000_" + "a" * 43,
    ],
)
def test_invalid_headers_are_refused(header):
    _, _, store = _store()
    assert store.verify(header, TODAY) is None


def test_a_wrong_secret_for_a_real_id_is_refused():
    key, _, store = _store()
    wrong = key[:-1] + ("a" if key[-1] != "a" else "b")
    assert store.verify(f"Bearer {wrong}", TODAY) is None


def test_expiry_is_inclusive():
    key, _, store = _store(expires=date(2026, 11, 6))
    assert store.verify(f"Bearer {key}", date(2026, 11, 6)) is not None
    assert store.verify(f"Bearer {key}", date(2026, 11, 7)) is None


def test_comparison_uses_compare_digest(monkeypatch):
    calls = []
    real = keys_module.hmac.compare_digest
    monkeypatch.setattr(
        keys_module.hmac, "compare_digest", lambda a, b: calls.append(1) or real(a, b)
    )
    key, _, store = _store()
    store.verify(f"Bearer {key}", TODAY)
    assert calls


def _record_json(**overrides):
    _, record = mint_key("x", None, today=TODAY)
    return {**record.model_dump(mode="json"), **overrides}


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"a": 1}',
        json.dumps([_record_json(unknown=1)]),
        json.dumps([_record_json(label="")]),
        json.dumps([_record_json(per_minute=0)]),
        json.dumps([_record_json(sha256="short")]),
    ],
)
def test_malformed_config_disables_without_raising_or_echoing(raw):
    config = load_config({"MCP_API_KEYS": raw})
    assert config.enabled is False
    assert config.reason == "MCP_API_KEYS is invalid"


def test_duplicate_ids_or_hashes_and_too_many_records_are_invalid():
    one = _record_json()
    for raw in (json.dumps([one, one]), json.dumps([_record_json() for _ in range(51)])):
        assert load_config({"MCP_API_KEYS": raw}).enabled is False


def test_missing_and_empty_keys_disable():
    assert load_config({}).reason == "MCP_API_KEYS is not set"
    assert load_config({"MCP_API_KEYS": "[]"}).reason == "MCP_API_KEYS has no keys"


def test_valid_config_enables_and_parses_hosts():
    config = load_config(
        {"MCP_API_KEYS": json.dumps([_record_json()]), "MCP_ALLOWED_HOSTS": "a.example, b.example"}
    )
    assert config.enabled is True
    assert config.allowed_hosts == ("a.example", "b.example")
    assert len(config.keys) == 1


def test_parse_records_accepts_contact():
    assert parse_records(json.dumps([_record_json(contact="ops@example.com")]))[0].contact


def test_key_format_never_splits_on_underscore():
    assert re.fullmatch(KEY_RE.pattern, "twa_3f9a1c2e_" + "_" * 43)


def test_anonymous_access_enables_without_keys():
    config = load_config({"MCP_ANONYMOUS_ACCESS": " TRUE "})
    assert config.enabled is True
    assert config.anonymous is True
    assert len(config.keys) == 0
    assert load_config({"MCP_ANONYMOUS_ACCESS": "true", "MCP_API_KEYS": "[]"}).enabled is True


def test_anonymous_access_is_off_unless_switched_on():
    assert load_config({"MCP_API_KEYS": json.dumps([_record_json()])}).anonymous is False
    assert load_config({"MCP_ANONYMOUS_ACCESS": "false"}).reason == "MCP_API_KEYS is not set"
    assert load_config({"MCP_ANONYMOUS_ACCESS": ""}).reason == "MCP_API_KEYS is not set"


def test_an_unclear_anonymous_switch_disables_rather_than_guessing():
    for value in ("yes", "1", "on", "treu"):
        config = load_config({"MCP_ANONYMOUS_ACCESS": value})
        assert config.enabled is False
        assert config.reason == "MCP_ANONYMOUS_ACCESS must be true or false"


def test_broken_keys_disable_even_with_anonymous_access():
    config = load_config({"MCP_ANONYMOUS_ACCESS": "true", "MCP_API_KEYS": "not json"})
    assert config.enabled is False
    assert config.reason == "MCP_API_KEYS is invalid"
