// Static body content for the prerendered shells.
//
// The app is client-rendered: every prerendered page shipped `<head>` metadata
// and a body of exactly `<div id="root"></div>`, zero characters of readable
// text. Google executes JavaScript so it indexes the real page, but most AI
// crawlers and LLM fetchers do not — asked about this site they could read the
// description tag and nothing else, and reported finding no content at all.
//
// WHAT GOES IN, AND WHAT DOES NOT
//
// In: facts taken from the issuer's own terms. The annual fee, the earn rates,
// the names and advertised ceilings of the credits, the APRs. These are public
// regardless of this site, so publishing them costs nothing.
//
// In: a description of the *method*. That credits are valued at what a typical
// person actually captures rather than at face value, and that points get one
// honest cents-per-point figure. That is the pitch, and it is what lets a
// crawler explain why this site differs.
//
// Out: the analysis itself. `verdict.text`, each credit's `default_value`, the
// tier assignments, `best_cpp`, and the editorial tips and notes. Those are the
// product. A reader who wants the numbers visits the page, which is also the
// only place the credit sliders, Top Picks ranking and comparison exist.
//
// This is not cloaking. Every client receives identical HTML; JavaScript-capable
// ones render more. Nothing sniffs a user agent.
//
// React mounts with createRoot, not hydrateRoot, so it clears the container on
// first render — this content is replaced the instant the bundle runs and never
// reaches a real visitor's eyes. That is also why no hydration mismatch is
// possible.

import { SITE_URL } from "../src/utils/routeMeta.js";

/** Escapes text placed between tags. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escapes a value going inside a double-quoted attribute. `esc` is not enough
 * there: it leaves quotes alone, so a card id containing one would break out of
 * the href. Nothing in the catalog does today and `test_catalog_files.py` keeps
 * ids matching their filenames, but that is a convention rather than a
 * guarantee, and there is no reason for the guarantee to be a convention.
 */
export function escAttr(value) {
  return esc(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * JSON for a <script> block. JSON.stringify escapes what JSON needs but not
 * `</script>`, which ends the element in the HTML tokenizer no matter what JS
 * string it sits inside. Escaping `<` as \u003c is inert in JSON and closes it.
 */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const money = (n) => (n === 0 ? "$0" : `$${Number(n).toLocaleString("en-US")}`);

/**
 * Who built this, in both prose and structured data.
 *
 * Four AI assistants were asked about this site on 2026-08-11. Three answered
 * "no identified founder", "no About the founder page", "does not publicly
 * display individual names". The methodology page has said otherwise for days
 * — but only in React, so only a crawler that executes JavaScript ever saw it.
 * A fourth, which does execute it, read the name correctly and then attached it
 * to a different person of the same name.
 *
 * Both failures are the same missing thing. `sameAs` is the answer to the
 * second one specifically: it is how structured data says *which* Dhruvin Shah,
 * by pointing at a profile that is already an established identity elsewhere.
 */
const AUTHOR = {
  name: "Dhruvin Shah",
  url: "https://www.linkedin.com/in/dhruvinshah1996/",
};

const AUTHOR_JSON_LD = {
  "@type": "Person",
  name: AUTHOR.name,
  url: SITE_URL,
  sameAs: [AUTHOR.url],
};

/** Mirrors the authorship paragraph on /methodology, which until now was React-only. */
const AUTHOR_LINE =
  `<p><strong>Built by one. Made for every wallet.</strong> The Wallet Audit is ` +
  `independently built by <a href="${escAttr(AUTHOR.url)}" rel="author noopener">${esc(AUTHOR.name)}</a>, ` +
  `with every card researched straight from the issuer's own terms and agreements. ` +
  `No hidden team, no paid rankings, no affiliate influence.</p>`;

/** The one-line explanation of what this site does differently. */
const METHOD_LINE =
  "The Wallet Audit values statement credits at what a typical person actually " +
  "captures rather than at their advertised ceiling, and gives each rewards " +
  "currency a single honest cents-per-point figure.";

const VISIT_LINE = (path, what) =>
  `<p>${esc(what)} <a href="${escAttr(SITE_URL + path)}">Open ${esc(SITE_URL + path)}</a>.</p>`;

// Caps on how much of a list the body prints. They exist so one unusual card
// cannot balloon every page, not to hide anything.
const MAX_EARN = 8;
const MAX_CREDITS = 12;

/**
 * A truncated list has to say so. Silently printing 6 of a card's 8 earn rates
 * reads as the complete set — a crawler has no way to tell it was cut, and the
 * credits list sits directly above a stated advertised total, so a quiet cut
 * there is a total that does not add up.
 */
const andMore = (total, shown) =>
  total > shown ? `<li>and ${total - shown} more, on the card's page</li>` : "";

/** Facts only: no default_value, no tier, no verdict, no tips. */
function cardBody(card) {
  const credits = (card.credits ?? []).filter((c) => !c.removed);
  const advertised = credits.reduce((t, c) => t + (c.max_annual ?? 0), 0);
  const rates = card.earn_rates ?? [];
  const earn =
    rates
      .slice(0, MAX_EARN)
      .map((r) => `<li>${esc(r.multiplier)} ${esc(r.category)}</li>`)
      .join("") + andMore(rates.length, MAX_EARN);
  const creditList =
    credits
      .slice(0, MAX_CREDITS)
      .map((c) => `<li>${esc(c.name)}, up to ${esc(money(c.max_annual ?? 0))} a year</li>`)
      .join("") + andMore(credits.length, MAX_CREDITS);

  return `
<h1>${esc(card.name)}</h1>
<p>${esc(card.issuer)}${
    // Amex is both the issuer and the network, so it would otherwise read
    // "American Express &middot; AMERICAN EXPRESS".
    card.network && card.network.toLowerCase() !== card.issuer.toLowerCase()
      ? ` &middot; ${esc(card.network)}`
      : ""
  } &middot; annual fee ${esc(money(card.annual_fee ?? 0))}</p>
<p>${esc(METHOD_LINE)}</p>
${earn ? `<h2>Earn rates</h2><ul>${earn}</ul>` : ""}
${
  creditList
    ? `<h2>Statement credits, at their advertised value</h2>
<ul>${creditList}</ul>
<p>Advertised total ${esc(money(advertised))} a year. This page shows a realistic
estimate for each of these instead, which is usually lower, plus sliders to set
your own figures.</p>`
    : ""
}
${
  // foreign_transaction_fee is a boolean flag, not the rate — the rate lives in
  // foreign_transaction_fee_rate. Interpolating the flag rendered the literal
  // word "true" on all 34 cards that charge one.
  card.foreign_transaction_fee && card.foreign_transaction_fee_rate
    ? `<p>Foreign transaction fee: ${esc(card.foreign_transaction_fee_rate)}</p>`
    : card.foreign_transaction_fee === true
      ? // Flagged as charging one, with no rate authored. No card is in this
        // state today, but saying nothing would drop the fee from the page
        // entirely, which reads as "no fee" — the wrong direction to fail.
        `<p>This card charges a foreign transaction fee.</p>`
      : card.foreign_transaction_fee === false
        ? `<p>No foreign transaction fee.</p>`
        : // null means genuinely unconfirmed, on two Citi cards. Silence is
          // correct there: neither claim would be true.
          ""
}
${card.variable_apr ? `<p>Purchase APR: ${esc(card.variable_apr)}</p>` : ""}
${VISIT_LINE(`/cards/${card.id}`, "The verdict, the realistic credit values, the points valuation and the earn-rate breakdown are on the card's page.")}
`.trim();
}

function issuerBody(slug, label, cards) {
  const list = cards
    .map((c) => `<li><a href="${escAttr(`${SITE_URL}/cards/${c.id}`)}">${esc(c.name)}</a>, annual fee ${esc(money(c.annual_fee ?? 0))}</li>`)
    .join("");
  return `
<h1>${esc(label)} credit cards</h1>
<p>${esc(METHOD_LINE)}</p>
<ul>${list}</ul>
${VISIT_LINE(`/issuer/${slug}`, "Each card's verdict and realistic credit value are on its own page.")}
`.trim();
}

function homeBody(cards, issuers) {
  const list = issuers
    .map((i) => `<li><a href="${escAttr(`${SITE_URL}/issuer/${i.slug}`)}">${esc(i.label)}</a></li>`)
    .join("");
  return `
<h1>The Wallet Audit</h1>
<p>Honest points valuation. ${esc(METHOD_LINE)}</p>
<p>${cards.length} cards across ${issuers.length} issuers, each hand-authored from
the issuer's own cardmember agreement and pricing terms rather than from
aggregators. Rankings are not paid for and carry no affiliate influence.</p>
${AUTHOR_LINE}
<h2>Issuers</h2>
<ul>${list}</ul>
${VISIT_LINE("/top-picks", "Category rankings by real returned value, the side-by-side comparison, and the per-card credit sliders all run in the browser.")}
`.trim();
}

const STATIC_BODIES = {
  "/methodology": `
<h1>How we rate cards</h1>
<p>${esc(METHOD_LINE)}</p>
<h2>Credits are not worth their sticker price</h2>
<p>A card advertising a fee offset by statement credits only works out if you would
have spent that money anyway. Each credit is sorted into one of three tiers,
depending on whether it applies automatically, needs planning, or only pays off
if it happens to fit your life, and carries a realistic estimate alongside its
advertised ceiling.</p>
<h2>Rankings ignore monetization</h2>
<p>There are no paid placements and no affiliate influence on any ranking. A
regression test proves the ranking function cannot read the affiliate flag at
all.</p>
<h2>Cards are sourced from the issuer</h2>
<p>Every card is hand-authored from the issuer's own cardmember agreement and
pricing-and-terms documents, not from aggregators, which during a product
transition are routinely months out of date.</p>
<h2>Who builds this</h2>
${AUTHOR_LINE}
${VISIT_LINE("/methodology", "The tier definitions, the worked arithmetic and the per-card figures are on the site.")}
`.trim(),
  "/compare": `
<h1>Compare credit cards side by side</h1>
<p>${esc(METHOD_LINE)}</p>
<p>Put up to four cards next to each other on the things that decide it: annual
fee, realistic credit value, earn rates, lounge access, insurance and foreign
transaction fees.</p>
${VISIT_LINE("/compare", "The comparison is interactive and runs in the browser.")}
`.trim(),
  "/top-picks": `
<h1>Best credit cards by category</h1>
<p>${esc(METHOD_LINE)}</p>
<p>Cards are ranked by effective value, the earn multiplier multiplied by that
card's best honest cents-per-point figure, rather than by the advertised
multiplier. Six times hotel points at half a cent is worth less than three times
transferable points at two cents.</p>
${VISIT_LINE("/top-picks", "The rankings, and the option to rank against the cards you actually hold, run in the browser.")}
`.trim(),
};

/**
 * JSON-LD. Same split as the prose: identity and issuer-sourced facts only, so
 * a machine reader can say what the page is about without being handed the
 * analysis.
 */
function cardJsonLd(card) {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: card.name,
    url: `${SITE_URL}/cards/${card.id}`,
    category: "Credit card",
    provider: { "@type": "Organization", name: card.issuer },
    // provider is the bank that issues the card. publisher is who wrote the
    // analysis. Conflating them would credit Chase with this site's opinions.
    publisher: AUTHOR_JSON_LD,
    ...(card.annual_fee != null && {
      feesAndCommissionsSpecification: `Annual fee ${money(card.annual_fee)}`,
    }),
  };
}

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "The Wallet Audit",
  url: SITE_URL,
  description:
    "Independent credit card analysis. Statement credits valued at what a typical " +
    "person actually captures, and one honest cents-per-point figure per currency.",
  author: AUTHOR_JSON_LD,
  publisher: AUTHOR_JSON_LD,
};

/**
 * Authorship on every page type, not only the ones that mention it in prose.
 * A crawler that lands on /issuer/chase or /compare should be able to say who
 * publishes this, since "no identified author" was the reported failure and a
 * direct landing is the common case for both.
 */
const pageJsonLd = (type, name, path) => ({
  "@context": "https://schema.org",
  "@type": type,
  name,
  url: `${SITE_URL}${path}`,
  author: AUTHOR_JSON_LD,
  publisher: AUTHOR_JSON_LD,
});

const STATIC_JSON_LD = {
  "/methodology": pageJsonLd("AboutPage", "How we rate cards", "/methodology"),
  "/compare": pageJsonLd("WebPage", "Compare credit cards side by side", "/compare"),
  "/top-picks": pageJsonLd("WebPage", "Best credit cards by category", "/top-picks"),
};

/**
 * Returns `{ body, jsonLd }` for a route, or null when a route has no static
 * content (in which case the shell's empty root is left alone).
 */
export function bodyForRoute(route, { cards, issuers }) {
  const cardMatch = route.path.match(/^\/cards\/(.+)$/);
  if (cardMatch) {
    const card = cards.find((c) => c.id === cardMatch[1]);
    return card ? { body: cardBody(card), jsonLd: cardJsonLd(card) } : null;
  }

  const issuerMatch = route.path.match(/^\/issuer\/(.+)$/);
  if (issuerMatch) {
    const issuer = issuers.find((i) => i.slug === issuerMatch[1]);
    if (!issuer) return null;
    const owned = cards.filter((c) => c.issuer === issuer.issuerField);
    return {
      body: issuerBody(issuer.slug, issuer.label, owned),
      jsonLd: pageJsonLd("CollectionPage", `${issuer.label} credit cards`, `/issuer/${issuer.slug}`),
    };
  }

  if (route.path === "/") return { body: homeBody(cards, issuers), jsonLd: SITE_JSON_LD };

  const staticBody = STATIC_BODIES[route.path];
  if (!staticBody) return null;
  return { body: staticBody, jsonLd: STATIC_JSON_LD[route.path] ?? null };
}

export { METHOD_LINE, AUTHOR };
