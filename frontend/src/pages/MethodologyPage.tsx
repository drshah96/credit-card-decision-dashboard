import { Link } from "react-router-dom";

// ─── Shared section styling ─────────────────────────────────────────────────────

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 48 }}>
      <div className="block-head">
        <span className="lbl">{label}</span>
        <h2
          style={{
            fontFamily: '"Fraunces Variable", serif',
            fontWeight: 600,
            fontSize: 22,
            margin: 0,
            color: "var(--ink)",
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ maxWidth: 720, color: "var(--muted)", fontSize: 15, lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 14px" }}>{children}</p>;
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
        <header style={{ marginBottom: 8 }}>
          <h1
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
            Methodology &amp; transparency
          </h1>
          <p style={{ color: "var(--muted)", maxWidth: 680, fontSize: 15.5, margin: 0 }}>
            How cards get ranked on this site, what the numbers on each page actually mean, and
            where the math stops and your own judgment has to take over.
          </p>
        </header>

        <Section label="Stance" title="We rank by math, not by who pays us">
          <P>
            Every ranking on this site — Top Pick, Compare, the "Best-case net" figure on a
            card's own page — comes from a fixed formula applied the same way to every card. It
            does not know, and cannot know, whether a card has any kind of business relationship
            with this site, because that information is never part of the calculation in the
            first place.
          </P>
          <P>
            As of this writing, this site has no affiliate partnerships at all — every link goes
            straight to the issuer's own page. If that ever changes, it will be disclosed clearly
            on the specific card it applies to, not buried in a footer. But the commitment on
            this page isn't about today's state — it's a standing rule: a card's ranking, point
            valuation, or "Best-case net" figure will never be different because of a business
            relationship, now or in the future. That's not just a promise — it's covered by an
            automated test in this site's own test suite that fails the build if a card's
            monetization status ever changes its rank.
          </P>
        </Section>

        <Section label="Top Pick" title="How category rankings work">
          <P>
            Each category (Dining, Groceries, Gas &amp; EV Charging, and so on) ranks every card
            by <em>effective value</em>, not by the raw multiplier printed on the card. A 6×
            points card isn't automatically better than a 3× card — it depends on what those
            points are actually worth when redeemed. So the formula is:
          </P>
          <P>
            <strong>effective value = multiplier × the card's best realistic redemption
            rate</strong> (its highest cents-per-point across transfer partners, travel portal,
            or statement credit — whichever redemption path that card actually offers). A flat
            cash-back card's rate is already worth exactly what's printed, so its multiplier is
            used as-is.
          </P>
          <P>
            <strong>Points pooling</strong> — some cards (Chase Freedom Flex/Unlimited, Citi
            Double Cash, plain Citi Strata) earn points worth only 1¢ each on their own, but
            inherit a much higher redemption rate once combined with a premium account in the
            same family (a Chase Sapphire card, Citi Strata Premier/Elite) — a real feature of
            those points programs, not something this site invents. That boost is only ever
            applied when you've told the site which cards you actually hold (the "My Cards"
            filter on Top Pick) — never in the default, whole-catalog ranking, since it requires
            actually holding both cards to be true.
          </P>
          <P>
            <strong>When a category has fewer than three cards with a real bonus</strong>, the
            remaining slot is filled with the next-best flat/everyday rate among the rest,
            labeled "No category bonus" — but a real, category-specific bonus always outranks a
            flat-rate fallback, no matter how large that flat rate is. The point of a category
            row is "what's actually good for this category," not just "what's your best card
            overall."
          </P>
          <P>
            Ties (identical effective value) are broken by lower annual fee, then alphabetically
            by card name — never by anything related to how the card is monetized.
          </P>
        </Section>

        <Section label="Credits" title="How the credit-usage calculator works">
          <P>
            A card's advertised credits (airline credit, dining credit, and so on) are rarely
            worth their full face value to any one person — most people don't use every credit
            every year. Each credit on this site starts with a realistic, hand-estimated default
            (not the maximum), grouped into three tiers: <strong>Effortless</strong> (automatic
            or unavoidable — you'll capture it without trying), <strong>Plan a little</strong>
            (timed or requires a small effort — partial use is likely), and{" "}
            <strong>Niche</strong> (only valuable if it genuinely fits your life).
          </P>
          <P>
            You can drag any credit's slider to match your own real usage instead of the default
            — the calculator recomputes "credits you'll use," compares it against the annual fee,
            and tells you whether the credits alone cover the card's cost. Your adjustments are
            saved on your device and reused wherever this site shows that card again (including
            the Compare page), so you only have to estimate once. This number counts statement
            credits and cash-like perks only — it does not include the value of points earned,
            lounge access, or insurance benefits, since those are much harder to price
            consistently across cards.
          </P>
        </Section>

        <Section label="Best-case net" title='What "Best-case net" means'>
          <P>
            The "Best-case net" figure shown at the top of every card's page is deliberately the
            most optimistic number: annual fee minus every credit's full advertised maximum,
            assuming you capture 100% of all of it. It's a ceiling, not a prediction — it exists
            so you can see a card's best-case outcome at a glance. The credit-usage calculator
            further down the same page is the more realistic number, built from your own actual
            usage instead of the card's advertised maximum. The two are expected to differ; that
            gap <em>is</em> the point.
          </P>
        </Section>

        <Section label="Limits" title="What this site doesn't account for">
          <P>
            Being upfront about where the math stops: rankings don't model spending caps on
            bonus categories, activation requirements (some rates need to be manually enrolled
            each quarter), or sign-up bonuses. A card's "best redemption rate" is one number
            representing its best realistic outcome — not a guarantee every dollar you spend
            redeems at that rate. Category matching is based on the free-text category
            descriptions issuers publish, which can occasionally be broader or narrower than
            real-world merchant coding. When in doubt, click through to a card's own page and its
            issuer's terms before applying.
          </P>
        </Section>

        <p style={{ marginTop: 56, fontSize: 13, color: "var(--faint)" }}>
          <Link to="/" style={{ color: "inherit" }}>
            ← Back to Card Issuers
          </Link>
        </p>
      </div>
    </div>
  );
}
