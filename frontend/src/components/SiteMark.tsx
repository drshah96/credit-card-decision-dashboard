import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brandMark from "../assets/brand-mark.png";
import wordmarkTagline from "../assets/wordmark-tagline.png";

// The site's actual brand mark — shown once, consistently, above every page
// (rendered globally in App.tsx), rather than as a small caption duplicated
// per-page. Not a giant masthead: this is a product dashboard, not a
// newspaper front page, so the marketing headline on the issuers page —
// not this — is what should dominate visually.
//
// Sticky + shrinks once you scroll (`.is-compact`), so it stays available
// as a way back to "/" without permanently eating vertical space on longer
// pages. Both images share one CSS var (`--sitemark-logo-h`) for their
// height — wordmark-tagline.png bakes "THE WALLET AUDIT" + tagline into a
// single wide (1200x190) image, so its rendered width is always ~6.3x its
// height; sizing that height with clamp() (rather than the old fixed 54px)
// is what keeps the lockup from overflowing off the right edge on phone
// widths, since there's no way to reflow text baked into an image.
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
        <Link to="/" aria-label="The Wallet Audit — home" className="sitemark-link">
          <img src={brandMark} alt="" className="sitemark-logo" />
          <img
            src={wordmarkTagline}
            alt="The Wallet Audit — Uncovering Insightful Solutions"
            className="sitemark-wordmark"
          />
        </Link>
      </div>
    </div>
  );
}
