// Single source of truth for every route's title and description.
//
// Plain JS on purpose: this is imported both by the React app (via useSeo) and
// by the Node build scripts that emit sitemap.xml and the prerendered per-route
// HTML. If the app and the prerendered <head> disagreed, crawlers and users
// would see different titles for the same URL, so they read from here.

export const SITE_URL = "https://thewalletaudit.com";

/**
 * The freshness claim the footer makes ("offers as of ..."). One place, on
 * purpose: the footer's hand-written copy went stale within a day of the
 * month changing (issue #154). A test fails when this falls more than ~2
 * months behind the clock, turning silent staleness into a red build that
 * demands either a data re-verification or a conscious bump.
 */
export const TERMS_AS_OF = "August 2026";

/**
 * The date the full issuer-by-issuer re-verification last ran, as opposed to
 * TERMS_AS_OF's month-level claim about the offers themselves. Kept separate
 * because the two answer different questions: TERMS_AS_OF is the freshness
 * disclaimer, this is the audit trail. Bump it only when every issuer has
 * actually been re-checked against official sources, not on incidental edits
 * to a single card.
 */
export const LAST_AUDITED = "August 7, 2026";

/**
 * How many cards that audit covered. Hardcoded because the Footer renders in
 * the app shell with no card data in scope, and fetching the catalogue just to
 * print a number in a disclaimer isn't worth a network dependency. A test
 * counts the card JSON files and fails if this drifts, so adding a card turns
 * the build red rather than quietly making the footer lie.
 */
export const CARDS_AUDITED = 109;
export const SITE_NAME = "The Wallet Audit";

/** Mirrors ISSUERS in cardTaxonomy.ts (slug + display label only). */
export const SEO_ISSUERS = [
  { slug: "amex", label: "American Express" },
  { slug: "chase", label: "Chase" },
  { slug: "capital-one", label: "Capital One" },
  { slug: "citi", label: "Citi" },
  { slug: "us-bank", label: "U.S. Bank" },
  { slug: "bofa", label: "Bank of America" },
  { slug: "bilt", label: "Bilt" },
  { slug: "wells-fargo", label: "Wells Fargo" },
  { slug: "discover", label: "Discover" },
];

/** @param {string} specific */
export function pageTitle(specific) {
  return `${specific} | ${SITE_NAME}`;
}

/**
 * @typedef {{ path: string, title: string, description: string }} RouteMeta
 */

/** @type {RouteMeta[]} */
export const STATIC_ROUTE_META = [
  {
    path: "/",
    title: "The Wallet Audit: Credit Cards Rated on Real Value",
    description:
      "Compare premium credit cards on what they are actually worth: annual fees against real statement-credit value, honest points valuations, and no marketing hype.",
  },
  {
    path: "/top-picks",
    title: pageTitle("Best Credit Cards by Category"),
    description:
      "The cards worth carrying, ranked by what they return rather than what they advertise. Filter by travel, dining, groceries, cash back and everyday spend.",
  },
  {
    path: "/compare",
    title: pageTitle("Compare Credit Cards Side by Side"),
    description:
      "Put up to four cards next to each other and compare the things that decide it: annual fee, real credit value, earn rates, lounge access, insurance and foreign transaction fees.",
  },
  {
    path: "/methodology",
    title: pageTitle("How We Rank Cards"),
    description:
      "The method behind the ratings: how statement credits are valued, where points valuations come from, and why a card's advertised perks are not the same as real value.",
  },
];

/**
 * Total advertised credit value, ignoring credits the issuer has discontinued.
 * @param {{ credits?: Array<{ max_annual: number, removed?: boolean }> }} card
 */
export function maxCreditValue(card) {
  return (card.credits ?? [])
    .filter((c) => !c.removed)
    .reduce((sum, c) => sum + c.max_annual, 0);
}

/**
 * @param {{ id: string, name: string, issuer: string, annual_fee: number,
 *           credits?: Array<{ max_annual: number, removed?: boolean }> }} card
 * @returns {RouteMeta}
 */
export function cardRouteMeta(card) {
  return {
    path: `/cards/${card.id}`,
    // Leads with the card name because that's the search term. The issuer is
    // parenthesised rather than set off with a dash: these titles are what
    // link previews and search results show, and the site's copy avoids
    // dashes throughout.
    title: pageTitle(`${card.name} (${card.issuer})`),
    description: `${card.name} has a $${card.annual_fee} annual fee and up to $${maxCreditValue(card)} in statement credits. See what those credits are really worth, how the points redeem, and whether the fee pays for itself.`,
  };
}

/**
 * @param {string} slug
 * @param {string} label
 * @returns {RouteMeta}
 */
export function issuerRouteMeta(slug, label) {
  return {
    path: `/issuer/${slug}`,
    title: pageTitle(`${label} Credit Cards`),
    description: `Every ${label} card compared on real value: annual fees, what the statement credits are actually worth, points valuations, and which cards earn their keep.`,
  };
}

/**
 * Every route the site can serve, for the sitemap and the prerender pass.
 * @param {Array<Parameters<typeof cardRouteMeta>[0]>} cards
 * @returns {RouteMeta[]}
 */
/**
 * A route path as the URL we publish for it: canonical tag, og:url and
 * sitemap entry all go through here.
 *
 * Every one ends in a slash, because that is the form Render serves directly.
 * A directory's index.html is only served for a path that ends in a slash, so
 * `/cards/x` has to be routed somewhere, and the rule that used to do it —
 * rewriting `/cards/:id` to `/cards/:id/index.html` — also matched ids with no
 * file behind them. Render answers a rewrite onto a missing file with 200 and
 * an empty body rather than a 404 or a fall-through, so a mistyped card link
 * rendered a blank page.
 *
 * `/cards/x` now redirects to `/cards/x/`, which means an unknown id redirects
 * to a path that matches nothing and reaches the catch-all, which serves the
 * app. The app already handles it: CardDetailPage reads the API's 404, sets
 * noindex and renders "Card not found".
 *
 * The slash is applied to every route rather than only the redirected ones. A
 * single rule ("published URLs end in a slash") is easier to keep true than a
 * per-route exception list, and `tests/utils/routeMeta.test.ts` pins it.
 */
export function canonicalUrl(path) {
  return path === "/" ? SITE_URL + "/" : `${SITE_URL}${path}/`;
}

export function allRouteMeta(cards) {
  return [
    ...STATIC_ROUTE_META,
    ...SEO_ISSUERS.map((i) => issuerRouteMeta(i.slug, i.label)),
    ...cards.map(cardRouteMeta),
  ];
}
