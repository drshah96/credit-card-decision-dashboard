import { Link, useLocation } from "react-router-dom";
import { useSeo, SITE_NAME } from "../utils/seo";

/**
 * Catch-all for paths matching no route.
 *
 * This is a static site: Render rewrites anything without a matching file to
 * the SPA shell, which is served with HTTP 200. So a URL that doesn't exist
 * still looks like a live page to anything that reads status codes, and before
 * this it also looked like one to Google — the shell carries no canonical, so
 * every unknown URL landed in Search Console as a duplicate with no
 * user-selected canonical.
 *
 * `noindex` is the fix available to a client-rendered app: Google executes the
 * JS, sees the tag, and drops the URL. It does not make the status code
 * honest, and anything that doesn't run JS still sees 200. The real fix is
 * serving a 404, which this project could do because `prerender.mjs` writes a
 * file for every valid route, so the valid-URL set exists on disk. That change
 * belongs in `render.yaml` and needs testing against a preview deploy, because
 * it depends on whether Render resolves a directory index without the explicit
 * rewrites. Until then this is the ceiling.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();

  useSeo({
    title: `Page not found | ${SITE_NAME}`,
    description: "This page doesn't exist. Browse card issuers instead.",
    // No `path`: a canonical would assert this URL is the real home of some
    // content, which is the opposite of what noindex is saying.
    noindex: true,
  });

  return (
    <div className="wrap page-body">
      <h1>Page not found</h1>
      <p style={{ color: "var(--muted)" }}>
        Nothing lives at <code>{pathname}</code>.
      </p>
      <Link to="/" style={{ color: "var(--accent)" }}>
        ← All issuers
      </Link>
    </div>
  );
}
