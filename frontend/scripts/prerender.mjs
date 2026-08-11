// Writes a real HTML file per route into dist/, each carrying that route's own
// <title>, description and OpenGraph tags.
//
// Why this exists: LinkedIn, Twitter/X, Facebook, Slack and iMessage fetch a
// URL's raw HTML and never execute JavaScript. useSeo() sets the right tags at
// runtime, which is enough for Google (it renders JS) but invisible to those
// crawlers — so every shared card link previewed as the generic site title,
// with og:url pointing at the homepage.
//
// This is deliberately NOT server-side rendering: only the <head> differs per
// route. The <body> is byte-identical to the SPA shell, so React boots and
// takes over exactly as before. That avoids a headless browser in the build
// and keeps hydration a non-issue.
//
// Render serves these because "Render does not apply redirect or rewrite rules
// to a path if a resource exists at that path" — so the catch-all
// /* -> /index.html rewrite in render.yaml only handles paths without a file,
// which is still every unknown URL.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRoutes, loadCards, DIST } from "./routes.mjs";
import { canonicalUrl } from "../src/utils/routeMeta.js";
import { ISSUERS } from "../src/utils/cardTaxonomy.ts";
import { bodyForRoute, jsonForScript } from "./crawlableBody.mjs";

/** Escapes a string for use inside a double-quoted HTML attribute. */
function attr(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes text placed between tags (only <title> here). */
function text(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Swaps the per-route tags in the built shell. Replacements are anchored to the
 * exact tags index.html ships, and every one is asserted to have matched, so a
 * future edit to index.html fails the build loudly instead of silently
 * emitting pages with the wrong metadata.
 */
function applyMeta(html, route) {
  const url = canonicalUrl(route.path);
  /** @type {Array<[RegExp, string, string]>} */
  const swaps = [
    [/<title>[\s\S]*?<\/title>/, `<title>${text(route.title)}</title>`, "<title>"],
    [
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${attr(route.description)}" />`,
      'meta[name=description]',
    ],
    [
      /<meta\s+property="og:url"[^>]*\/>/,
      `<meta property="og:url" content="${attr(url)}" />`,
      "og:url",
    ],
    [
      /<meta\s+property="og:title"[^>]*\/>/,
      `<meta property="og:title" content="${attr(route.title)}" />`,
      "og:title",
    ],
    [
      /<meta\s+property="og:description"[\s\S]*?\/>/,
      `<meta property="og:description" content="${attr(route.description)}" />`,
      "og:description",
    ],
    [
      /<meta\s+name="twitter:title"[^>]*\/>/,
      `<meta name="twitter:title" content="${attr(route.title)}" />`,
      "twitter:title",
    ],
    [
      /<meta\s+name="twitter:description"[\s\S]*?\/>/,
      `<meta name="twitter:description" content="${attr(route.description)}" />`,
      "twitter:description",
    ],
  ];

  let out = html;
  for (const [pattern, replacement, label] of swaps) {
    if (!pattern.test(out)) {
      throw new Error(
        `[prerender] no ${label} tag found in dist/index.html — the shell changed shape, ` +
          `so prerendered pages would ship wrong metadata. Update scripts/prerender.mjs.`,
      );
    }
    out = out.replace(pattern, replacement);
  }

  // Canonical isn't in the shell (useSeo creates it at runtime), so append it.
  out = out.replace("</head>", `    <link rel="canonical" href="${attr(url)}" />\n  </head>`);
  // Preload the two fonts the first paint actually renders in: the LCP
  // element is body text (Space Grotesk) under a Fraunces H1. Without this
  // the browser only discovers the woff2 files after CSS parses, so the
  // text paints in a fallback and reflows when the swap lands. Only the
  // latin subsets — preloading all unicode ranges would push ~10 files.
  // crossorigin is required even same-origin: fonts fetch in CORS mode, and
  // a preload whose mode mismatches is silently wasted (double download).
  return out.replace(
    "</head>",
    fontPreloadTags.map((h) => `    ${h}`).join("\n") + "\n  </head>",
  );
}

// Resolve the hashed filenames of the two first-paint fonts from the built
// output. Hard failure if either is missing: a rename inside the fontsource
// packages would otherwise silently ship dead preloads on every page.
const assetFiles = await readdir(join(DIST, "assets"));
const fontPreloadTags = [];
for (const stem of ["space-grotesk-latin-wght-normal", "fraunces-latin-standard-normal"]) {
  const file = assetFiles.find((f) => f.startsWith(stem) && f.endsWith(".woff2"));
  if (!file) {
    throw new Error(`[prerender] expected ${stem}*.woff2 in dist/assets — font packaging changed`);
  }
  fontPreloadTags.push(
    `<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin />`,
  );
}

const shell = await readFile(join(DIST, "index.html"), "utf-8");
const routes = await loadRoutes();
const cards = await loadCards();

// The empty root the shell ships. Every page previously served exactly this and
// nothing else to a client that does not run JavaScript.
const EMPTY_ROOT = '<div id="root"></div>';
if (!shell.includes(EMPTY_ROOT)) {
  throw new Error(
    `[prerender] expected ${EMPTY_ROOT} in dist/index.html — the mount point changed ` +
      "shape, so the crawlable body has nowhere to go. Update this or the body silently " +
      "stops being written while every page still builds.",
  );
}

let written = 0;
let withBody = 0;
for (const route of routes) {
  let html = applyMeta(shell, route);

  // Static content for clients that never run the bundle. React mounts with
  // createRoot, which clears the container, so this never reaches a real
  // visitor — see crawlableBody.mjs for what is deliberately left out.
  const content = bodyForRoute(route, { cards, issuers: ISSUERS });
  if (content) {
    const ld = content.jsonLd
      ? `\n    <script type="application/ld+json">${jsonForScript(content.jsonLd)}</script>`
      : "";
    html = html.replace(EMPTY_ROOT, `<div id="root">${content.body}</div>${ld}`);
    withBody += 1;
  }
  if (route.path === "/") {
    // The root shell itself, so a bare visit and a crawler agree.
    await writeFile(join(DIST, "index.html"), html, "utf-8");
  } else {
    const dir = join(DIST, route.path.slice(1));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf-8");
  }
  written += 1;
}

console.log(
  `[prerender] wrote ${written} route shells with per-route metadata, ` +
    `${withBody} with crawlable body content`,
);
