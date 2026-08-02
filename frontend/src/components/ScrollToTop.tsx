import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// React Router's client-side navigation doesn't reset scroll position like a
// full page load does — clicking a nav link partway down a page lands on the
// new page still scrolled to wherever the old one left off. Renders nothing;
// just resets scroll on every route change.
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // `behavior: "instant"` overrides the global `scroll-behavior: smooth`
    // (index.css) — a route change should land at the top immediately, not
    // visibly animate-scroll there on every navigation.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
