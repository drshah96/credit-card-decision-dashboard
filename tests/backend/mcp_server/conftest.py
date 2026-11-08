"""Shared fixtures for MCP tests. The snapshot is built once from the seeded test database."""

from contextlib import asynccontextmanager

import pytest
from mcp import Client

from backend.mcp_server.snapshot import build_snapshot
from backend.mcp_server.tools import create_server


@pytest.fixture(scope="session")
def snapshot(_seed_test_database):
    return build_snapshot()


@asynccontextmanager
async def connect(snapshot):
    """A client per test: an async fixture would exit its cancel scope in another task."""
    async with Client(create_server(lambda: snapshot)) as client:
        yield client


def structured(result) -> dict:
    assert result.is_error is not True, result.content
    return result.structured_content


def text_of(result) -> str:
    return result.content[0].text
