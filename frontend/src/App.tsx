import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { CompareTray } from "./components/CompareTray";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import CardDetailPage from "./pages/CardDetailPage";
import ComparePage from "./pages/ComparePage";
import IssuerCardsPage from "./pages/IssuerCardsPage";
import IssuersPage from "./pages/IssuersPage";
import { trackPageView } from "./utils/analytics";

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
    <>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<IssuersPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/issuer/:issuerSlug" element={<IssuerCardsPage />} />
          <Route path="/cards/:id" element={<CardDetailPage />} />
        </Routes>
      </ErrorBoundary>
      <CompareTray />
      <Footer />
    </>
  );
}