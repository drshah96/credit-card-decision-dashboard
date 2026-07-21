import { VERDICT_STYLES } from "../constants/styles";
import { useCompareList } from "../hooks/useCompareList";
import { CARD_IMAGES } from "../utils/cardImages";
import type { CardSummary } from "../types/cards";

interface Props {
  card: CardSummary;
}

// Source data mixes word order ("VISA INFINITE" vs "WORLD ELITE MASTERCARD"),
// so pull the brand out by keyword instead of splitting on the first word.
const NETWORK_BRANDS = ["VISA", "MASTERCARD", "AMERICAN EXPRESS", "DISCOVER"];

function splitNetwork(network: string): { brand: string; tier: string | null } {
  // Closed-loop store cards ("PROPRIETARY (Goodyear / Citi Retail Services —
  // closed-loop, not Visa or Mastercard)") are a full explanatory sentence,
  // not a brand code — the footer only has room for the short form.
  if (network.startsWith("PROPRIETARY")) return { brand: "Proprietary", tier: null };
  const brand = NETWORK_BRANDS.find((b) => network.includes(b));
  if (!brand) return { brand: network, tier: null };
  const tier = network.replace(brand, "").trim();
  return { brand, tier: tier || null };
}

export function CardSummaryCard({ card }: Props) {
  const netCost = card.annual_fee - card.total_max_credits;
  const cardImage = CARD_IMAGES[card.id];
  const { brand, tier } = splitNetwork(card.network);
  const { compareIds, addCard, removeCard, maxCompare } = useCompareList();
  const isCompared = compareIds.includes(card.id);
  const compareFull = compareIds.length >= maxCompare && !isCompared;

  return (
    <div className="h-full rounded-2xl border border-black/10 bg-black/[0.02] p-6 flex flex-col gap-4 hover:border-black/20 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-black/40 mb-1">
            {card.issuer}
          </p>
          <h2 className="text-xl font-semibold text-black">{card.name}</h2>
          <p className="text-sm text-black/50 mt-0.5">{card.points_program}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 max-w-[45%]">
          <span
            className={`text-right text-xs font-semibold px-3 py-1 rounded-lg border leading-snug ${cardImage ? "min-h-[26px]" : ""} ${VERDICT_STYLES[card.verdict.status]}`}
          >
            {card.verdict.short_tag ?? card.verdict.text}
          </span>
          {cardImage && (
            <img
              src={cardImage}
              alt=""
              className="h-16 w-auto max-w-24 rounded-md shadow-[0_8px_16px_-8px_rgba(15,23,42,0.35)]"
            />
          )}
          <button
            type="button"
            aria-pressed={isCompared}
            aria-label={isCompared ? `Remove ${card.name} from compare` : `Add ${card.name} to compare`}
            disabled={compareFull}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isCompared) removeCard(card.id);
              else if (!compareFull) addCard(card.id);
            }}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
              isCompared
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                : compareFull
                  ? "bg-black/[0.02] text-black/25 border-black/10 cursor-not-allowed"
                  : "bg-black/[0.02] text-black/50 border-black/10 hover:text-black hover:border-black/20"
            }`}
          >
            {isCompared ? "✓ Compare" : "+ Compare"}
          </button>
        </div>
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
      <div className="mt-auto pt-3 border-t border-black/10 flex items-start justify-between gap-3 text-xs text-black/40">
        <span className="shrink-0 leading-snug">
          {brand}
          {tier && (
            <>
              <br />
              <span className="text-black/30">{tier}</span>
            </>
          )}
        </span>
        <span className="min-w-0 text-right">{card.effective_cost}</span>
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
    ? "text-emerald-700"
    : negative
      ? "text-red-700"
      : muted
        ? "text-black/30"
        : "text-black";

  return (
    <div>
      <p className="text-xs text-black/40 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}