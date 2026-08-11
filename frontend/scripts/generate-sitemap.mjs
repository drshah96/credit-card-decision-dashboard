// Emits public/sitemap.xml so search engines are told all ~115 URLs exist
// rather than having to discover them by crawling a client-rendered SPA.
// Runs as a prebuild step; see package.json.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRoutes, PUBLIC } from "./routes.mjs";
import { canonicalUrl } from "../src/utils/routeMeta.js";

const routes = await loadRoutes();

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((r) => `  <url><loc>${canonicalUrl(r.path)}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

await writeFile(join(PUBLIC, "sitemap.xml"), xml, "utf-8");
console.log(`[sitemap] wrote ${routes.length} urls -> public/sitemap.xml`);
