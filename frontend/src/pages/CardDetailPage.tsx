import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCard } from "../api/cards";
import { VERDICT_STYLES } from "../constants/styles";
import type {
  Card,
  Credit,
  CreditTier,
  Insurance,
  InsuranceLevel,
  TimelineEvent,
  TimelineEventType,
} from "../types/cards";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">
      {children}
    </h2>
  );
}

function CardPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-5 ${className}`}>
      {children}
    </div>
  );
}

// ─── Credits section ─────────────────────────────────────────────────────────

const TIER_LABELS: Record<CreditTier, string> = {
  easy: "Easy",
  plan: "Plan ahead",
  niche: "Niche",
};

const TIER_STYLES: Record<CreditTier, { badge: string; label: string }> = {
  easy: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "text-emerald-400" },
  plan: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "text-amber-400" },
  niche: { badge: "bg-white/5 text-white/40 border-white/10", label: "text-white/40" },
};

function CreditRow({ credit }: { credit: Credit }) {
  if (credit.removed) {
    return (
      <div className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0 opacity-40">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/60 line-through">{credit.name}</p>
          <p className="text-xs text-white/30 mt-0.5">{credit.subtitle}</p>
        </div>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
          Removed
        </span>
      </div>
    );
  }

  return (
    <details className="group border-b border-white/5 last:border-0">
      <summary
        className="flex items-start gap-4 py-3 cursor-pointer list-none"
        aria-label={`${credit.name}, ${TIER_LABELS[credit.tier]} credit, $${credit.max_annual} max per year`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">{credit.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded border ${TIER_STYLES[credit.tier].badge}`}>
              {TIER_LABELS[credit.tier]}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-0.5">{credit.subtitle}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-white">
            ${credit.max_annual}
          </p>
          <p className="text-xs text-white/30">max/yr</p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-white/30 group-open:rotate-180 transition-transform mt-1">
          ▾
        </span>
      </summary>
      <div className="pb-4 pl-0 space-y-3">
        <p className="text-sm text-white/60">{credit.description}</p>
        {credit.tips.length > 0 && (
          <ul className="space-y-1.5">
            {credit.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-xs text-white/50">
                <span aria-hidden="true" className="shrink-0 text-amber-400 mt-0.5">→</span>
                {tip}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function CreditsSection({ credits }: { credits: Credit[] }) {
  const active = credits.filter((c) => !c.removed);
  const removed = credits.filter((c) => c.removed);
  const tiers: CreditTier[] = ["easy", "plan", "niche"];

  return (
    <section>
      <SectionHeading>Credits & Benefits</SectionHeading>
      <CardPanel>
        {tiers.map((tier) => {
          const group = active.filter((c) => c.tier === tier);
          if (group.length === 0) return null;
          return (
            <div key={tier} className="mb-1">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 px-0 pt-2 ${TIER_STYLES[tier].label}`}>
                {TIER_LABELS[tier]}
              </p>
              {group.map((c) => (
                <CreditRow key={c.id} credit={c} />
              ))}
            </div>
          );
        })}
        {removed.map((c) => (
          <CreditRow key={c.id} credit={c} />
        ))}
      </CardPanel>
    </section>
  );
}

// ─── Earn rates ───────────────────────────────────────────────────────────────

function EarnRatesSection({ card }: { card: Card }) {
  return (
    <section>
      <SectionHeading>Earn Rates</SectionHeading>
      <CardPanel>
        <div className="space-y-2">
          {card.earn_rates.map((rate) => (
            <div
              key={rate.category}
              className={`flex items-center gap-3 ${rate.is_base ? "opacity-50" : ""}`}
            >
              <span aria-hidden="true" className="text-lg w-6 text-center">{rate.emoji}</span>
              <span className={`text-sm font-bold tabular-nums w-8 ${rate.highlight ? "text-emerald-400" : "text-white"}`}>
                {rate.multiplier}
              </span>
              <span className="text-sm text-white/70">{rate.category}</span>
            </div>
          ))}
        </div>
        {card.earn_note && (
          <p className="mt-4 text-xs text-white/40 border-t border-white/10 pt-3">
            {card.earn_note}
          </p>
        )}
      </CardPanel>
    </section>
  );
}

// ─── Points ───────────────────────────────────────────────────────────────────

function PointsSection({ card }: { card: Card }) {
  return (
    <section>
      <SectionHeading>Points Value</SectionHeading>
      <CardPanel>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-white/60">{card.points.currency}</p>
          <p className="text-sm font-semibold text-white">{card.points.per_100k} per 100k pts</p>
        </div>
        <div className="space-y-2">
          {card.points.redemption_options.map((opt) => (
            <div key={opt.method} className="flex items-center justify-between">
              <span className={`text-sm ${opt.best ? "text-white font-medium" : "text-white/50"}`}>
                {opt.method}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-sm tabular-nums font-semibold ${opt.best ? "text-emerald-400" : "text-white/50"}`}>
                  {opt.cpp}¢/pt
                </span>
                {opt.best && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Best
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {card.points.note && (
          <p className="mt-4 text-xs text-white/40 border-t border-white/10 pt-3">
            {card.points.note}
          </p>
        )}
      </CardPanel>
    </section>
  );
}

// ─── Transfer partners ────────────────────────────────────────────────────────

function TransferPartnersSection({ card }: { card: Card }) {
  const tp = card.transfer_partners;
  return (
    <section>
      <SectionHeading>Transfer Partners</SectionHeading>
      <CardPanel>
        <div className="flex gap-6 mb-4">
          <div>
            <p className="text-2xl font-bold text-white">{tp.airline_count}</p>
            <p className="text-xs text-white/40">Airlines</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{tp.hotel_count}</p>
            <p className="text-xs text-white/40">Hotels</p>
          </div>
        </div>
        <p className="text-sm text-white/60 mb-3">{tp.highlight}</p>
        {tp.recent_changes && (
          <p className="text-xs text-amber-400/70 border-t border-white/10 pt-3">
            <span role="img" aria-label="Warning">⚠</span> {tp.recent_changes}
          </p>
        )}
      </CardPanel>
    </section>
  );
}

// ─── Insurance ────────────────────────────────────────────────────────────────

const INSURANCE_DOT_FILL: Record<InsuranceLevel, string> = {
  strong: "bg-emerald-400",
  good: "bg-blue-400",
  mid: "bg-amber-400",
  none: "bg-white/10",
};

const INSURANCE_DOTS: Record<InsuranceLevel, number> = {
  strong: 4,
  good: 3,
  mid: 2,
  none: 0,
};

function InsuranceDots({ level }: { level: InsuranceLevel }) {
  const filled = INSURANCE_DOTS[level];
  return (
    <div role="img" aria-label={`Coverage level: ${level}`} className="flex gap-0.5">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${n <= filled ? INSURANCE_DOT_FILL[level] : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

function InsuranceSection({ card }: { card: Card }) {
  const active = card.insurance.filter((i: Insurance) => i.level !== "none");
  const missing = card.insurance.filter((i: Insurance) => i.level === "none");

  return (
    <section>
      <SectionHeading>Insurance & Protection</SectionHeading>
      <CardPanel>
        <div className="space-y-3">
          {active.map((item) => (
            <div key={item.coverage} className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{item.coverage}</p>
                <p className="text-xs text-white/40 mt-0.5">{item.detail}</p>
              </div>
              <InsuranceDots level={item.level} />
            </div>
          ))}
          {missing.map((item) => (
            <div key={item.coverage} className="flex items-start justify-between gap-4 opacity-35">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/50">{item.coverage}</p>
                <p className="text-xs text-white/30 mt-0.5">{item.detail}</p>
              </div>
              <InsuranceDots level={item.level} />
            </div>
          ))}
        </div>
        {card.protection_note && (
          <p className="mt-4 text-xs text-white/40 border-t border-white/10 pt-3">
            {card.protection_note}
          </p>
        )}
        {card.rental_note && (
          <p className="mt-2 text-xs text-amber-400/60">
            <span role="img" aria-label="Car rental">🚗</span> {card.rental_note}
          </p>
        )}
      </CardPanel>
    </section>
  );
}

// ─── Status perks ─────────────────────────────────────────────────────────────

function StatusPerksSection({ card }: { card: Card }) {
  return (
    <section>
      <SectionHeading>Status & Lounge Perks</SectionHeading>
      <CardPanel>
        <div className="space-y-4">
          {card.status_perks.map((perk) => (
            <div key={perk.name}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-white">{perk.name}</p>
                <div className="flex gap-0.5" aria-label={`Strength: ${perk.strength} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${n <= perk.strength ? "bg-amber-400" : "bg-white/10"}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-white/40">{perk.note}</p>
            </div>
          ))}
        </div>
      </CardPanel>
    </section>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────

function ServicesSection({ card }: { card: Card }) {
  if (card.services.length === 0) return null;
  return (
    <section>
      <SectionHeading>Included Services</SectionHeading>
      <CardPanel>
        <div className="space-y-3">
          {card.services.map((svc, i) => (
            <div key={svc.name} className={i > 0 ? "border-t border-white/5 pt-3" : ""}>
              <p className="text-sm font-medium text-white mb-0.5">{svc.name}</p>
              <p className="text-xs text-white/40">{svc.detail}</p>
            </div>
          ))}
        </div>
      </CardPanel>
    </section>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE_STYLES: Record<TimelineEventType, string> = {
  add: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cut: "bg-red-500/10 text-red-400 border-red-500/20",
  neutral: "bg-white/5 text-white/50 border-white/10",
  future: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const TIMELINE_LINE: Record<TimelineEventType, string> = {
  add: "bg-emerald-500/40",
  cut: "bg-red-500/40",
  neutral: "bg-white/10",
  future: "bg-blue-500/40",
};

function TimelineSection({ events }: { events: TimelineEvent[] }) {
  return (
    <section>
      <SectionHeading>Card Timeline</SectionHeading>
      <ol className="space-y-0">
        {events.map((event, i) => (
          <li key={`${event.date}-${event.badge}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div aria-hidden="true" className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${TIMELINE_LINE[event.type]}`} />
              {i < events.length - 1 && (
                <div aria-hidden="true" className="w-px flex-1 bg-white/5 mt-1" />
              )}
            </div>
            <div className="pb-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded border ${TIMELINE_STYLES[event.type]}`}>
                  {event.badge}
                </span>
                <span className="text-xs text-white/30">{event.date}</span>
              </div>
              <p className="text-sm text-white/60">{event.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading card details" className="space-y-6 animate-pulse">
      <div className="min-h-24 rounded-2xl bg-white/5" />
      <div className="min-h-48 rounded-2xl bg-white/5" />
      <div className="min-h-32 rounded-2xl bg-white/5" />
      <div className="min-h-40 rounded-2xl bg-white/5" />
    </div>
  );
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: card, isLoading, isError, error } = useQuery({
    queryKey: ["card", id],
    queryFn: id ? () => fetchCard(id) : skipToken,
  });

  const is404 =
    error instanceof Error && error.message.includes("404");

  return (
    <div className="min-h-screen bg-[#0A0D12] text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors mb-8"
        >
          <span aria-hidden="true">←</span> All cards
        </Link>

        {isLoading && <DetailSkeleton />}

        {isError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            <p className="font-semibold mb-1">
              {is404 ? "Card not found" : "Failed to load card"}
            </p>
            <p className="text-sm text-red-400/70">
              {is404
                ? "This card doesn't exist. Check the URL or return to the dashboard."
                : error instanceof Error
                  ? error.message
                  : "Unknown error"}
            </p>
            <Link
              to="/"
              className="inline-block mt-3 text-xs text-red-400/70 hover:text-red-300 underline"
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

function CardDetail({ card }: { card: Card }) {
  const netCost = card.annual_fee - card.total_max_credits;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <p className="text-xs uppercase tracking-widest text-white/30 mb-1">{card.issuer}</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">{card.name}</h1>
            <p className="text-white/40 mt-1">{card.points_program} · {card.network}</p>
          </div>
          <span
            className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${VERDICT_STYLES[card.verdict.status]}`}
          >
            {card.verdict.text}
          </span>
        </div>

        {/* Fee summary strip */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { label: "Annual fee", value: `$${card.annual_fee}` },
            { label: "Max credits", value: `$${card.total_max_credits}` },
            {
              label: "Best-case net",
              value: netCost <= 0 ? `+$${Math.abs(netCost)}` : `$${netCost}`,
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
            </div>
          ))}
        </div>
      </header>

      <CreditsSection credits={card.credits} />
      <EarnRatesSection card={card} />
      <PointsSection card={card} />
      <TransferPartnersSection card={card} />
      <InsuranceSection card={card} />
      {card.status_perks.length > 0 && <StatusPerksSection card={card} />}
      <ServicesSection card={card} />
      <TimelineSection events={card.timeline} />
    </div>
  );
}