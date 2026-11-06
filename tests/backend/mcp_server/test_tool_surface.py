"""The published surface cannot change without a visible version entry."""

import hashlib
import json
import os
from pathlib import Path

import pytest

from backend.mcp_server import contract
from backend.mcp_server.tools import create_server

from .conftest import connect

SURFACE_PATH = Path(__file__).parent / "snapshots" / "tool_surface.json"
ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


async def _surface(snapshot) -> dict:
    async with connect(snapshot) as client:
        tools = (await client.list_tools()).tools
    return {
        "server": {
            "name": contract.SERVER_NAME,
            "title": contract.SERVER_TITLE,
            "version": contract.CONTRACT_VERSION,
            "instructions": contract.INSTRUCTIONS,
            "website_url": contract.SITE_URL,
        },
        "tools": [t.model_dump(mode="json", by_alias=True, exclude_none=True) for t in tools],
    }


def _digest(surface: dict) -> str:
    canonical = json.dumps(surface, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def test_update_mode_writes_the_snapshot_and_refuses_ci(snapshot):
    if not os.environ.get("UPDATE_MCP_SURFACE"):
        pytest.skip("only runs in update mode")
    assert not os.environ.get("CI"), "the surface is regenerated locally, never in CI"
    surface = await _surface(snapshot)
    SURFACE_PATH.parent.mkdir(exist_ok=True)
    SURFACE_PATH.write_text(json.dumps(surface, indent=1, ensure_ascii=False) + "\n")
    print(f"\nsurface digest for {contract.CONTRACT_VERSION}: {_digest(surface)}")


async def test_live_surface_equals_the_snapshot(snapshot):
    assert await _surface(snapshot) == json.loads(SURFACE_PATH.read_text()), (
        "The published contract changed. Update it with UPDATE_MCP_SURFACE=1, bump "
        "CONTRACT_VERSION and add the digest to PUBLISHED_SURFACES. New tools, optional inputs "
        "and output fields are minor; removing, renaming, tightening or changing a meaning is "
        "major and ships as new tool names."
    )


async def test_live_surface_matches_its_published_digest(snapshot):
    published = contract.PUBLISHED_SURFACES[contract.CONTRACT_VERSION]
    assert _digest(await _surface(snapshot)) == published


def _walk(schema, path="$"):
    if isinstance(schema, dict):
        yield path, schema
        for key, value in schema.items():
            yield from _walk(value, f"{path}.{key}")
    elif isinstance(schema, list):
        for index, value in enumerate(schema):
            yield from _walk(value, f"{path}[{index}]")


async def test_every_input_is_bounded(snapshot):
    surface = await _surface(snapshot)
    for tool in surface["tools"]:
        for path, node in _walk(tool["inputSchema"]):
            kind = node.get("type")
            if kind == "string":
                assert "maxLength" in node or "enum" in node, f"{tool['name']} {path}"
            elif kind == "array":
                assert "maxItems" in node, f"{tool['name']} {path}"
            elif kind == "integer":
                assert "minimum" in node and "maximum" in node, f"{tool['name']} {path}"


async def test_every_tool_declares_its_annotations_and_output_schema(snapshot):
    surface = await _surface(snapshot)
    assert [t["name"] for t in surface["tools"]] == [
        "find_cards",
        "get_card",
        "compare_cards",
        "rank_by_category",
        "estimate_value",
    ]
    for tool in surface["tools"]:
        for hint, value in ANNOTATIONS.items():
            assert tool["annotations"][hint] is value, tool["name"]
        assert tool["outputSchema"]


async def test_no_cents_names_and_no_em_dashes_anywhere(snapshot):
    surface = await _surface(snapshot)
    text = json.dumps(surface, ensure_ascii=False)
    assert "—" not in text
    for tool in surface["tools"]:
        for _, node in _walk(tool["outputSchema"]):
            for name in node.get("properties", {}):
                assert not name.endswith("_cents"), name


def test_issuer_literal_matches_the_catalog_both_ways(snapshot):
    from typing import get_args

    from backend.mcp_server.tools import Issuer

    assert set(get_args(Issuer)) == {c.issuer for c in snapshot.cards.values()}


def test_server_can_be_built_repeatedly(snapshot):
    assert create_server(lambda: snapshot) is not create_server(lambda: snapshot)
