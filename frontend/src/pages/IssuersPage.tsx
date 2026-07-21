import { Link } from "react-router-dom";
import { ISSUERS } from "../utils/cardTaxonomy";
import amexLogo from "../assets/logos/amex.svg";
import chaseLogo from "../assets/logos/chase.svg";
import capitalOneLogo from "../assets/logos/capital-one.svg";
import citiLogo from "../assets/logos/citi.svg";
import usBankLogo from "../assets/logos/us-bank.svg";
import bofaLogo from "../assets/logos/bofa.svg";
import biltLogo from "../assets/logos/bilt.svg";

const ISSUER_LOGOS: Record<string, string> = {
  amex: amexLogo,
  chase: chaseLogo,
  "capital-one": capitalOneLogo,
  citi: citiLogo,
  "us-bank": usBankLogo,
  bofa: bofaLogo,
  bilt: biltLogo,
};

export default function IssuersPage() {
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

        {/* Issuer tiles */}
        <div className="issuer-grid">
          {ISSUERS.map((issuer) => (
            <Link
              key={issuer.slug}
              to={`/issuer/${issuer.slug}`}
              aria-label={`View ${issuer.label} cards`}
              className="issuer-tile"
            >
              <img
                src={ISSUER_LOGOS[issuer.slug]}
                alt=""
                className="issuer-tile-logo"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}