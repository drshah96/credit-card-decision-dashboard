import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brandMark from "../assets/brand-mark.webp";

// The site's actual brand mark — shown once, consistently, above every page
// (rendered globally in App.tsx), rather than as a small caption duplicated
// per-page. Not a giant masthead: this is a product dashboard, not a
// newspaper front page, so the marketing headline on the issuers page —
// not this — is what should dominate visually.
//
// Sticky + shrinks once you scroll (`.is-compact`), so it stays available
// as a way back to "/" without permanently eating vertical space on longer
// pages.
//
// The wordmark is real text, not an image. It used to be a 1200x190 PNG
// that baked in "THE WALLET AUDIT" plus an "Uncovering Insightful Solutions"
// tagline. Setting it in type instead means search engines and screen
// readers get the site's name as text rather than pixels, it stays sharp at
// any density, it can reflow at narrow widths instead of only scaling down,
// and it drops ~132 KB off every single page load.
//
// The lockup follows design handoff option 1C (the handoff itself is kept
// outside the repo, so the reasoning is recorded here rather than linked):
// mark, hairline rule, then a three-line stack of kicker / name / descriptor.
// The reasoning worth keeping is that the mark is a hairline line-drawing, so heavy type set
// tight next to it reads as two competing logos. Light, tracked-out caps at
// roughly two-thirds the mark's height let the symbol bracket the words
// instead of fighting them, and demoting "The" to a kicker stops the weakest
// word carrying the same weight as the name.
//
// Copy is authored in sentence case and uppercased in CSS, so screen readers
// announce "Wallet Audit" rather than spelling out capitals.
export function SiteMark() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setCompact(window.scrollY > 8);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`sitemark ${compact ? "is-compact" : ""}`}>
      <div className="wrap sitemark-inner">
        <Link to="/" aria-label="The Wallet Audit, home" className="sitemark-link">
          <img src={brandMark} alt="" className="sitemark-logo" />
          <span className="sitemark-rule" aria-hidden="true" />
          <span className="sitemark-text">
            <span className="sitemark-kicker">The</span>
            <span className="sitemark-name">Wallet Audit</span>
            <span className="sitemark-desc">Honest points valuation</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
