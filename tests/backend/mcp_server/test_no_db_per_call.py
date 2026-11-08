"""Tool calls must not touch Neon. Boot builds the snapshot, and nothing after that queries."""

from sqlalchemy import event

from backend.db import engine

from .http_helpers import auth, call_tool, enabled_config, running

BATTERY = [
    ("find_cards", {"query": "gold"}),
    ("get_card", {"card_id": "amex-gold"}),
    ("compare_cards", {"card_ids": ["amex-gold", "chase-sapphire-reserve"]}),
    ("rank_by_category", {"category": "dining"}),
    ("rank_by_category", {"category": "dining", "card_ids": ["amex-gold", "chase-freedom-flex"]}),
    ("estimate_value", {"card_id": "amex-gold"}),
]


def test_every_tool_runs_zero_sql_statements(snapshot):
    config, key = enabled_config()
    statements = []

    def record(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    with running(snapshot, config) as client:
        event.listen(engine, "before_cursor_execute", record)
        try:
            for name, arguments in BATTERY:
                response = client.post("/mcp", json=call_tool(name, arguments), headers=auth(key))
                assert response.status_code == 200
                assert response.json()["result"].get("isError") is not True, name
        finally:
            event.remove(engine, "before_cursor_execute", record)
    assert statements == []
