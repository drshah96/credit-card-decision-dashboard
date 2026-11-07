"""The five read-only tools. Each reads only the snapshot, so a call touches no database."""

import difflib
import json
import math
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field

from backend.mcp_server import contract, projections, schemas
from backend.mcp_server.errors import ErrorCode, tool_error
from backend.mcp_server.ranking import CATEGORIES, CATEGORY_KEYS, rank_category
from backend.mcp_server.snapshot import CatalogSnapshot, normalize_search_text
from backend.mcp_server.values import credit_values

CardId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", min_length=1, max_length=64)]
CreditId = Annotated[
    str, Field(pattern=r"^[a-z0-9]+([_-][a-z0-9]+)*$", min_length=1, max_length=64)
]
CategoryKey = Literal[CATEGORY_KEYS]
Issuer = Literal[
    "American Express",
    "Bank of America",
    "Bilt",
    "Capital One",
    "Chase",
    "Citi",
    "Discover",
    "U.S. Bank",
    "Wells Fargo",
]
Section = Literal[projections.SECTIONS]

_ANNOTATIONS = dict(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
_CATEGORY_BY_KEY = {c.key: c for c in CATEGORIES}

RANK_METHOD = schemas.RankMethod(
    formula="Earn multiplier times the card's best realistic cents per point. Percent rates are "
    "used as stated unless pooling boosted them.",
    tie_break="Equal values to 4 decimals go to the lower annual fee, then the name.",
    limitations="Ignores spending caps, activation requirements and sign-up offers.",
)
VALUE_COUNTS = (
    "Statement credits and cash-like perks at the values applied, minus the annual fee. A credit "
    "with no usage given counts as $0, which means no use was assumed, not that it is worthless."
)
VALUE_EXCLUDES = ["points earning", "lounge access", "insurance", "status perks", "sign-up offers"]


class CreditOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credit_id: CreditId
    annual_value: Annotated[int, Field(ge=0, le=100_000)]


def _snapshot(ctx: Context) -> CatalogSnapshot:
    return ctx.request_context.lifespan_context["snapshot"]


def _ok(result: BaseModel) -> CallToolResult:
    structured = result.model_dump(mode="json")
    text = json.dumps(structured, separators=(",", ":"), ensure_ascii=False)
    return CallToolResult(
        content=[TextContent(type="text", text=text)], structured_content=structured
    )


def _unknown_cards_error(snapshot: CatalogSnapshot, unknown: list[str]) -> CallToolResult:
    suggestions = sorted(
        {m for i in unknown for m in difflib.get_close_matches(i, snapshot.cards, n=3, cutoff=0.6)}
    )
    hint = f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
    message = f"No card with id: {', '.join(unknown)}.{hint} Call find_cards to search by name."
    return tool_error(ErrorCode.UNKNOWN_CARD_ID, message)


def _check_card_ids(snapshot: CatalogSnapshot, card_ids: list[str]) -> CallToolResult | None:
    unknown = [i for i in dict.fromkeys(card_ids) if i not in snapshot.cards]
    if unknown:
        return _unknown_cards_error(snapshot, unknown)
    if len(set(card_ids)) != len(card_ids):
        repeated = sorted({i for i in card_ids if card_ids.count(i) > 1})
        message = f"These ids were passed more than once: {', '.join(repeated)}."
        return tool_error(ErrorCode.DUPLICATE_CARD_IDS, message)
    return None


def _effective_cents(value: float) -> float:
    # Raises on a non-finite value, on purpose. js_round would pass it through, and -Infinity is
    # not valid JSON, so a clean tool error is better. test_matcher_input_invariants keeps every
    # committed rate finite.
    return math.floor(value * 10000 + 0.5) / 10000


def _rank_entry(snapshot: CatalogSnapshot, rank: int, entry) -> schemas.RankEntry:
    card = snapshot.cards[entry.card.id]
    return schemas.RankEntry(
        rank=rank,
        card_id=card.id,
        name=card.name,
        issuer=card.issuer,
        annual_fee=card.annual_fee,
        multiplier=entry.multiplier,
        is_percent_rate=entry.is_percent_rate,
        effective_cents_per_dollar=_effective_cents(entry.effective_value),
        best_cpp=entry.card.best_cpp,
        effective_cpp=entry.effective_cpp,
        is_fallback=entry.is_fallback,
        is_pooled=entry.is_pooled,
        provenance=projections.provenance_ref(card, snapshot.verification[card.id]),
    )


def _hidden_twins(inputs) -> list[str]:
    ids = {c.id for c in inputs}
    return sorted(
        c.secured_variant_id for c in inputs if c.secured_variant_id and c.secured_variant_id in ids
    )


def create_server(load_snapshot: Callable[[], CatalogSnapshot]) -> MCPServer:
    @asynccontextmanager
    async def lifespan(_server: MCPServer) -> AsyncIterator[dict[str, CatalogSnapshot]]:
        yield {"snapshot": load_snapshot()}

    server = MCPServer(
        contract.SERVER_NAME,
        title=contract.SERVER_TITLE,
        instructions=contract.INSTRUCTIONS,
        website_url=contract.SITE_URL,
        version=contract.CONTRACT_VERSION,
        lifespan=lifespan,
        log_level="WARNING",
    )

    @server.tool(
        name="find_cards",
        title="Find cards",
        description=(
            "Search the catalog by name, issuer or rewards program and get card ids for the "
            "other tools. Returns at most limit cards plus total_matches and next_offset, so you "
            "can tell when there are more. Omit query to list every card for an issuer."
        ),
        annotations=ToolAnnotations(title="Find cards", **_ANNOTATIONS),
    )
    async def find_cards(
        ctx: Context,
        query: Annotated[
            str | None, Field(min_length=1, max_length=64, pattern=r"^[^\x00-\x1f\x7f]+$")
        ] = None,
        issuer: Issuer | None = None,
        limit: Annotated[int, Field(ge=1, le=20)] = 10,
        offset: Annotated[int, Field(ge=0, le=200)] = 0,
    ) -> Annotated[CallToolResult, schemas.FindCardsResult]:
        snapshot = _snapshot(ctx)
        tokens = normalize_search_text(query).split() if query else []
        # A query of only spaces or trademark signs has nothing to look for, so nothing matches.
        nothing_to_match = query is not None and not tokens
        matches = [
            card_id
            for card_id in snapshot.ids_by_name
            if not nothing_to_match
            and (issuer is None or snapshot.cards[card_id].issuer == issuer)
            and all(token in snapshot.search_text[card_id] for token in tokens)
        ]
        page = matches[offset : offset + limit]
        items = []
        for card_id in page:
            card = snapshot.cards[card_id]
            items.append(
                schemas.CardListItem(
                    card_id=card.id,
                    name=card.name,
                    issuer=card.issuer,
                    network=card.network,
                    points_program=card.points_program,
                    annual_fee=card.annual_fee,
                    verdict_status=card.verdict.status,
                    is_secured_variant_of=card.is_secured_variant_of,
                    provenance=projections.provenance_ref(card, snapshot.verification[card.id]),
                )
            )
        following = offset + limit
        return _ok(
            schemas.FindCardsResult(
                meta=snapshot.meta,
                query=schemas.FindCardsQuery(
                    query=query, issuer=issuer, limit=limit, offset=offset
                ),
                total_matches=len(matches),
                returned=len(items),
                next_offset=following if following < len(matches) else None,
                cards=items,
            )
        )

    @server.tool(
        name="get_card",
        title="Get card",
        description=(
            "One card's fees, rates, credits, earn rates, redemption values, insurance and perks, "
            "with provenance. Heavy sections (credit tips, timeline, transfer partner list, "
            "services, additional cards, removed credits) are omitted unless requested in "
            "sections; omitted_sections lists what was left out. Rate and fee fields are "
            "{status, value}: not_recorded means the catalog has no value, not that the fee is "
            "zero."
        ),
        annotations=ToolAnnotations(title="Get card", **_ANNOTATIONS),
    )
    async def get_card(
        ctx: Context,
        card_id: CardId,
        sections: Annotated[list[Section], Field(max_length=len(projections.SECTIONS))] = [],  # noqa: B006
    ) -> Annotated[CallToolResult, schemas.GetCardResult]:
        snapshot = _snapshot(ctx)
        error = _check_card_ids(snapshot, [card_id])
        if error:
            return error
        card = snapshot.cards[card_id]
        state = snapshot.verification[card_id]
        requested = list(dict.fromkeys(sections))
        return _ok(
            schemas.GetCardResult(
                meta=snapshot.meta,
                query=schemas.GetCardQuery(card_id=card_id, sections=requested),
                card=projections.card_detail(
                    card, snapshot.summaries[card_id].best_cpp, state, set(requested)
                ),
                provenance=projections.full_provenance(card, state),
                omitted_sections=[s for s in projections.SECTIONS if s not in requested],
                withheld=[
                    schemas.WithheldField(field="welcome_bonus", reason=projections.WITHHELD_REASON)
                ],
            )
        )

    @server.tool(
        name="compare_cards",
        title="Compare cards",
        description=(
            "Compare 2 to 4 cards side by side: annual fee, applied and advertised credit "
            "value, earn rates, best cents per point, lounge access, foreign transaction fee, "
            "intro APRs and insurance levels, each with provenance. Cards are returned in the "
            "order given."
        ),
        annotations=ToolAnnotations(title="Compare cards", **_ANNOTATIONS),
    )
    async def compare_cards(
        ctx: Context, card_ids: Annotated[list[CardId], Field(min_length=2, max_length=4)]
    ) -> Annotated[CallToolResult, schemas.CompareResult]:
        snapshot = _snapshot(ctx)
        error = _check_card_ids(snapshot, card_ids)
        if error:
            return error
        return _ok(
            schemas.CompareResult(
                meta=snapshot.meta,
                query=schemas.CompareQuery(card_ids=card_ids),
                cards=[
                    projections.compare_entry(
                        snapshot.cards[i],
                        snapshot.summaries[i].best_cpp,
                        snapshot.cards[i].verdict.short_tag,
                        snapshot.verification[i],
                    )
                    for i in card_ids
                ],
            )
        )

    @server.tool(
        name="rank_by_category",
        title="Rank cards by category",
        description=(
            "Rank cards for a spending category by effective return per dollar: the earn "
            "multiplier times the card's best realistic cents per point (percent rates are used "
            "as stated). With card_ids, ranks only those cards and applies points pooling between "
            "cards that share a points account, as the site's My Cards view does; without it, "
            "ranks the whole catalog with no pooling. Ties go to the lower annual fee, then name. "
            "If fewer than 3 cards have a real bonus, the remaining top slots are filled with "
            "flat-rate cards marked is_fallback. Ignores spending caps, activation requirements "
            "and sign-up offers."
        ),
        annotations=ToolAnnotations(title="Rank cards by category", **_ANNOTATIONS),
    )
    async def rank_by_category(
        ctx: Context,
        category: CategoryKey,
        card_ids: Annotated[list[CardId] | None, Field(min_length=1, max_length=25)] = None,
        limit: Annotated[int, Field(ge=1, le=10)] = 3,
    ) -> Annotated[CallToolResult, schemas.RankResult]:
        snapshot = _snapshot(ctx)
        if card_ids is None:
            inputs = list(snapshot.rank_inputs.values())
            ranked = snapshot.rankings[category]
        else:
            error = _check_card_ids(snapshot, card_ids)
            if error:
                return error
            inputs = [snapshot.rank_inputs[i] for i in card_ids]
            ranked = rank_category(inputs, category, pooling=True)
        info = _CATEGORY_BY_KEY[category]
        entries = [
            _rank_entry(snapshot, position, entry)
            for position, entry in enumerate(ranked[:limit], start=1)
        ]
        return _ok(
            schemas.RankResult(
                meta=snapshot.meta,
                query=schemas.RankQuery(category=category, card_ids=card_ids, limit=limit),
                category=schemas.CategoryInfo(
                    key=info.key,
                    label=info.label,
                    description=info.description,
                    group=info.group,
                ),
                mode="catalog" if card_ids is None else "wallet",
                points_pooling_applied=card_ids is not None,
                total_matching=sum(not e.is_fallback for e in ranked),
                returned=len(entries),
                hidden_as_secured_twins=_hidden_twins(inputs),
                entries=entries,
                method=RANK_METHOD,
            )
        )

    @server.tool(
        name="estimate_value",
        title="Estimate card value",
        description=(
            "A card's statement credits and cash-like perks at your expected annual use, minus "
            "its annual fee. Pass credit_overrides with what you expect to use: without them most "
            "credits count as $0, because the catalog assumes no use, not because they are "
            "worthless. credits_at_zero reports how many. Overrides are clamped to each credit's "
            "advertised maximum and reported. Excludes points earning, lounge access, insurance, "
            "status perks and sign-up offers."
        ),
        annotations=ToolAnnotations(title="Estimate card value", **_ANNOTATIONS),
    )
    async def estimate_value(
        ctx: Context,
        card_id: CardId,
        credit_overrides: Annotated[
            list[CreditOverride] | None, Field(min_length=1, max_length=30)
        ] = None,
    ) -> Annotated[CallToolResult, schemas.EstimateResult]:
        snapshot = _snapshot(ctx)
        error = _check_card_ids(snapshot, [card_id])
        if error:
            return error
        card = snapshot.cards[card_id]
        overrides = credit_overrides or []
        requested_ids = [o.credit_id for o in overrides]
        if len(set(requested_ids)) != len(requested_ids):
            repeated = sorted({i for i in requested_ids if requested_ids.count(i) > 1})
            message = f"These credit ids were passed more than once: {', '.join(repeated)}."
            return tool_error(ErrorCode.DUPLICATE_CREDIT_IDS, message)
        active_ids = [c.id for c in card.credits if not c.removed]
        unknown = [i for i in requested_ids if i not in active_ids]
        if unknown:
            valid = ", ".join(active_ids[:12]) or "none"
            message = f"{card_id} has no active credit: {', '.join(unknown)}. Valid: {valid}."
            return tool_error(ErrorCode.UNKNOWN_CREDIT_ID, message)

        applied, totals = credit_values(card, {o.credit_id: o.annual_value for o in overrides})
        return _ok(
            schemas.EstimateResult(
                meta=snapshot.meta,
                query=schemas.EstimateQuery(
                    card_id=card_id,
                    credit_overrides=[
                        schemas.CreditOverrideEcho(
                            credit_id=o.credit_id, annual_value=o.annual_value
                        )
                        for o in overrides
                    ]
                    if credit_overrides
                    else None,
                ),
                card_id=card_id,
                name=card.name,
                currency=contract.CURRENCY,
                annual_fee=card.annual_fee,
                credits=[
                    schemas.AppliedCreditOut(
                        credit_id=a.credit_id,
                        name=a.name,
                        tier=a.tier,
                        max_annual=a.max_annual,
                        default_value=a.default_value,
                        applied_value=a.applied_value,
                        source=a.source,
                        requested_value=a.requested_value,
                    )
                    for a in applied
                ],
                totals=projections.totals_out(totals),
                counts=VALUE_COUNTS,
                excludes=VALUE_EXCLUDES,
                provenance=projections.full_provenance(card, snapshot.verification[card_id]),
            )
        )

    return server
