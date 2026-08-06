// Shared route enumeration for the sitemap and prerender build steps.
// Reads the card catalog straight off disk so both stay in sync with the
// data, and reuses src/utils/routeMeta.js so the titles they emit are the
// exact ones the running app sets.

import { readdir, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allRouteMeta } from "../src/utils/routeMeta.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CARDS_DIR = join(HERE, "..", "..", "backend", "data", "cards");
export const DIST = join(HERE, "..", "dist");
export const PUBLIC = join(HERE, "..", "public");

/** Every card in the catalog, or [] if the backend data isn't on disk. */
export async function loadCards() {
  try {
    await access(CARDS_DIR);
  } catch {
    console.warn(`[routes] ${CARDS_DIR} not found; static routes only`);
    return [];
  }

  const cards = [];
  for (const issuerDir of await readdir(CARDS_DIR, { withFileTypes: true })) {
    if (!issuerDir.isDirectory()) continue;
    const dir = join(CARDS_DIR, issuerDir.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".json")) continue;
      const card = JSON.parse(await readFile(join(dir, file), "utf-8"));
      if (card.id) cards.push(card);
    }
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  return cards;
}

/** @returns {Promise<Array<{path: string, title: string, description: string}>>} */
export async function loadRoutes() {
  return allRouteMeta(await loadCards());
}
