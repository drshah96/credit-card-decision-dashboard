import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { CompareTray } from "./components/CompareTray";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { ScrollToTop } from "./components/ScrollToTop";
import { SiteMark } from "./components/SiteMark";
// The home page stays in the entry chunk: it's the most common landing
// route, and lazy-loading it would put a chunk fetch between first paint
// and the page every visitor came for. Everything else loads on demand —
// CardDetailPage alone is a quarter of the frontend, and before this every
// home visitor parsed all of it just to see nine issuer tiles (issue #151;
// measured directly as mobile LCP render delay).
import IssuersPage from "./pages/IssuersPage";
import { trackPageView } from "./utils/analytics";

const CardDetailPage = lazy(() => import("./pages/CardDetailPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const IssuerCardsPage = lazy(() => import("./pages/IssuerCardsPage"));
const MethodologyPage = lazy(() => import("./pages/MethodologyPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const TopPickPage = lazy(() => import("./pages/TopPickPage"));

// Occupies real height while a route chunk loads so the flex app-shell
// doesn't collapse <main> and yank the footer up to mid-viewport for a
// frame — the pages' own skeletons take over the moment they mount.
function RouteFallback() {
  return <div style={{ minHeight: "60vh" }} aria-busy="true" />;
}

// Centralized here (rather than per-page) so every route — present and
// future — gets pageview tracking automatically, with no per-page opt-in.
function usePageViewTracking(): void {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
}

export default function App() {
  usePageViewTracking();

  return (
    // Flex column at full viewport height so the footer sits at the bottom on
    // short pages without anything having to pad content to reach it. Each
    // page used to carry its own `minHeight: 100vh`, which pushed the footer
    // down by a full viewport regardless of the header and footer already
    // occupying part of it — that overshoot is what left ~470px of blank
    // space under /compare's empty state. Solving it once here means pages
    // only describe their own content. See issue #147.
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <ScrollToTop />
      <SiteMark />
      {/* Single <main> landmark wrapping every route, so screen-reader users
      can jump straight to page content and the skip link has a target. */}
      <main id="main">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<IssuersPage />} />
              <Route path="/top-picks" element={<TopPickPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/issuer/:issuerSlug" element={<IssuerCardsPage />} />
              <Route path="/cards/:id" element={<CardDetailPage />} />
              <Route path="/methodology" element={<MethodologyPage />} />
              {/* Anything else. Render serves the SPA shell with a 200 for
                  unknown paths, so without this the URL looks like a real page
                  to search engines. NotFoundPage sets noindex. */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <CompareTray />
      <Footer />
    </div>
  );
}