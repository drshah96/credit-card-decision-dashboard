import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "./api/cards";
import { CardSummaryCard } from "./components/CardSummaryCard";

export default function App() {
  const { data: cards, isLoading, isError, error } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  return (
    <div className="min-h-screen bg-[#0A0D12] text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <p className="text-xs uppercase tracking-widest text-white/30 mb-3">
            The Wallet Audit
          </p>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Premium Card Dashboard
          </h1>
          <p className="text-white/50 max-w-xl">
            Compare your premium credit cards, see what each one is actually
            costing you, and decide what to keep.
          </p>
        </header>

        {/* States */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/5 h-52 animate-pulse"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            <p className="font-semibold mb-1">Failed to load cards</p>
            <p className="text-sm text-red-400/70">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <p className="text-sm text-red-400/50 mt-2">
              Make sure the backend is running:{" "}
              <code className="bg-red-500/10 px-1 rounded">
                uv run uvicorn backend.main:app --reload
              </code>
            </p>
          </div>
        )}

        {cards && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((card) => (
              <CardSummaryCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}