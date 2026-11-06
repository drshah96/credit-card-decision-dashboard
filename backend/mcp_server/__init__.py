"""The MCP server. See ADR 0003 and docs/mcp-server.md."""

from backend.mcp_server.guard import mcp_endpoint

__all__ = ["mcp_endpoint"]
