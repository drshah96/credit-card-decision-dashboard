import { useState, useEffect, useRef } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchCard, fetchCards } from "../api/cards";
import { useCompareList } from "../hooks/useCompareList";
import { useCreditUsage } from "../hooks/useCreditUsage";
import { trackEvent } from "../utils/analytics";
import { ISSUERS, getIssuerBySlug, parseMultiplierValue } from "../utils/cardTaxonomy";
import { recordPageView } from "../utils/sessionTracking";
import { CARD_IMAGES } from "../utils/cardImages";
import { useSeo, cardRouteMeta } from "../utils/seo";
import type {
  Card,
  Credit,
  CreditTier,
  EarnRate,
  InsuranceLevel,
  IntroApr,
  TransferPartner,
} from "../types/cards";

// ─── Earn rate ordering ─────────────────────────────────────────────────────────

// Highest multiplier first, ties broken alphabetically by category. Sorting at
// render time (rather than relying on each card's JSON to be authored in order)
// keeps every card consistent regardless of how it was written, including future
// additions.
function sortEarnRates(rates: EarnRate[]): EarnRate[] {
  return [...rates].sort((a, b) => {
    const diff = parseMultiplierValue(b.multiplier) - parseMultiplierValue(a.multiplier);
    return diff !== 0 ? diff : a.category.localeCompare(b.category);
  });
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_LABELS: Record<CreditTier, string> = {
  easy: "Effortless",
  plan: "Plan a little",
  niche: "Niche",
};

const TIER_SUBS: Record<CreditTier, string> = {
  easy: "auto or unavoidable",
  plan: "timed, partial use likely",
  niche: "only if it fits your life",
};

const TIER_ORDER: CreditTier[] = ["easy", "plan", "niche"];

// ─── Insurance helpers ────────────────────────────────────────────────────────

const INS_DOT_CLASS: Record<InsuranceLevel, string> = {
  strong: "d-strong",
  good: "d-good",
  mid: "d-mid",
  none: "d-none",
};

// ─── Pip labels ───────────────────────────────────────────────────────────────

const PIP_LABELS = ["", "minimal", "minor", "useful", "strong", "elite"];

// ─── Rates & fees helpers ───────────────────────────────────────────────────────

// Folds the intro offer into the same row as the ongoing rate it rolls into
// (e.g. "0% intro APR for 15 months, after that 18.24%-27.74%") rather than
// two separate rows — an intro rate is just the first phase of the same
// APR, not a distinct fact. "intro APR" (not just the bare rate) makes the
// first clause a complete phrase on its own — some ongoing-rate strings are
// already full sentences in their own right (e.g. US Bank Split's "no
// standard revolving APR..."), so the trailing clause can't be relied on to
// carry the noun for both halves. "—" (not "Not offered" or similar)
// matches the same "no data" convention TopPickPage's empty ranking cells
// use — deliberately doesn't distinguish "this card has no such offer" from
// "not yet audited" for the couple of fields still genuinely unresolved
// (see intro_apr_purchases's own doc comment in types/cards.ts).
function formatAprRow(intro: IntroApr | null, ongoing: string | null): string {
  if (intro && ongoing) return `${intro.rate} intro APR for ${intro.months} months, after that ${ongoing}`;
  if (intro) return `${intro.rate} intro APR for ${intro.months} months`;
  return ongoing ?? "—";
}

function formatForeignTransactionFee(hasFee: boolean | null, rate: string | null): string {
  if (hasFee === false) return "None";
  if (hasFee === true) return rate ?? "Charged (exact rate not confirmed)";
  return "—";
}

function formatPenaltyApr(rate: string | null, trigger: string | null): string {
  if (rate && trigger) return `${rate}, ${trigger}`;
  return rate ?? "—";
}

// ─── Credit Modal ─────────────────────────────────────────────────────────────

function CreditModal({
  credit,
  tier,
  onClose,
}: {
  credit: Credit;
  tier: CreditTier;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      prevFocus?.focus();
    };
  }, []);

  const tierColors: Record<CreditTier, string> = {
    easy: "var(--green)",
    plan: "var(--blue)",
    niche: "var(--gold)",
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-x-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
          <div className="modal-cat" style={{ color: tierColors[tier] }}>
            {TIER_LABELS[tier]} credit
          </div>
          <h4 className="modal-title" id="credit-modal-title">
            {credit.name}
          </h4>
          {credit.max_annual > 0 && (
            <span className="modal-val">Up to ${credit.max_annual}/yr</span>
          )}
        </div>
        <div className="modal-body">
          {credit.description && (
            <div style={{ marginBottom: credit.tips.length > 0 ? 22 : 0 }}>
              <h5>What it actually is</h5>
              <p className="modal-what">{credit.description}</p>
            </div>
          )}
          {credit.tips.length > 0 && (
            <div>
              <h5>Tricks &amp; hacks</h5>
              <ul className="tips-list">
                {credit.tips.map((tip, i) => {
                  const isWarn = tip.startsWith("warn::");
                  const text = isWarn ? tip.slice(6) : tip;
                  return (
                    <li key={i} className={isWarn ? "warn" : ""}>
                      {text}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transfer partners modal ───────────────────────────────────────────────────

const PARTNER_TYPE_ICON: Record<TransferPartner["type"], string> = {
  airline: "✈️",
  hotel: "🏨",
};

function TransferPartnersModal({
  partners,
  currency,
  onClose,
}: {
  partners: TransferPartner[];
  currency: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      prevFocus?.focus();
    };
  }, []);

  const airlines = partners.filter((p) => p.type === "airline");
  const hotels = partners.filter((p) => p.type === "hotel");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partners-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-x-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
          <div className="modal-cat">Transfer partners</div>
          <h4 className="modal-title" id="partners-modal-title">
            Where {currency} can go
          </h4>
        </div>
        <div className="modal-body">
          {([
            ["Airlines", airlines],
            ["Hotels", hotels],
          ] as const).map(([label, group]) =>
            group.length > 0 ? (
              <div key={label} style={{ marginBottom: 20 }}>
                <h5>{label}</h5>
                <ul className="partner-list">
                  {group.map((p) => (
                    <li key={p.name} className="partner-row">
                      <span className="partner-icon" aria-hidden="true">
                        {PARTNER_TYPE_ICON[p.type]}
                      </span>
                      <span className="partner-name">{p.name}</span>
                      <span className="partner-ratio">{p.ratio}</span>
                      {p.notes && <span className="partner-notes">{p.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Credit row ───────────────────────────────────────────────────────────────

interface CreditRowProps {
  credit: Credit;
  value: number;
  tierIdx: number;
  onSlider: (id: string, v: number) => void;
  onTierMove: (id: string, dir: "up" | "down") => void;
  onOpenModal: (credit: Credit, tier: CreditTier) => void;
}

function CreditRow({ credit, value, tierIdx, onSlider, onTierMove, onOpenModal }: CreditRowProps) {
  const currentTier = TIER_ORDER[Math.max(0, Math.min(tierIdx, TIER_ORDER.length - 1))];
  const canMoveUp = tierIdx > 0;
  const canMoveDown = tierIdx < TIER_ORDER.length - 1;

  return (
    <div className={`credit-card t-${currentTier}`}>
      <div className="credit-r1">
        <button
          type="button"
          className="credit-name-btn"
          onClick={() => onOpenModal(credit, currentTier)}
        >
          {credit.name}
          <i className="info-icon" aria-hidden="true">i</i>
        </button>
        <span className="credit-max">${credit.max_annual}</span>
      </div>
      <div className="credit-sub">{credit.subtitle}</div>
      {credit.max_annual > 0 ? (
        <div className="credit-slider">
          <input
            type="range"
            min={0}
            max={credit.max_annual}
            step={5}
            value={value}
            onChange={(e) => onSlider(credit.id, Number(e.target.value))}
            aria-label={`How much of ${credit.name} you'll use`}
          />
          <span className="credit-use">${value}</span>
        </div>
      ) : (
        <div className="credit-hint" style={{ marginTop: 6 }}>No monetary value</div>
      )}
      <div className="credit-r3">
        <span className="credit-hint">of ${credit.max_annual} max</span>
        <div className="tier-move">
          <button
            type="button"
            className="tier-btn"
            disabled={!canMoveUp}
            onClick={() => onTierMove(credit.id, "up")}
            aria-label={`Move ${credit.name} to easier tier`}
            title="Easier tier"
          >
            ▲
          </button>
          <button
            type="button"
            className="tier-btn"
            disabled={!canMoveDown}
            onClick={() => onTierMove(credit.id, "down")}
            aria-label={`Move ${credit.name} to harder tier`}
            title="Harder tier"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Credits section ──────────────────────────────────────────────────────────

function CreditsSection({
  credits,
  values,
  tiers,
  onSlider,
  onTierMove,
  onReset,
}: {
  credits: Credit[];
  values: Record<string, number>;
  tiers: Record<string, CreditTier>;
  onSlider: (id: string, v: number) => void;
  onTierMove: (id: string, dir: "up" | "down") => void;
  onReset: () => void;
}) {
  // Credits an issuer has discontinued are tracked in the History timeline
  // below (as a "Cut" entry) instead — showing them here too, in a section
  // that's otherwise exclusively "credits you can use," was confusing.
  const active = credits.filter((c) => !c.removed);
  const [modal, setModal] = useState<{ credit: Credit; tier: CreditTier } | null>(null);

  function handleOpenModal(credit: Credit, tier: CreditTier) {
    setModal({ credit, tier });
  }

  const tierGroups: Record<CreditTier, Credit[]> = { easy: [], plan: [], niche: [] };
  active.forEach((c) => {
    const t = tiers[c.id] ?? c.tier;
    tierGroups[t].push(c);
  });

  return (
    <>
      <p className="credit-intro">
        Drag each slider to the amount you'll <b>actually</b> capture. Use the{" "}
        <b>▲▼</b> arrows to move a credit between tiers for <i>your</i> life.
        Resy might be effortless for you and niche for someone else. The calculator below
        tallies it against the fee.
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" className="reset-sliders-btn" onClick={onReset}>
          Reset sliders
        </button>
      </div>

      <div className="credit-cols">
        {TIER_ORDER.map((tier) => {
          const group = tierGroups[tier];
          return (
            <div key={tier}>
              <div className={`cgroup-head t-${tier}`}>
                <span className="tag">{TIER_LABELS[tier]}</span>
                <small>{TIER_SUBS[tier]}</small>
              </div>
              <div className="cgrid">
                {group.length > 0 ? (
                  group.map((c) => (
                    <CreditRow
                      key={c.id}
                      credit={c}
                      value={values[c.id] ?? 0}
                      tierIdx={TIER_ORDER.indexOf(tiers[c.id] ?? c.tier)}
                      onSlider={onSlider}
                      onTierMove={onTierMove}
                      onOpenModal={handleOpenModal}
                    />
                  ))
                ) : (
                  <div className="credit-hint" style={{ padding: "8px 2px" }}>None here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <CreditModal
          credit={modal.credit}
          tier={modal.tier}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ─── Pips ─────────────────────────────────────────────────────────────────────

function Pips({ strength }: { strength: number }) {
  return (
    <div className="pips" aria-label={`Strength: ${strength} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`pip ${n <= strength ? "on" : ""}`} aria-hidden="true" />
      ))}
      <span className="pl">{PIP_LABELS[strength] ?? ""}</span>
    </div>
  );
}

// ─── Compare widget ───────────────────────────────────────────────────────────

function CompareWidget({ cardId }: { cardId: string }) {
  const { compareIds, addCard, removeCard, maxCompare } = useCompareList();
  const isAdded = compareIds.includes(cardId);
  const isFull = compareIds.length >= maxCompare;

  if (isAdded) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="compare-widget-btn added" onClick={() => removeCard(cardId)}>
          ✓ In Compare
        </button>
        <Link to={`/compare?cards=${compareIds.join(",")}`} className="compare-widget-link">
          View Compare ({compareIds.length}) →
        </Link>
      </div>
    );
  }

  if (isFull) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12.5, color: "var(--faint)" }}>Compare full (4/4)</span>
        <Link to={`/compare?cards=${compareIds.join(",")}`} className="compare-widget-link">
          View Compare →
        </Link>
      </div>
    );
  }

  return (
    <button type="button" className="compare-widget-btn" onClick={() => addCard(cardId)}>
      + Add to Compare
    </button>
  );
}

// ─── Info modal ───────────────────────────────────────────────────────────────

// Shared "explain this" popup. Same focus-trap / escape-to-close / scroll-lock
// pattern as CreditModal, so every popup on the page behaves identically —
// callers just supply the eyebrow, title and body.
function InfoModal({
  category,
  title,
  titleId,
  onClose,
  children,
}: {
  category: string;
  title: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      prevFocus?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-x-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
          <div className="modal-cat">{category}</div>
          <h4 className="modal-title" id={titleId}>
            {title}
          </h4>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Hero "your take, so far" widget ───────────────────────────────────────────

// Surfaces the same running credit total the Credits section uses, right in
// the hero — so the number a visitor cares about most doesn't require
// scrolling past everything else first. Purely a display of state owned by
// CardDetail (the credit sliders live there now, not inside CreditsSection),
// so this never drifts out of sync with the sliders below it.
function HeroTakeWidget({ totalUsed, annualFee }: { totalUsed: number; annualFee: number }) {
  const [showModal, setShowModal] = useState(false);
  const fillPct = Math.min(100, Math.round((totalUsed / annualFee) * 100));
  const diff = totalUsed - annualFee;
  let summary: string;
  if (diff >= 0) {
    summary = `With your inputs, the credits alone more than cover the fee. You're ahead $${diff} before you count points, lounges, or insurance.`;
  } else if (totalUsed >= annualFee * 0.6) {
    summary = `Credits recoup most of the fee ($${totalUsed} of $${annualFee}). Whether it's worth it comes down to how much you value the lounges, points and insurance on top.`;
  } else {
    summary = `Credits only recoup $${totalUsed} of $${annualFee}. You'd be paying $${Math.abs(diff)} for the lounges, points and status. Make sure those are worth it to you.`;
  }
  const modalText = `${summary} Counts statement credits + cash-like perks only (not points earning, lounge value, or insurance).`;

  return (
    <div className="hero-take">
      <div className="hero-take-head">
        <span className="hero-take-label">Your take, so far</span>
        <button
          type="button"
          className="info-btn"
          onClick={() => setShowModal(true)}
          aria-label="What this means"
        >
          i
        </button>
      </div>
      <div className="hero-take-amount" style={{ color: diff >= 0 ? "var(--green)" : "var(--red)" }}>
        {diff >= 0 ? `+$${diff}` : `−$${Math.abs(diff)}`}
      </div>
      <div
        className="hero-take-bar"
        role="progressbar"
        aria-valuenow={Math.min(totalUsed, annualFee)}
        aria-valuemin={0}
        aria-valuemax={annualFee}
        aria-label={`$${totalUsed} of $${annualFee} fee covered by credits`}
      >
        <div className="hero-take-fill" style={{ width: `${fillPct}%` }} />
      </div>
      <div className="hero-take-sub">${totalUsed} of ${annualFee} fee, from the credits below</div>
      {showModal && (
        <InfoModal
          category="Credit calculator"
          title="Your take, so far"
          titleId="hero-take-modal-title"
          onClose={() => setShowModal(false)}
        >
          <div style={{ marginBottom: 22 }}>
            <h5>What it means</h5>
            <p className="modal-what">{modalText}</p>
          </div>
          <div>
            <h5>Make it accurate</h5>
            <p className="modal-what" style={{ margin: 0 }}>
              Move the sliders in the Credits section below based on what you'd realistically
              spend in a year on each one. This number follows along, so you can see what you'd
              actually be paying once your real usage is counted.
            </p>
          </div>
        </InfoModal>
      )}
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────

function Block({
  label,
  title,
  note,
  noDivider,
  children,
}: {
  label: string;
  title: string;
  note?: string;
  // Skip the trailing rule after the title — for blocks whose content (e.g.
  // a tab bar) supplies its own full-width divider right below, so the two
  // don't stack into a doubled line.
  noDivider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 36 }}>
      <div className={`block-head${noDivider ? " no-divider" : ""}`}>
        <span className="lbl">{label}</span>
        <h3>{title}</h3>
        {note && <span className="note">{note}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading card details"
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      {[240, 190, 320, 280, 200].map((h, i) => (
        <div
          key={i}
          style={{
            minHeight: h,
            borderRadius: 16,
            background: "var(--panel-s)",
            border: "1px solid var(--line)",
            animation: "pulse 1.5s ease-in-out infinite",
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}

// ─── Affiliate disclosure ───────────────────────────────────────────────────────

// Renders only when this specific card's own link is actually monetized —
// never a blanket site-wide banner. That's deliberate: it means the
// disclosure can never drift out of sync with reality (there's nothing to
// forget to update elsewhere) and never claims a commission that isn't
// real. As of this writing no card in the catalog has is_affiliate_link
// set — this exists so the UI is ready the moment one does, per FTC
// Endorsement Guide principles: clear, conspicuous, plain language, and
// placed before the link it discloses rather than buried in a footer or
// hidden behind a hover/click. Rendered as the very first element inside
// the hero <header>, above both existing outbound links (the card name and
// the card image), so it's unavoidable before either.
function AffiliateDisclosure({ card }: { card: Card }) {
  if (!card.is_affiliate_link) return null;
  return (
    <div
      className="panel-box"
      style={{
        marginBottom: 20,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: "color-mix(in srgb, var(--gold) 12%, var(--panel-s))",
        borderColor: "color-mix(in srgb, var(--gold) 35%, var(--line))",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
        📢
      </span>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
        <strong>Advertising disclosure:</strong> we may earn a commission if you apply for{" "}
        {card.name} through the link on this page, at no extra cost to you. This never changes
        which cards we recommend or how we calculate their point values.
      </p>
    </div>
  );
}

// ─── Secured/unsecured pairing note ────────────────────────────────────────────

// A handful of cards (BofA, Capital One Platinum, US Bank) have a secured
// counterpart with byte-identical earn rates, hidden from catalog listings in
// favor of the unsecured one (see cardTaxonomy.ts's hiddenSecuredIds). Both
// sides of the pair still need a way to reach the other — the unsecured
// primary as an easier-approval-odds alternative, the secured card (no
// longer reachable by browsing) to orient someone who lands there directly.
// Looks the sibling's name up via the same `["cards"]` summary query every
// other listing page already uses, so it's usually already warm in cache.
function SecuredPairingNote({ card }: { card: Card }) {
  const location = useLocation();
  const pairId = card.secured_variant_id ?? card.is_secured_variant_of;
  const { data: allCards } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
    enabled: pairId !== null,
  });
  if (!pairId) return null;

  const pairName = allCards?.find((c) => c.id === pairId)?.name;
  const text = card.secured_variant_id
    ? `A secured version of this card${pairName ? `, ${pairName},` : ""} is also available — same benefits, easier approval odds.`
    : `This is the secured version of${pairName ? ` ${pairName}` : " another card"} — same benefits, no easier-approval trade-off besides the refundable deposit.`;
  const linkLabel = card.secured_variant_id ? "View the secured version" : "View the unsecured version";

  return (
    <div className="panel-box" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{text}</p>
      <Link
        to={`/cards/${pairId}`}
        state={{ from: location.pathname + location.search }}
        style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap", textDecoration: "none" }}
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

// ─── Card detail ──────────────────────────────────────────────────────────────

function CardDetail({ card }: { card: Card }) {
  // GET /api/cards/:id doesn't return total_max_credits (that's summary-only) —
  // derive it from the same active, non-removed credits the calculator below uses.
  const totalMaxCredits = card.credits
    .filter((c) => !c.removed)
    .reduce((sum, c) => sum + c.max_annual, 0);
  const netCost = card.annual_fee - totalMaxCredits;
  const cardImage = CARD_IMAGES[card.id];
  const [showPartnersModal, setShowPartnersModal] = useState(false);
  const hasPartnerDetail = (card.transfer_partners.partners?.length ?? 0) > 0;
  const [showAddCardsModal, setShowAddCardsModal] = useState(false);

  // Credit usage state lives here (not inside CreditsSection) so the hero's
  // "Your take, so far" widget and the Credits section's own calculator
  // share one source of truth instead of two copies that could drift.
  const activeCredits = card.credits.filter((c) => !c.removed);
  const { getCardUsage, setCreditValue } = useCreditUsage();
  const [creditValues, setCreditValues] = useState<Record<string, number>>(() => {
    const saved = getCardUsage(card.id);
    return Object.fromEntries(activeCredits.map((c) => [c.id, saved?.[c.id] ?? c.default_value]));
  });
  const [creditTiers, setCreditTiers] = useState<Record<string, CreditTier>>(() =>
    Object.fromEntries(activeCredits.map((c) => [c.id, c.tier])),
  );
  const totalCreditsUsed = activeCredits.reduce((sum, c) => sum + (creditValues[c.id] ?? 0), 0);

  function handleCreditSlider(id: string, v: number) {
    setCreditValues((prev) => ({ ...prev, [id]: v }));
    setCreditValue(card.id, id, v);
  }

  function handleCreditTierMove(id: string, dir: "up" | "down") {
    setCreditTiers((prev) => {
      const cur = TIER_ORDER.indexOf(prev[id] ?? "niche");
      const next = dir === "up" ? Math.max(0, cur - 1) : Math.min(2, cur + 1);
      return { ...prev, [id]: TIER_ORDER[next] };
    });
  }

  function handleCreditReset() {
    setCreditValues(Object.fromEntries(activeCredits.map((c) => [c.id, c.default_value])));
    setCreditTiers(Object.fromEntries(activeCredits.map((c) => [c.id, c.tier])));
    for (const c of activeCredits) setCreditValue(card.id, c.id, c.default_value);
  }

  // Details tabs — consolidates what used to be six separate always-visible
  // sections (Earning, Value, Additional cards, Insurance, Status & Perks,
  // Fees) into one "explore the full picture" area below Credits, so the
  // interactive calculator is the first thing after the hero instead of the
  // last thing at the bottom of a long scroll. Earn and Value & Redemption
  // are separate tabs (not combined into one "Value" tab) so the tab label
  // itself carries the heading — no sub-heading needed inside either pane.
  const [activeTab, setActiveTab] = useState<"earn" | "value" | "perks" | "insurance" | "fees">("earn");
  // shortLabel is what shows on phones. At full length these five labels run
  // ~549px, so on a 390px screen the last two sat off the edge of the
  // scrolling strip where nobody would find them.
  const detailTabs: { id: typeof activeTab; label: string; shortLabel: string }[] = [
    { id: "earn", label: "Earn", shortLabel: "Earn" },
    { id: "value", label: "Value & Redemption", shortLabel: "Value" },
    { id: "perks", label: "Status & Perks", shortLabel: "Perks" },
    { id: "insurance", label: "Insurance & Protections", shortLabel: "Insurance" },
    { id: "fees", label: "Fees", shortLabel: "Fees" },
  ];

  return (
    <div>
      {/* Hero */}
      <header style={{ paddingTop: 12 }}>
        <AffiliateDisclosure card={card} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 6,
          }}
        >
          <div style={{ flex: "1 1 320px" }}>
            <p
              style={{
                fontSize: 11.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--faint)",
                margin: "0 0 6px",
              }}
            >
              {card.issuer}
            </p>
            {/* h1, not h2: this is the page's top-level heading, and every
            other route already leads with one. Inline styles carry the full
            look, so the level change is semantic only. */}
            <h1
              style={{
                fontFamily: '"Fraunces Variable", serif',
                fontWeight: 600,
                fontSize: "clamp(26px, 3.5vw, 34px)",
                margin: "0 0 3px",
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              {card.official_url ? (
                <a
                  href={card.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none" }}
                  title={`Open ${card.name} on ${card.issuer}'s site`}
                >
                  {card.name}
                </a>
              ) : (
                card.name
              )}
            </h1>
            <p
              style={{
                fontSize: 12.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--muted)",
                margin: "0 0 14px",
              }}
            >
              {card.points_program} · {card.network}
            </p>

            {/* Fee stat row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, margin: "4px 0 0" }}>
              {[
                { k: "Annual fee", v: `$${card.annual_fee}` },
                { k: "Max credits", v: `$${totalMaxCredits}` },
                {
                  k: "Best-case net",
                  v: netCost <= 0 ? `+$${Math.abs(netCost)}` : `$${netCost}`,
                  color: netCost <= 0 ? "var(--green)" : "var(--red)",
                },
              ].map(({ k, v, color }) => (
                <div key={k}>
                  <div
                    style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--faint)" }}
                  >
                    {k}
                  </div>
                  <div
                    style={{ fontFamily: '"Fraunces Variable", serif', fontSize: 22, fontWeight: 600, marginTop: 2, color: color ?? "var(--ink)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ margin: "20px 0 0", maxWidth: 340 }}>
              <HeroTakeWidget totalUsed={totalCreditsUsed} annualFee={card.annual_fee} />
            </div>

            {/* Effective cost — always its own row since it's a sentence, not a short stat */}
            <div style={{ margin: "16px 0 0" }}>
              <div
                style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--faint)" }}
              >
                Effective cost
              </div>
              <div
                style={{ fontFamily: '"Fraunces Variable", serif', fontSize: 22, fontWeight: 600, marginTop: 2, color: "var(--ink)" }}
              >
                {card.effective_cost}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, maxWidth: 280 }}>
            <div className={`verdict-badge ${card.verdict.status}`}>
              {card.verdict.text}
            </div>
            {cardImage && (() => {
              const img = (
                <img
                  src={cardImage}
                  alt={`${card.name} card art`}
                  style={{
                    height: 140,
                    width: "auto",
                    maxWidth: "100%",
                    borderRadius: 12,
                    boxShadow: "0 12px 28px -12px rgba(15, 23, 42, 0.35)",
                  }}
                />
              );
              return card.official_url ? (
                <a
                  href={card.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${card.name} on ${card.issuer}'s site`}
                >
                  {img}
                </a>
              ) : (
                img
              );
            })()}
            <CompareWidget cardId={card.id} />
          </div>
        </div>
      </header>

      <SecuredPairingNote card={card} />

      {/* Welcome bonus — disabled: sign-up offers rotate on the issuer's own
      promotional calendar, much faster than APR/fee data drifts, so a stale
      bonus reads as an active (wrong) promotional claim rather than a dated
      fact. That's a worse failure mode for a decision-support site that
      isn't trying to promote applying. Data still flows through the schema
      and API; only the render is off, so this can come back if we find a
      way to keep it current.
      {card.welcome_bonus && (
        <Block label="Sign-up offer" title="Welcome bonus" note="from the issuer's current terms">
          <div className="welcome-bonus">
            <div className="wb-amount">{card.welcome_bonus.bonus}</div>
            <div className="wb-req">{card.welcome_bonus.requirement}</div>
            {card.welcome_bonus.estimated_value && (
              <div className="wb-value">
                Worth an estimated {card.welcome_bonus.estimated_value}
              </div>
            )}
          </div>
        </Block>
      )}
      */}

      {/* Credits — right after the hero: it's the primary interactive tool
      on the page, not something to scroll past everything else to reach. */}
      <Block label="Credits" title="Credits: set what you'll really use">
        <CreditsSection
          credits={card.credits}
          values={creditValues}
          tiers={creditTiers}
          onSlider={handleCreditSlider}
          onTierMove={handleCreditTierMove}
          onReset={handleCreditReset}
        />
      </Block>

      {/* Details — Earn, Value & Redemption, Status & Perks, Insurance, and
      Fees behind tabs instead of six separate always-visible sections
      stacked below Credits. */}
      <Block label="Details" title="Explore the full picture" noDivider>
        <div className="page-tabs" role="tablist">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              // Only the open panel is mounted, so pointing at it from an
              // unselected tab would be a dangling reference.
              aria-controls={activeTab === tab.id ? `panel-${tab.id}` : undefined}
              className={`page-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {/* Only one is ever displayed, and display:none keeps the other
              out of the accessibility tree, so the tab isn't announced twice. */}
              <span className="tab-label-full">{tab.label}</span>
              <span className="tab-label-short">{tab.shortLabel}</span>
            </button>
          ))}
        </div>

        {activeTab === "earn" && (
          <div role="tabpanel" id="panel-earn" aria-labelledby="tab-earn" style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 12 }}>
              Multiplier per $1 spent
            </div>
            <div className="earn-grid">
              {sortEarnRates(card.earn_rates).map((rate) => (
                <div
                  key={rate.category}
                  className={`earn-tile ${rate.highlight ? "hi" : ""} ${rate.is_base ? "base" : ""}`}
                >
                  <div className="ei">{rate.emoji}</div>
                  <div className="em">{rate.multiplier}</div>
                  <div className="el">{rate.category}</div>
                </div>
              ))}
            </div>
            {card.earn_note && <div className="earn-foot">{card.earn_note}</div>}
          </div>
        )}

        {activeTab === "value" && (
          <div role="tabpanel" id="panel-value" aria-labelledby="tab-value" style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 12 }}>
              Redemption value, in cents per point
            </div>
            <div className="grid2">
              {/* Redemption ladder */}
              <div className="panel-box">
                <div className="ladder-top">
                  <span className="ladder-cur">{card.points.currency}</span>
                  <span className="ladder-100k">
                    100,000 pts ≈ <b>{card.points.per_100k}</b>
                  </span>
                </div>
                {card.points.redemption_options.map((opt) => {
                  const w = Math.min((opt.cpp / 2.2) * 100, 100);
                  return (
                    <div key={opt.method} className={`lrow ${opt.best ? "best" : ""}`}>
                      <span className="ll">{opt.method}</span>
                      <div className="ltrack">
                        <div className={`lfill ${opt.best ? "" : "dim"}`} style={{ width: `${w}%` }} />
                      </div>
                      <span className="lval">{opt.cpp.toFixed(2)}¢</span>
                    </div>
                  );
                })}
                {card.points.note && <div className="ladder-note">{card.points.note}</div>}
              </div>

              {/* Transfer partners */}
              <div
                className={`panel-box partners ${hasPartnerDetail ? "clickable" : ""}`}
                role={hasPartnerDetail ? "button" : undefined}
                tabIndex={hasPartnerDetail ? 0 : undefined}
                onClick={hasPartnerDetail ? () => setShowPartnersModal(true) : undefined}
                onKeyDown={
                  hasPartnerDetail
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowPartnersModal(true);
                        }
                      }
                    : undefined
                }
                aria-label={hasPartnerDetail ? "View full transfer partner list" : undefined}
              >
                <div className="pt">
                  Transfer partners
                  {hasPartnerDetail && <span className="pt-cta">View list →</span>}
                </div>
                <div className="pcount">
                  {card.transfer_partners.airline_count > 0 || card.transfer_partners.hotel_count > 0 ? (
                    <>
                      <div className="pc">
                        <b>{card.transfer_partners.airline_count}</b>airlines
                      </div>
                      <div className="pc">
                        <b>{card.transfer_partners.hotel_count}</b>hotels
                      </div>
                    </>
                  ) : (
                    <div className="pc">
                      <b>0</b>transfer out
                    </div>
                  )}
                </div>
                <div className="phi">{card.transfer_partners.highlight}</div>
                {card.transfer_partners.recent_changes && (
                  <div className="pchg">{card.transfer_partners.recent_changes}</div>
                )}
              </div>
            </div>

            {showPartnersModal && (
              <TransferPartnersModal
                partners={card.transfer_partners.partners ?? []}
                currency={card.points.currency}
                onClose={() => setShowPartnersModal(false)}
              />
            )}
          </div>
        )}

        {activeTab === "perks" && (
          <div role="tabpanel" id="panel-perks" aria-labelledby="tab-perks" style={{ marginTop: 24 }}>
            <div className="perkwrap">
              <div>
                {card.status_perks.length > 0 && (
                  <>
                    <span className="section-tag accent">Elite status</span>
                    <div className="chips">
                      {card.status_perks.map((perk) => (
                        <div key={perk.name} className="schip">
                          <div className="schip-top">
                            <span className="schip-name">{perk.name}</span>
                            <Pips strength={perk.strength} />
                          </div>
                          <p>{perk.note}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {card.additional_cards.options.length > 0 && (
                  <div style={{ marginTop: card.status_perks.length > 0 ? 22 : 0 }}>
                    {/* The note covers the whole group (on the Platinum it weighs
                    its two options against each other), so the "i" sits on the
                    section heading rather than on any one option. */}
                    <div className="section-tag-row">
                      <span className="section-tag muted">Additional cards</span>
                      {card.additional_cards.note && (
                        <button
                          type="button"
                          className="info-btn"
                          onClick={() => setShowAddCardsModal(true)}
                          aria-label="About additional cards"
                        >
                          i
                        </button>
                      )}
                    </div>
                    <div className="addcards" style={{ gridTemplateColumns: "1fr" }}>
                      {card.additional_cards.options.map((opt) => (
                        <div key={opt.name} className={`addcard ${opt.is_free ? "free" : ""}`}>
                          <div className="addcard-top">
                            <span className="addcard-name">{opt.name}</span>
                            <span className={`addcard-fee ${opt.is_free ? "free" : "paid"}`}>{opt.fee}</span>
                          </div>
                          <ul>
                            {opt.benefits.map((b, i) => (
                              <li key={i} className={b.included ? "" : "no"}>
                                {b.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    {showAddCardsModal && card.additional_cards.note && (
                      <InfoModal
                        category="Additional cards"
                        title={card.additional_cards.title || "Additional cards"}
                        titleId="addcards-modal-title"
                        onClose={() => setShowAddCardsModal(false)}
                      >
                        <p className="modal-what" style={{ margin: 0 }}>
                          {card.additional_cards.note}
                        </p>
                      </InfoModal>
                    )}
                  </div>
                )}
              </div>
              {card.services.length > 0 && (
                <div>
                  <span className="section-tag muted">Services &amp; perks</span>
                  <div className="svc-box">
                    {card.services.map((svc) => (
                      <div key={svc.name} className="svc-item">
                        <div className="sn">{svc.name}</div>
                        <div className="sd">{svc.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "insurance" && (
          <div role="tabpanel" id="panel-insurance" aria-labelledby="tab-insurance" style={{ marginTop: 24 }}>
            <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px", maxWidth: "70ch" }}>
              The value that isn't a credit — coverage carried by the card itself, from the
              issuer's own terms.
            </p>
            <div className="ins-grid">
              {card.insurance.slice(0, Math.ceil(card.insurance.length / 2)).map((item) => (
                <div key={item.coverage} className="ins-row">
                  <span className={`ins-dot ${INS_DOT_CLASS[item.level]}`} />
                  <span className="ik">{item.coverage}</span>
                  <span className="iv">{item.detail}</span>
                </div>
              ))}
              {card.insurance.slice(Math.ceil(card.insurance.length / 2)).map((item) => (
                <div key={item.coverage} className="ins-row">
                  <span className={`ins-dot ${INS_DOT_CLASS[item.level]}`} />
                  <span className="ik">{item.coverage}</span>
                  <span className="iv">{item.detail}</span>
                </div>
              ))}
            </div>
            {card.protection_note && (
              <p className="protect-note">{card.protection_note}</p>
            )}
            {card.rental_note && (
              <div className="rental-call">{card.rental_note}</div>
            )}
          </div>
        )}

        {activeTab === "fees" && (
          <div role="tabpanel" id="panel-fees" aria-labelledby="tab-fees" style={{ marginTop: 24 }}>
            <div className="rates-list">
              <div className="rates-row">
                <span className="rk">Purchase APR</span>
                <span className="rv">{formatAprRow(card.intro_apr_purchases, card.variable_apr)}</span>
              </div>
              <div className="rates-row">
                <span className="rk">Balance transfer APR</span>
                <span className="rv">
                  {formatAprRow(card.intro_apr_balance_transfers, card.balance_transfer_apr)}
                </span>
              </div>
              <div className="rates-row">
                <span className="rk">Balance transfer fee</span>
                <span className="rv">{card.balance_transfer_fee ?? "—"}</span>
              </div>
              <div className="rates-row">
                <span className="rk">Foreign transaction fee</span>
                <span className="rv">
                  {formatForeignTransactionFee(card.foreign_transaction_fee, card.foreign_transaction_fee_rate)}
                </span>
              </div>
              <div className="rates-row">
                <span className="rk">Cash advance APR</span>
                <span className="rv">{card.cash_advance_apr ?? "—"}</span>
              </div>
              <div className="rates-row">
                <span className="rk">Penalty APR</span>
                <span className="rv">{formatPenaltyApr(card.penalty_apr, card.penalty_apr_trigger)}</span>
              </div>
              {card.pay_over_time_fee && (
                <div className="rates-row">
                  <span className="rk">Pay Over Time fee</span>
                  <span className="rv">{card.pay_over_time_fee}</span>
                </div>
              )}
              <div className="rates-row">
                <span className="rk">Late payment fee</span>
                <span className="rv">{card.late_payment_fee ?? "—"}</span>
              </div>
              <div className="rates-row">
                <span className="rk">Returned payment fee</span>
                <span className="rv">{card.returned_payment_fee ?? "—"}</span>
              </div>
              <div className="rates-row">
                <span className="rk">Returned check fee</span>
                <span className="rv">{card.returned_check_fee ?? "—"}</span>
              </div>
            </div>
          </div>
        )}
      </Block>

      {/* Timeline */}
      <Block label="History" title="What changed, newest first">
        <ol className="timeline">
          {card.timeline.map((event) => (
            <li key={`${event.date}-${event.badge}`} className={`tnode ${event.type}`}>
              <div className="td">{event.date}</div>
              <div className="tt">
                {event.text}
                <span className="badge">{event.badge}</span>
              </div>
            </li>
          ))}
        </ol>
      </Block>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const { data: card, isLoading, isError, error } = useQuery({
    queryKey: ["card", id],
    queryFn: id ? () => fetchCard(id) : skipToken,
  });

  useEffect(() => {
    if (card) {
      trackEvent("view_card", { card_id: card.id, issuer: card.issuer });
      recordPageView("card_view", card.issuer, card.id);
    }
  }, [card]);

  // Built from the same helper the prerender pass uses, so the served HTML
  // and the client-set tags can't disagree. Stays undefined until the card
  // resolves, so a slow load never publishes a half-built title.
  const meta = card ? cardRouteMeta(card) : undefined;
  useSeo({ title: meta?.title, description: meta?.description, path: meta?.path });

  const is404 = error instanceof Error && error.message.includes("404");
  const issuer = card ? ISSUERS.find((i) => i.issuerField === card.issuer) : undefined;
  // Prefer the exact page we were linked from (an issuer page's card tile,
  // a Top Pick ranking cell, or a Compare Cards row all pass this via
  // router state) so state there — e.g. an active "Dining" filter, or the
  // current ?cards selection — survives going back, instead of resetting
  // to a generic default. Resolving the issuer from that URL (rather than
  // only from the card data) keeps the label in sync with the destination
  // while the card is still loading — otherwise backTo would already point
  // at e.g. "/issuer/chase" while backLabel still read "All issuers"
  // because `card`/`issuer` hadn't resolved yet.
  const stateFrom = (location.state as { from?: string } | null)?.from;
  const stateIssuer = getIssuerBySlug(stateFrom?.match(/^\/issuer\/([^/?]+)/)?.[1]);
  const resolvedIssuer = stateIssuer ?? issuer;
  const backTo = stateFrom ?? (resolvedIssuer ? `/issuer/${resolvedIssuer.slug}` : "/");
  const backLabel = stateFrom?.startsWith("/top-picks")
    ? "Top Pick"
    : stateFrom?.startsWith("/compare")
      ? "Compare Cards"
      : stateFrom?.startsWith("/cards/")
        ? "Back"
        : resolvedIssuer
          ? `${resolvedIssuer.label} cards`
          : "All issuers";

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
        <Link
          to={backTo}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--faint)",
            textDecoration: "none",
            marginBottom: 32,
            transition: "color .15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--faint)")}
        >
          ← {backLabel}
        </Link>

        {isLoading && <DetailSkeleton />}

        {isError && (
          <div
            style={{
              border: "1px solid rgba(242,112,138,.3)",
              borderRadius: 16,
              background: "rgba(242,112,138,.08)",
              padding: 24,
              color: "var(--red)",
            }}
          >
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
              {is404 ? "Card not found" : "Failed to load card"}
            </p>
            <p style={{ fontSize: 13.5, color: "var(--red)", margin: "0 0 12px" }}>
              {is404
                ? "This card doesn't exist. Check the URL or return to the dashboard."
                : error instanceof Error
                  ? error.message
                  : "Unknown error"}
            </p>
            <Link
              to="/"
              style={{ fontSize: 13, color: "var(--red)", textDecoration: "underline" }}
            >
              Back to all issuers
            </Link>
          </div>
        )}

        {card && <CardDetail card={card} />}
      </div>
    </div>
  );
}