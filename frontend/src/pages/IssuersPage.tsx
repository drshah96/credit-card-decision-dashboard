import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchCards } from "../api/cards";
import { ISSUERS } from "../utils/cardTaxonomy";

export default function IssuersPage() {
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
            Pick a bank to see every card it issues — then drill into credits, earn
            rates, and insurance for the one you're deciding on.
          </p>
        </header>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="issuer-grid">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--panel-s)",
                  minHeight: 156,
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

        {/* Issuer tiles */}
        {cards && (
          <div className="issuer-grid">
            {ISSUERS.map((issuer) => {
              const issuerCards = cards.filter((c) => c.issuer === issuer.issuerField);
              const keepCount = issuerCards.filter((c) => c.verdict.status === "keep").length;
              return (
                <Link
                  key={issuer.slug}
                  to={`/issuer/${issuer.slug}`}
                  aria-label={`View ${issuer.label} cards`}
                  className="issuer-tile"
                >
                  <p className="issuer-tile-label">{issuer.label}</p>
                  <p className="issuer-tile-count">
                    {issuerCards.length} {issuerCards.length === 1 ? "card" : "cards"}
                  </p>
                  <p className="issuer-tile-sub">
                    {keepCount > 0
                      ? `${keepCount} rated "keep"`
                      : "See full lineup"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
