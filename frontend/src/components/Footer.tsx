import { Link } from "react-router-dom";
import { TERMS_AS_OF } from "../utils/routeMeta";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 40 }}>
      <div
        className="wrap"
        style={{
          padding: "24px 20px 40px",
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--faint)",
          textAlign: "center",
        }}
      >
        Card terms, fees, and credits shown here reflect issuer offers as of {TERMS_AS_OF}, but
        banks change pricing, credits, and benefits without notice. Always confirm current
        terms on the issuer's official site before applying. This dashboard is for
        informational purposes only and isn't financial advice.
        {/* Framed as "spotted something wrong" rather than a generic "contact us":
            the corrections this invites are the ones worth having on a site whose
            value is per-card accuracy, and cardholders notice a stale APR long
            before we re-audit an issuer. A mailto rather than a form on purpose —
            a public write endpoint would be a new abuse surface to defend for a
            volume of mail that doesn't justify one. */}
        <div style={{ marginTop: 10 }}>
          Spotted something wrong?{" "}
          <a href="mailto:hello@thewalletaudit.com" style={{ color: "var(--muted)" }}>
            hello@thewalletaudit.com
          </a>
        </div>
        <div style={{ marginTop: 6 }}>
          <Link to="/methodology" style={{ color: "var(--muted)" }}>
            How we rank cards →
          </Link>
        </div>
      </div>
    </footer>
  );
}