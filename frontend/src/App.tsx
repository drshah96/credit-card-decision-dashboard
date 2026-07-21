import { Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import CardDetailPage from "./pages/CardDetailPage";
import ComparePage from "./pages/ComparePage";
import IssuerCardsPage from "./pages/IssuerCardsPage";
import IssuersPage from "./pages/IssuersPage";

export default function App() {
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
      <Footer />
    </>
  );
}