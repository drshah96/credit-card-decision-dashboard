import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { recordPageView } from "../utils/sessionTracking";
import { useSeo, pageTitle } from "../utils/seo";

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

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: "0 0 14px", paddingLeft: 20, listStyle: "disc" }}>{children}</ul>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 6 }}>{children}</li>;
}

function BackLink() {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to="/"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: hover ? "var(--muted)" : "var(--faint)",
        textDecoration: "none",
        transition: "color .15s",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      ← Back to Card Issuers
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  useEffect(() => {
    recordPageView("methodology_view");
  }, []);

  useSeo({
    title: pageTitle("How We Rank Cards"),
    description:
      "The method behind the ratings: how statement credits are valued, where points valuations come from, and why a card's advertised perks are not the same as real value.",
    path: "/methodology",
  });

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
        <div style={{ marginBottom: 20 }}>
          <BackLink />
        </div>

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
            How we rank cards, what the numbers on each page actually mean, and where the math
            stops and your own judgment has to take over.
          </p>
        </header>

        <div
          className="panel-box"
          style={{ marginTop: 24, maxWidth: 720, fontSize: 14, lineHeight: 1.6 }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--ink)" }}>
            The short version
          </p>
          <List>
            <ListItem>Every ranking comes from one fixed formula. It never knows or cares whether a card pays us anything.</ListItem>
            <ListItem>We don't have any affiliate partnerships today. Every link goes straight to the issuer.</ListItem>
            <ListItem>Calculator and "Best-case net" numbers are estimates, not guarantees. Double-check the issuer's terms before applying.</ListItem>
          </List>
        </div>

        <Section label="Stance" title="We rank by math, not by who pays us">
          <P>
            Every ranking on this site (Top Pick, Compare, the "Best-case net" figure on a card's
            own page) comes from one fixed formula, applied the same way to every card. It has no
            idea whether a card has any kind of business relationship with us, because that
            information never enters the calculation in the first place.
          </P>
          <P>
            Right now, we don't have any affiliate partnerships. Every link on this site goes
            straight to the issuer's own page. If that ever changes, we'll disclose it clearly on
            the specific card it applies to, not bury it in a footer.
          </P>
          <P>
            But the promise on this page isn't really about today. It's a standing rule: a card's
            ranking, point valuation, or "Best-case net" figure will never change because of a
            business relationship, now or later. We don't just say that. It's backed by an
            automated test in our own codebase that fails the build if a card's monetization
            status ever moves its rank.
          </P>
        </Section>

        <Section label="Top Pick" title="How category rankings work">
          <P>
            Each category (Dining, Groceries, Gas &amp; EV Charging, and so on) ranks every card
            by <em>effective value</em>, not the raw multiplier printed on the card. A 6× points
            card isn't automatically better than a 3× card. It depends on what those points are
            actually worth once you redeem them. So the formula is:
          </P>
          <P>
            <strong>effective value = multiplier × the card's best realistic redemption
            rate</strong>, using its highest cents-per-point across transfer partners, travel
            portal, or statement credit, whichever redemption path that card actually offers. A
            flat cash-back card's rate is already worth exactly what's printed, so its multiplier
            is used as-is.
          </P>
          <P>
            <strong>Points pooling.</strong> Some cards (Chase Freedom Flex/Unlimited, Citi
            Double Cash, plain Citi Strata) only earn points worth 1¢ each on their own, but pick
            up a much higher redemption rate once combined with a premium account in the same
            family, like a Chase Sapphire card or Citi Strata Premier/Elite. That's a real
            feature of those points programs, not something we made up. We only apply that boost
            once you've told us which cards you actually hold (the "Choose Your Cards" filter on
            Top Pick). It never applies to the default, whole-catalog ranking, since it only holds
            true if you actually own both cards.
          </P>
          <P>
            <strong>When a category has fewer than three cards with a real bonus</strong>, we
            fill the remaining slot with the next-best flat, everyday rate among the rest,
            labeled "No category bonus." A real, category-specific bonus always beats a flat-rate
            fallback, no matter how large that flat rate is. The point of a category row is what
            actually works well for that category, not just your best card overall.
          </P>
          <P>
            Ties (identical effective value) get broken by lower annual fee first, then
            alphabetically by card name. Never by anything related to how the card is monetized.
          </P>
        </Section>

        <Section label="Credits" title="How the credit-usage calculator works">
          <P>
            A card's advertised credits (airline credit, dining credit, and so on) are rarely
            worth their full face value to any one person. Most people don't use every credit
            every year. So each credit on this site starts with a realistic, hand-estimated
            default, not the maximum, grouped into three tiers:
          </P>
          <List>
            <ListItem>
              <strong>Effortless.</strong> Automatic or unavoidable. You'll capture it without
              trying.
            </ListItem>
            <ListItem>
              <strong>Plan a little.</strong> Timed or takes a bit of effort. Partial use is
              likely.
            </ListItem>
            <ListItem>
              <strong>Niche.</strong> Only worth it if it genuinely fits your life.
            </ListItem>
          </List>
          <P>
            You can drag any credit's slider to match your own real usage instead of the default.
            The calculator recomputes "credits you'll use," compares it against the annual fee,
            and tells you whether the credits alone cover the card's cost. Your adjustments are
            saved on your device and reused wherever this site shows that card again, including
            the Compare page, so you only have to estimate once. This number only counts
            statement credits and cash-like perks. It doesn't include the value of points earned,
            lounge access, or insurance benefits, since those are much harder to price
            consistently across cards.
          </P>
        </Section>

        <Section label="Best-case net" title='What "Best-case net" means'>
          <P>
            The "Best-case net" figure at the top of every card's page is deliberately the most
            optimistic number: annual fee minus every credit's full advertised maximum,
            assuming you capture all of it. It's a ceiling, not a prediction. It's there so you
            can see a card's best-case outcome at a glance. The credit-usage calculator further
            down the same page gives you the more realistic number, built from your own actual
            usage instead of the card's advertised maximum. The two are expected to differ.
            That gap <em>is</em> the point.
          </P>
        </Section>

        <Section label="Limits" title="What this site doesn't account for">
          <P>Let's be upfront about where the math stops. Rankings don't model:</P>
          <List>
            <ListItem>Spending caps on bonus categories.</ListItem>
            <ListItem>
              Activation requirements. Some rates need to be manually enrolled each quarter.
            </ListItem>
            <ListItem>Sign-up bonuses.</ListItem>
          </List>
          <P>
            A card's "best redemption rate" is one number representing its best realistic
            outcome, not a guarantee that every dollar you spend redeems at that rate. Category
            matching is based on the free-text category descriptions issuers publish, which can
            occasionally be broader or narrower than real-world merchant coding. When in doubt,
            click through to a card's own page and check its issuer's terms before applying.
          </P>
        </Section>
      </div>
    </div>
  );
}
