"""Tool-level errors, returned as results so the model can read and act on them."""

from enum import StrEnum

from mcp.types import CallToolResult, TextContent

MAX_ERROR_CHARS = 400


class ErrorCode(StrEnum):
    UNKNOWN_CARD_ID = "unknown_card_id"
    UNKNOWN_CREDIT_ID = "unknown_credit_id"
    DUPLICATE_CARD_IDS = "duplicate_card_ids"
    DUPLICATE_CREDIT_IDS = "duplicate_credit_ids"


def tool_error(code: ErrorCode, message: str) -> CallToolResult:
    text = f"[{code.value}] {message}"[:MAX_ERROR_CHARS]
    return CallToolResult(is_error=True, content=[TextContent(type="text", text=text)])
