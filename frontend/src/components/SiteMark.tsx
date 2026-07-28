import { Link } from "react-router-dom";
import brandMark from "../assets/brand-mark.png";
import wordmarkTagline from "../assets/wordmark-tagline.png";

// The site's actual brand mark — shown once, consistently, above every page
// (rendered globally in App.tsx), rather than as a small caption duplicated
// per-page. Not a giant masthead: this is a product dashboard, not a
// newspaper front page, so the marketing headline on the issuers page —
// not this — is what should dominate visually.
export function SiteMark() {
  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="wrap" style={{ padding: "20px", textAlign: "center" }}>
        <Link
          to="/"
          aria-label="The Wallet Audit — home"
          style={{ display: "inline-flex", alignItems: "center", gap: 14 }}
        >
          <img src={brandMark} alt="" style={{ height: 54, width: "auto" }} />
          <img
            src={wordmarkTagline}
            alt="The Wallet Audit — Uncovering Insightful Solutions"
            style={{ height: 54, width: "auto" }}
          />
        </Link>
      </div>
    </div>
  );
}
