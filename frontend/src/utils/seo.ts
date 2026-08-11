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
  /**
   * True on a not-found state: an unknown card id, an unknown issuer slug, or
   * a path matching no route. Adds `<meta name="robots" content="noindex">`.
   *
   * Unlike every other field here this is **reconciled on every run, not
   * skipped when falsy**. The skip-when-undefined rule exists so a page can
   * set tags before its data loads; applied to this field it would be a bug,
   * because a `noindex` left over from a 404 would follow the user into the
   * next route and deindex a page that should rank. Absent means absent.
   */
  noindex?: boolean;
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
 * Owns the robots tag outright: sets it when `on`, removes it otherwise.
 *
 * Nothing else ships one — not `index.html`, not the prerender pass — so this
 * is the only writer and it is safe to remove any tag it finds.
 * `tests/utils/seo.test.tsx` pins that assumption, so if a robots tag is ever
 * added to the shell, the test fails rather than this silently deleting it.
 */
function setRobots(on: boolean) {
  const el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!on) {
    el?.remove();
    return;
  }
  if (el) {
    el.setAttribute("content", "noindex");
    return;
  }
  const created = document.createElement("meta");
  created.setAttribute("name", "robots");
  created.setAttribute("content", "noindex");
  document.head.appendChild(created);
}

/**
 * Points the document's title, description, canonical URL and social tags at
 * the current route. Values are left untouched while undefined, so a page can
 * call this before its data has loaded without clobbering the previous route's
 * tags with empty strings. `noindex` is the exception — see its doc comment.
 */
export function useSeo({ title, description, path, noindex }: SeoInput): void {
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
    setRobots(Boolean(noindex));
  }, [title, description, path, noindex]);
}
