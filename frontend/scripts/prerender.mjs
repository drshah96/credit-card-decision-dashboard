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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRoutes, DIST } from "./routes.mjs";
import { SITE_URL } from "../src/utils/routeMeta.js";

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
  const url = `${SITE_URL}${route.path}`;
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
  return out.replace("</head>", `    <link rel="canonical" href="${attr(url)}" />\n  </head>`);
}

const shell = await readFile(join(DIST, "index.html"), "utf-8");
const routes = await loadRoutes();

let written = 0;
for (const route of routes) {
  const html = applyMeta(shell, route);
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

console.log(`[prerender] wrote ${written} route shells with per-route metadata`);
