import type { CardSummary } from "../types/cards";

const VERDICT_STYLES = {
  keep: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  situational: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  reconsider: "bg-red-500/10 text-red-400 border-red-500/30",
};

interface Props {
  card: CardSummary;
}

export function CardSummaryCard({ card }: Props) {
  const netCost = card.annual_fee - card.total_max_credits;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4 hover:border-white/20 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
            {card.issuer}
          </p>
          <h2 className="text-xl font-semibold text-white">{card.name}</h2>
          <p className="text-sm text-white/50 mt-0.5">{card.points_program}</p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${VERDICT_STYLES[card.verdict.status]}`}
        >
          {card.verdict.text}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Annual fee" value={`$${card.annual_fee}`} />
        <Stat
          label="Max credits"
          value={`$${card.total_max_credits}`}
          muted={card.total_max_credits === 0}
        />
        <Stat
          label="Best-case net"
          value={netCost <= 0 ? `+$${Math.abs(netCost)}` : `$${netCost}`}
          positive={netCost <= 0}
          negative={netCost > 0}
        />
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
        <span>{card.network}</span>
        <span>{card.effective_cost}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
  muted,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  const valueColor = positive
    ? "text-emerald-400"
    : negative
      ? "text-red-400"
      : muted
        ? "text-white/30"
        : "text-white";

  return (
    <div>
      <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}