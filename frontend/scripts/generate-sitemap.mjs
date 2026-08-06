// Emits public/sitemap.xml from the card catalog so search engines are told
// all ~110 URLs exist rather than having to discover them by crawling a
// client-rendered SPA. Runs as a prebuild step; see package.json.
//
// Degrades to the static routes alone if the backend card data isn't on disk
// (a frontend-only build context), rather than failing the build.

import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = join(HERE, "..", "..", "backend", "data", "cards");
const OUT = join(HERE, "..", "public", "sitemap.xml");
const SITE = "https://thewalletaudit.com";

// Mirrors ISSUERS in src/utils/cardTaxonomy.ts. Kept as a literal because
// this is a plain Node script and that module is TypeScript.
const ISSUER_SLUGS = [
  "amex", "chase", "capital-one", "citi",
  "us-bank", "bofa", "bilt", "wells-fargo",
];

const STATIC_ROUTES = ["/", "/top-picks", "/compare", "/methodology"];

async function collectCardIds() {
  try {
    await access(CARDS_DIR);
  } catch {
    console.warn(`[sitemap] ${CARDS_DIR} not found; emitting static routes only`);
    return [];
  }

  const ids = [];
  for (const issuerDir of await readdir(CARDS_DIR, { withFileTypes: true })) {
    if (!issuerDir.isDirectory()) continue;
    const dir = join(CARDS_DIR, issuerDir.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".json")) continue;
      const card = JSON.parse(await readFile(join(dir, file), "utf-8"));
      if (card.id) ids.push(card.id);
    }
  }
  return ids.sort();
}

const cardIds = await collectCardIds();
const urls = [
  ...STATIC_ROUTES,
  ...ISSUER_SLUGS.map((s) => `/issuer/${s}`),
  ...cardIds.map((id) => `/cards/${id}`),
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

await writeFile(OUT, xml, "utf-8");
console.log(
  `[sitemap] wrote ${urls.length} urls (${cardIds.length} cards, ` +
    `${ISSUER_SLUGS.length} issuers, ${STATIC_ROUTES.length} static) -> public/sitemap.xml`,
);
