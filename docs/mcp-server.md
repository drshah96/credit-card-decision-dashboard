# The Wallet Audit MCP server

Data on US consumer credit cards, sourced from issuer terms, for AI agents. Every card says when
it was last checked and what that check couldn't confirm. It uses the Model Context Protocol
over Streamable HTTP.

- **Endpoint:** `POST https://mcp.thewalletaudit.com/mcp`
- **Auth:** none needed. Requests without a key share one rate limit. For a limit of your
  own, send `Authorization: Bearer <key>`. Keys are issued by hand: to request one, message
  [Dhruvin Shah on LinkedIn](https://www.linkedin.com/in/dhruvinshah1996/). Never put a key in a
  URL: it is not read there, and URLs can be recorded by proxies and hosting logs.
- **Contract version:** see `meta.contract_version` on any response.

This is informational data, not financial advice. Confirm current terms with the issuer
before applying.

## Connect

**Claude (desktop, web or mobile):** open Settings, then Connectors, then Add custom
connector. Name it The Wallet Audit, enter `https://mcp.thewalletaudit.com/mcp` as the URL,
and leave the OAuth fields empty. No key or sign-in is needed.

**With a key, in Claude Code:**

```bash
claude mcp add --transport http thewalletaudit https://mcp.thewalletaudit.com/mcp \
  --header "Authorization: Bearer ${TWA_MCP_KEY}"
```

Or in `.mcp.json`. Set a long timeout, because the first request after a deploy can take up to
a minute:

```json
{
  "mcpServers": {
    "thewalletaudit": {
      "type": "http",
      "url": "https://mcp.thewalletaudit.com/mcp",
      "headers": { "Authorization": "Bearer ${TWA_MCP_KEY}" },
      "timeout": 120000
    }
  }
}
```

**With a key, in Claude Desktop's config file:** use the third-party `mcp-remote` bridge, and
keep spaces out of `args`:

```json
{
  "mcpServers": {
    "thewalletaudit": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.thewalletaudit.com/mcp", "--header", "Authorization:${TWA_AUTH}"],
      "env": { "TWA_AUTH": "Bearer twa_your_key" }
    }
  }
}
```

**Any other client:** use any Streamable HTTP client that allows a request timeout of about
120 seconds. Browser origins are refused.

## Tools

All five are read-only and cost no database queries.

| Tool | Use it to |
|---|---|
| `find_cards` | Search by name, issuer or program and get card ids, best match first. Start here. |
| `get_card` | Read one card's fees, rates, credits, earn rates, insurance, lounge access and perks. |
| `compare_cards` | Compare 2 to 4 cards side by side. |
| `rank_by_category` | Rank cards for one of 19 spending categories, across the catalog or a wallet. |
| `estimate_value` | Work out credits minus fee, using your expected use of each credit. |

## Reading the answers

**Provenance.** Every card says how far to trust it:

| `verification_status` | Meaning |
|---|---|
| `verified` | Checked against issuer documents, with no gaps recorded. This does not prove every field was confirmed. |
| `partially_verified` | Checked, but `not_checked` lists areas that check could not confirm. Treat values there as unconfirmed. |
| `not_verified` | No recorded check. |

- `verified_on` is the date of the last check, and `note` says what it was checked against.
- `review_due_on` is the date to stop relying on that check: 180 days after it, or sooner when
  a term in the card's own data ends or changes first, such as a quarterly category.
- `review_overdue` is true once today, in UTC, is past `review_due_on`. Treat that card's values
  as unconfirmed until it is checked again.
- `evidence_url` links the public record of the check, a commit or pull request.
- `evidence_scope` is `card` when that record covers the card itself. `issuer_pass` means an
  issuer-level pass covered it, and the record may not mention the card individually.
- `issuer_url` is where to find current terms. It is not proof of what was verified.

**Missing values.** Rate and fee fields are `{status, value}`. `not_recorded` means the catalog
has no value, not that the fee is zero. `recorded` means the catalog holds a value, not that it
was checked, so read it with the card's provenance. A recorded `foreign_transaction_fee: false`
means the catalog records no fee. Treat it as unconfirmed when the card is `not_verified` or
`not_checked` lists `rates_and_fees`.

**Insurance.** `unconfirmed` means the catalog cannot say whether the card has that coverage.
`none` is only used when the check covered insurance and the record states the coverage is
absent. An empty `insurance` list means nothing is recorded.

**Lounge access.** `get_card` and `compare_cards` return `lounge_access`, for airport lounges only.
`included` means access comes with the card, with any visit caps and guest rules in `status_perks`.
`passes` means a few single-visit passes a year, and `paid` means entry only by paying per visit.
`none` is only used when a check covered perks. `unconfirmed` means the catalog cannot say.

**Whether a card can be got and spent.**

- `open_to_new_applicants` is `false` once the issuer stops taking applications. Existing
  cardholders keep the card. `find_cards`, `get_card` and `compare_cards` return it.
- `points.redeemable` in `get_card`, and `rewards_redeemable` in `compare_cards`, is
  `store_only` when the rewards can only be spent at the card's own store, such as Kohl's Cash
  or Wayfair Reward Dollars. The card's cents per point is then real only to someone who shops
  there. Otherwise it is `anywhere`.

**Credit values.** Most credits have a default of $0, which means no use is assumed, not that
the credit is worthless. Pass `credit_overrides` to `estimate_value` with real expected use,
and read `credits_at_zero` to see how many credits are still counted at $0.

**Editorial content.** Verdicts and credit tiers are The Wallet Audit's own opinions, not issuer
terms. The `welcome_bonus` field is not served, because offers change faster than the catalog is
re-verified.

## Rankings

`rank_by_category` ranks by the earn multiplier times the card's best realistic cents per point.
A percent rate, such as 2% cash back, is used as stated. That is the card's best outcome, not a
guarantee that every dollar redeems at that rate. Ties go to the lower annual fee, then the name.
Rankings never read affiliate status.

**Whole catalog or a wallet.** Without `card_ids`, the server ranks the whole catalog and returns
`mode: "catalog"`. With `card_ids`, it ranks only those cards, as cards someone holds, returns
`mode: "wallet"`, and applies points pooling between cards that share a points account
(`points_pooling_applied: true`).

**What counts toward a category.** A rate counts only if most purchases in that category earn it.

- A rate limited to one merchant, one brand, online orders or certain hours, such as Bilt
  partner restaurants, Citi Nights or Amazon, doesn't count. The card's everyday rate competes
  instead.
- Travel and entertainment portal rates count, since anything can be booked that way.
- A choose-your-category rate counts in each category it offers, though a cardholder picks only
  one or two.
- In `wholesale`, a single club's rate counts, since most people belong to one.
- `utilities` covers electric, gas and water bills only. `phone-internet` covers phone plans,
  internet and cable.

**Counted only in a wallet.** These count only when `card_ids` are given, because only someone who
already holds the card can use them:

- a rotating quarterly category, which needs activation every quarter
- a card with `open_to_new_applicants: false`
- a card whose rewards are `store_only`, except a store-only club card in `wholesale`

**Fallback slots.** If fewer than three cards have a real bonus in a category, the remaining top
slots go to flat-rate cards marked `is_fallback`. `total_matching` counts only the cards with a
real bonus.

Rankings don't account for spending caps, activation requirements or sign-up offers.

## Limits and errors

| Limit | Value |
|---|---|
| Requests without a key, shared by everyone | 120 per minute, 5,000 per day |
| Requests per key | 60 per minute, 2,000 per day |
| Concurrent requests per server | 8 |
| Request body | 32 KB |
| Time per request | 10 seconds, after the server is awake |

The default limits can be changed per key.

| Status | Meaning | What to do |
|---|---|---|
| 401 | A key was sent but isn't valid | Fix the key, or send no `Authorization` header to use the shared limit. |
| 404 | Wrong path | The endpoint is `/mcp`, without a trailing slash. |
| 405 | Not a POST | The endpoint accepts POST only. |
| 408, 413 | Body too slow or too large | Send a smaller request. |
| 421 | Wrong hostname | Use `mcp.thewalletaudit.com`. |
| 429 | Over a rate limit, or too many failed key attempts | Wait for `Retry-After`. |
| 500, 504 | Server fault, or the request ran out of time | Retry once, then report it. |
| 503 | Busy or unavailable | Wait for `Retry-After`, then retry. |

Errors the model can fix come back as tool results with `isError: true`, starting with a code
such as `[unknown_card_id]`, and include suggestions where possible.

Unknown argument names are ignored by the protocol library. Every answer echoes what applied
under `query`, so check it if a misspelled option seems to have no effect.

## Availability and changes

The server runs on a free hosting tier with no uptime guarantee. A keep-warm job pings it around
the clock, so it normally answers at once. The first request after a deploy or restart can take
up to a minute.

Every change to what the tools return moves `meta.contract_version`. New tools, optional inputs
and output fields, and corrections to how rankings or categories work, come in minor versions,
and the methodology above is updated with them. Removing or renaming a tool, input or field ships
as new tool names, with the old ones kept for 90 days, and key holders with a contact on file are
told in advance.
