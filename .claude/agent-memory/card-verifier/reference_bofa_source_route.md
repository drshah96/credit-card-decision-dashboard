---
name: bofa-source-route
description: BofA per-card product pages serve a "temporarily unavailable" body with HTTP 200; the card index and the public sample agreements are the working sources
metadata:
  type: reference
---

**Per-card product pages under `/credit-cards/products/{slug}/` return HTTP 200
with BofA's "this page is temporarily unavailable" body.** The fetch succeeds, so
check for that sentence before concluding a field is undocumented. As of
2026-09-05 this hit the BankAmericard page, which is also that card's stored
`official_url`.

**The working substitute is the top-level `/credit-cards/` index**, which renders
every card's offer text including footnote copy. Ask the fetch prompt explicitly
for footnotes: a generic prompt returned only the purchases half of an intro offer
and silently dropped the balance-transfer half.

**Sample cardmember agreements are public** at `/credit-cards/credit-card-agreements/`,
one PDF per card, pattern `/content/documents/creditcard/{card_name}_english.pdf`.
WebFetch cannot parse them but saves them and prints the path; read that with the
Read tool. The pricing table is on pages 2 to 3.

**The agreement is an "Example" and its APR range differs from the advertised
go-to APR.** On BankAmericard the index said 14.99% to 25.99% while the agreement
said 13.99% to 26.99%. Take APR ranges from the index or product page, and take
fees and the penalty APR from the agreement. The agreement's only date is a Prime
Rate snapshot, which is not an effective date and cannot date a change.

**BofA splits cash advances into two APR tiers.** The catalog stores the Bank Cash
Advance tier.

**The agreement is network-agnostic** ("converted by Visa International or
Mastercard International, depending on which card is associated with this
account"), so it never confirms a `network` value.

**Telling a blocked page from a dead slug:** a real BofA card whose page is blocked
returns HTTP 200 with the "temporarily unavailable" body; a genuinely wrong slug
returns HTTP 404. The cash-back and compare hubs are blocked the same way, and
`/credit-cards/compare-credit-cards/` returns unrendered Handlebars placeholders.

**Secured twins have their own agreement PDF**, at `..._secured_english.pdf`, and
they are not a copy of the unsecured one. On 2026-09-05 the Unlimited Cash Rewards
Secured agreement showed a single 27.49% APR with no range, a flat 5% balance
transfer fee and **no intro APR row at all**, against a stored 17.49-27.49%, a
3%-then-5% fee and 0% for 15 months. So the catalog's hide-the-secured-twin
assumption is safe on **earn rates** and is not safe on APRs, fees or intro terms.
Always fetch both PDFs rather than reasoning from the unsecured one.

**The hub and the agreement disagree, and BofA disclaims the agreements as
"samples only".** Prefer the hub for offer terms (intro APR length, intro balance
transfer fee, welcome bonus, earn rates) and the agreement for the fee schedule and
penalty terms, then report the divergence rather than picking a winner. The
offer-specific Pricing and Terms that would break the tie sits behind the
application flow, and `/credit-cards/terms-and-conditions/?campaignid=...` 404s.

**Per-card benefit documents are unreachable.** `/credit-cards/credit-card-benefits/`
404s and no eligible-card list exists anywhere fetchable, so BofA `insurance[]`
entries stay unverified and absence never proves a card lacks a coverage.
