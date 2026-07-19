import { useState, useEffect, useRef, type ReactNode } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCard } from "../api/cards";
import type {
  Card,
  Credit,
  CreditTier,
  InsuranceLevel,
} from "../types/cards";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_LABELS: Record<CreditTier, string> = {
  easy: "Effortless",
  plan: "Plan a little",
  niche: "Niche",
};

const TIER_SUBS: Record<CreditTier, string> = {
  easy: "auto or unavoidable",
  plan: "timed — partial use likely",
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

  if (credit.removed) {
    return (
      <div className={`credit-card t-${credit.tier} removed`}>
        <div className="credit-r1">
          <button
            type="button"
            className="credit-name-btn"
            onClick={() => onOpenModal(credit, credit.tier)}
          >
            {credit.name}
            <i className="info-icon" aria-hidden="true">i</i>
          </button>
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 100,
              background: "rgba(242,112,138,0.12)",
              color: "var(--red)",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Removed
          </span>
        </div>
        <div className="credit-sub">{credit.subtitle}</div>
      </div>
    );
  }

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

// ─── Credit calculator ────────────────────────────────────────────────────────

function CreditCalculator({
  totalUsed,
  annualFee,
  onReset,
}: {
  totalUsed: number;
  annualFee: number;
  onReset: () => void;
}) {
  const net = totalUsed - annualFee;
  const scale = Math.max(annualFee, totalUsed, 1);
  const fillPct = Math.min((totalUsed / scale) * 100, 100);
  const markerPct = Math.min((annualFee / scale) * 100, 100);

  let verdict: ReactNode;
  if (net >= 0) {
    verdict = (
      <>With your inputs, the credits alone <b>more than cover the fee</b> — you're ahead ${net} before you count points, lounges, or insurance.</>
    );
  } else if (totalUsed >= annualFee * 0.6) {
    verdict = (
      <>Credits recoup <b>most</b> of the fee (${totalUsed} of ${annualFee}). Whether it's worth it comes down to how much you value the lounges, points and insurance on top.</>
    );
  } else {
    verdict = (
      <>Credits only recoup <b>${totalUsed} of ${annualFee}</b>. You'd be paying ${Math.abs(net)} for the lounges, points and status — make sure those are worth it to you.</>
    );
  }

  return (
    <div className="calc">
      <div className="calc-top">
        <h4>Will the credits offset the ${annualFee} fee?</h4>
        <button type="button" className="calc-reset" onClick={onReset}>
          Reset sliders
        </button>
      </div>
      <div className="calc-nums">
        <div className="calc-cell">
          <div className="cl">Credits you'll use</div>
          <div className="cv pos">${totalUsed}</div>
        </div>
        <div className="calc-cell">
          <div className="cl">Annual fee</div>
          <div className="cv" style={{ color: "var(--muted)" }}>${annualFee}</div>
        </div>
        <div className="calc-cell">
          <div className="cl">{net >= 0 ? "Ahead by" : "Short by"}</div>
          <div className={`cv ${net >= 0 ? "pos" : "neg"}`}>
            {net >= 0 ? "+" : "−"}${Math.abs(net)}
          </div>
        </div>
      </div>
      <div
        className="calc-bar"
        role="progressbar"
        aria-valuenow={Math.min(totalUsed, annualFee)}
        aria-valuemin={0}
        aria-valuemax={annualFee}
        aria-label={`$${totalUsed} of $${annualFee} fee covered by credits`}
      >
        <div className="cbfill" style={{ width: `${fillPct}%` }} />
        <div className="cbmark" style={{ left: `${markerPct}%` }} />
      </div>
      <div className="calc-verdict">{verdict}</div>
      <div className="calc-disc">
        Counts statement credits + cash-like perks only (not points earning, lounge value, or insurance).
        Move the sliders to match your real usage. The white line marks the annual fee.
      </div>
    </div>
  );
}

// ─── Credits section ──────────────────────────────────────────────────────────

function CreditsSection({ credits, annualFee }: { credits: Credit[]; annualFee: number }) {
  const active = credits.filter((c) => !c.removed);
  const removed = credits.filter((c) => c.removed);

  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(active.map((c) => [c.id, c.default_value])),
  );
  const [tiers, setTiers] = useState<Record<string, CreditTier>>(
    () => Object.fromEntries(active.map((c) => [c.id, c.tier])),
  );
  const [modal, setModal] = useState<{ credit: Credit; tier: CreditTier } | null>(null);

  function handleSlider(id: string, v: number) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  function handleTierMove(id: string, dir: "up" | "down") {
    setTiers((prev) => {
      const cur = TIER_ORDER.indexOf(prev[id] ?? "niche");
      const next = dir === "up" ? Math.max(0, cur - 1) : Math.min(2, cur + 1);
      return { ...prev, [id]: TIER_ORDER[next] };
    });
  }

  function handleReset() {
    setValues(Object.fromEntries(active.map((c) => [c.id, c.default_value])));
    setTiers(Object.fromEntries(active.map((c) => [c.id, c.tier])));
  }

  function handleOpenModal(credit: Credit, tier: CreditTier) {
    setModal({ credit, tier });
  }

  const totalUsed = active.reduce((sum, c) => sum + (values[c.id] ?? 0), 0);

  const tierGroups: Record<CreditTier, Credit[]> = { easy: [], plan: [], niche: [] };
  active.forEach((c) => {
    const t = tiers[c.id] ?? c.tier;
    tierGroups[t].push(c);
  });

  return (
    <>
      <p className="credit-intro">
        Drag each slider to the amount you'll <b>actually</b> capture. Use the{" "}
        <b>▲▼</b> arrows to move a credit between tiers for <i>your</i> life —
        Resy might be effortless for you and niche for someone else. The calculator below
        tallies it against the fee.
      </p>

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
                      onSlider={handleSlider}
                      onTierMove={handleTierMove}
                      onOpenModal={handleOpenModal}
                    />
                  ))
                ) : (
                  <div className="credit-hint" style={{ padding: "8px 2px" }}>— none here —</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {removed.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          {removed.map((c) => (
            <div key={c.id} style={{ marginTop: 9 }}>
              <CreditRow
                credit={c}
                value={0}
                tierIdx={TIER_ORDER.indexOf(c.tier)}
                onSlider={() => {}}
                onTierMove={() => {}}
                onOpenModal={handleOpenModal}
              />
            </div>
          ))}
        </div>
      )}

      <CreditCalculator
        totalUsed={totalUsed}
        annualFee={annualFee}
        onReset={handleReset}
      />

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

// ─── Section block ────────────────────────────────────────────────────────────

function Block({
  label,
  title,
  note,
  children,
}: {
  label: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 36 }}>
      <div className="block-head">
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

// ─── Card detail ──────────────────────────────────────────────────────────────

function CardDetail({ card }: { card: Card }) {
  const netCost = card.annual_fee - card.total_max_credits;

  return (
    <div>
      {/* Hero */}
      <header style={{ paddingTop: 12 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 6,
          }}
        >
          <div>
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
            <h2
              style={{
                fontFamily: '"Fraunces Variable", serif',
                fontWeight: 600,
                fontSize: "clamp(26px, 3.5vw, 34px)",
                margin: "0 0 3px",
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              {card.name}
            </h2>
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
          </div>
          <div className={`verdict-badge ${card.verdict.status}`}>
            {card.verdict.text}
          </div>
        </div>

        {/* Fee stat row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, margin: "4px 0 0" }}>
          {[
            { k: "Annual fee", v: `$${card.annual_fee}` },
            { k: "Max credits", v: `$${card.total_max_credits}` },
            {
              k: "Best-case net",
              v: netCost <= 0 ? `+$${Math.abs(netCost)}` : `$${netCost}`,
            },
            { k: "Effective cost", v: card.effective_cost },
          ].map(({ k, v }) => (
            <div key={k}>
              <div
                style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--faint)" }}
              >
                {k}
              </div>
              <div
                style={{ fontFamily: '"Fraunces Variable", serif', fontSize: 22, fontWeight: 600, marginTop: 2, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Earning */}
      <Block label="Earning" title="How you earn points" note="per $1">
        <div className="earn-grid">
          {card.earn_rates.map((rate) => (
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
      </Block>

      {/* Points value */}
      <Block label="Value" title="What your points are worth" note="cents per point">
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
          <div className="panel-box partners">
            <div className="pt">Transfer partners</div>
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
      </Block>

      {/* Credits */}
      <Block label="Credits" title="Credits — set what you'll really use">
        <CreditsSection credits={card.credits} annualFee={card.annual_fee} />
      </Block>

      {/* Additional cards */}
      {card.additional_cards.options.length > 0 && (
        <Block label="Cards" title="Adding a partner or family — additional cards">
          <div className="addcards">
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
          {card.additional_cards.note && (
            <p className="addcard-foot">{card.additional_cards.note}</p>
          )}
        </Block>
      )}

      {/* Insurance */}
      <Block label="Protection" title="Insurance & protections" note="the value that isn't a credit">
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
      </Block>

      {/* Status, perks & services */}
      {(card.status_perks.length > 0 || card.services.length > 0) && (
        <Block label="Perks & status" title="Status, perks & services">
          <div className="perkwrap">
            {card.status_perks.length > 0 && (
              <div>
                <div>
                  <span className="section-tag accent">Elite status</span>
                </div>
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
              </div>
            )}
            {card.services.length > 0 && (
              <div>
                <div>
                  <span className="section-tag muted">Services &amp; perks</span>
                </div>
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
        </Block>
      )}

      {/* Timeline */}
      <Block label="History" title="What changed — newest first">
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

  const { data: card, isLoading, isError, error } = useQuery({
    queryKey: ["card", id],
    queryFn: id ? () => fetchCard(id) : skipToken,
  });

  const is404 = error instanceof Error && error.message.includes("404");

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <Link
          to="/"
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
          ← All cards
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
            <p style={{ fontSize: 13.5, color: "rgba(242,112,138,.7)", margin: "0 0 12px" }}>
              {is404
                ? "This card doesn't exist. Check the URL or return to the dashboard."
                : error instanceof Error
                  ? error.message
                  : "Unknown error"}
            </p>
            <Link
              to="/"
              style={{ fontSize: 13, color: "rgba(242,112,138,.6)", textDecoration: "underline" }}
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {card && <CardDetail card={card} />}
      </div>
    </div>
  );
}