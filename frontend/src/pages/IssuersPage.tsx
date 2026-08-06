import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTabs } from "../components/PageTabs";
import { trackEvent } from "../utils/analytics";
import { recordPageView } from "../utils/sessionTracking";
import { ISSUERS } from "../utils/cardTaxonomy";
import amexLogo from "../assets/logos/amex.svg";
import chaseLogo from "../assets/logos/chase.svg";
import capitalOneLogo from "../assets/logos/capital-one.svg";
import citiLogo from "../assets/logos/citi.svg";
import usBankLogo from "../assets/logos/us-bank.svg";
import bofaLogo from "../assets/logos/bofa.svg";
import biltLogo from "../assets/logos/bilt.svg";
import wellsFargoLogo from "../assets/logos/wells-fargo.svg";
import discoverLogo from "../assets/logos/discover.svg";
import { useSeo } from "../utils/seo";

const ISSUER_LOGOS: Record<string, string> = {
  amex: amexLogo,
  chase: chaseLogo,
  "capital-one": capitalOneLogo,
  citi: citiLogo,
  "us-bank": usBankLogo,
  bofa: bofaLogo,
  bilt: biltLogo,
  "wells-fargo": wellsFargoLogo,
  discover: discoverLogo,
};

// Capital One bought Discover and started moving accounts onto its own
// platform in July 2026, but the cards keep Discover branding, their own
// terms and their own network — so they stay a separate issuer here. Worth
// saying out loud, because a cardholder who sees Capital One on a statement
// or gets sent to capitalone.com to apply will reasonably wonder.
const ISSUER_NOTES: Record<string, string> = {
  discover: "Now serviced by Capital One",
};

const HEADLINES = [
  { lead: "Build a smarter card portfolio.", accent: "Maximize every swipe." },
  { lead: "Don't just carry premium cards.", accent: "Unlock their full potential." },
  { lead: "Curate a better wallet.", accent: "Elevate your rewards." },
];
const HEADLINE_ROTATE_MS = 5000;

export default function IssuersPage() {
  const [headlineIndex, setHeadlineIndex] = useState(0);

  useSeo({
    title: "The Wallet Audit \u2014 Credit Cards Rated on Real Value",
    description:
      "Compare premium credit cards on what they are actually worth: annual fees against real statement-credit value, honest points valuations, and no marketing hype.",
    path: "/",
  });

  useEffect(() => {
    recordPageView("home_view");
  }, []);

  useEffect(() => {
    // Auto-updating content that runs longer than 5s needs a way to stop
    // (WCAG 2.2.2) — the simplest honest option for a decorative headline
    // like this is to not start it at all for users who've asked their OS
    // for reduced motion, rather than adding a bespoke pause control.
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const id = setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % HEADLINES.length);
    }, HEADLINE_ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  // Fires once on mount and again on every rotation, so GA4 can report which
  // headline variant a session actually saw (e.g. to correlate with clicks
  // through to an issuer) instead of the rotation being invisible to analytics.
  useEffect(() => {
    trackEvent("headline_view", { headline_variant: HEADLINES[headlineIndex].lead });
  }, [headlineIndex]);

  const headline = HEADLINES[headlineIndex];

  return (
    <div>
      <div className="wrap page-body">
        {/* Header — the site's own name/mark lives in the persistent
            SiteMark bar above every page (see App.tsx), not here, so this
            headline doesn't have to also carry brand identity. */}
        <header style={{ marginBottom: 40 }}>
          <h1
            key={headlineIndex}
            className="headline-rotator"
            style={{
              fontFamily: '"Fraunces Variable", serif',
              fontWeight: 600,
              fontSize: "clamp(22px, 3.2vw, 32px)",
              lineHeight: 1.15,
              margin: "0 0 14px",
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            {headline.lead}{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold)" }}>
              {headline.accent}
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
            The Wallet Audit drills into every credit, earn rate, travel benefit,
            and insurance policy on each card, turning honest points valuation
            into real card optimization, so you can maximize rewards on the card
            you'll actually use.
          </p>
        </header>

        <PageTabs active="issuers" />

        {/* Issuer tiles */}
        <div className="issuer-grid">
          {ISSUERS.map((issuer) => (
            <Link
              key={issuer.slug}
              to={`/issuer/${issuer.slug}`}
              // The note is folded into the label rather than left to be read
              // from the tile: aria-label replaces an element's contents as its
              // accessible name, so a screen reader would otherwise never hear
              // "Now serviced by Capital One" at all.
              aria-label={
                ISSUER_NOTES[issuer.slug]
                  ? `View ${issuer.label} cards. ${ISSUER_NOTES[issuer.slug]}.`
                  : `View ${issuer.label} cards`
              }
              className="issuer-tile"
            >
              <img
                src={ISSUER_LOGOS[issuer.slug]}
                alt=""
                className="issuer-tile-logo"
              />
              {ISSUER_NOTES[issuer.slug] && (
                <span className="issuer-tile-note">
                  {ISSUER_NOTES[issuer.slug]}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}