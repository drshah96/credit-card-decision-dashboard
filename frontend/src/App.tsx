import { useQuery } from "@tanstack/react-query";
import { Link, Route, Routes } from "react-router-dom";
import { fetchCards } from "./api/cards";
import { CardSummaryCard } from "./components/CardSummaryCard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import CardDetailPage from "./pages/CardDetailPage";

function DashboardPage() {
  const { data: cards, isLoading, isError, error } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        {/* Header */}
        <header style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 11.5,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "var(--faint)",
              marginBottom: 16,
            }}
          >
            The Wallet Audit
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <h1
            style={{
              fontFamily: '"Fraunces Variable", serif',
              fontWeight: 600,
              fontSize: "clamp(34px, 5.6vw, 56px)",
              lineHeight: 1.05,
              margin: "0 0 10px",
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Premium cards aren't about credits.
            <br />
            They're about{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold)" }}>
              what you'll actually use.
            </em>
          </h1>
          <p
            style={{
              color: "var(--muted)",
              maxWidth: 640,
              fontSize: 15.5,
              margin: 0,
            }}
          >
            Pick a card to see every credit, earn rate, and insurance benefit — then drag
            the sliders to what you'll <em>really</em> use. The calculator shows whether
            it offsets the fee.
          </p>
        </header>

        {/* Loading skeletons */}
        {isLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--panel-s)",
                  minHeight: 208,
                  animation: "pulse 1.5s ease-in-out infinite",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(242,112,138,.3)",
              background: "rgba(242,112,138,.08)",
              padding: 24,
              color: "var(--red)",
            }}
          >
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Failed to load cards</p>
            <p style={{ fontSize: 13.5, color: "rgba(242,112,138,.7)", margin: 0 }}>
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Cards grid */}
        {cards && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {cards.map((card) => (
              <Link
                key={card.id}
                to={`/cards/${card.id}`}
                aria-label={`View ${card.name} details`}
                style={{ display: "block", textDecoration: "none" }}
              >
                <CardSummaryCard card={card} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>
    </ErrorBoundary>
  );
}