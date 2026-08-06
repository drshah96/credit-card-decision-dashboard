import { useEffect } from "react";

// Every route shipped the same <title> and description from index.html, so
// all 103 card pages looked like near-duplicates to search engines. Google
// was already rendering the JS (it built its own titles for /compare and the
// issuer pages out of on-page headings), it just had nothing distinct to work
// with. Setting these per route imperatively is enough: it needs no SSR and
// no extra dependency, unlike react-helmet.

// Titles and descriptions live in routeMeta.js, shared with the Node build
// scripts, so the prerendered <head> and the client-set one can't disagree.
export {
  SITE_URL,
  SITE_NAME,
  pageTitle,
  cardRouteMeta,
  issuerRouteMeta,
  STATIC_ROUTE_META,
} from "./routeMeta.js";
import { SITE_URL as SITE } from "./routeMeta.js";

export type SeoInput = {
  /** Full document title. Skipped while a page is still loading its data. */
  title?: string;
  description?: string;
  /** Route path such as "/cards/amex-platinum"; becomes canonical + og:url. */
  path?: string;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Points the document's title, description, canonical URL and social tags at
 * the current route. Values are left untouched while undefined, so a page can
 * call this before its data has loaded without clobbering the previous route's
 * tags with empty strings.
 */
export function useSeo({ title, description, path }: SeoInput): void {
  useEffect(() => {
    if (title) {
      document.title = title;
      upsertMeta("property", "og:title", title);
      upsertMeta("name", "twitter:title", title);
    }
    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    }
    if (path) {
      const url = `${SITE}${path}`;
      upsertCanonical(url);
      upsertMeta("property", "og:url", url);
    }
  }, [title, description, path]);
}
