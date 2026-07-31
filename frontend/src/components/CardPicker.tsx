import { useEffect, useMemo, useRef, useState } from "react";
import type { CardSummary } from "../types/cards";
import { excludeHiddenSecuredCards, groupCardsForPicker } from "../utils/cardTaxonomy";

interface Props {
  /** Already filtered by issuer/category/brand — see ComparePage's shared
   * CompareFilterBar. This component adds free-text search on top and does
   * the final ordering (grouped by issuer, ranked by category relevance
   * within each group — see `groupCardsForPicker`). */
  cards: CardSummary[];
  excludeIds: string[];
  /** The active Category filter(s), if any — needed here (not just upstream)
   * because it decides the sort order *within* each issuer group, not just
   * which cards are included. */
  categories: Set<string>;
  filterLabel: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function CardRow({ card, onSelect }: { card: CardSummary; onSelect: (id: string) => void }) {
  return (
    <button type="button" className="card-picker-result" onClick={() => onSelect(card.id)}>
      <span className="cpr-name">{card.name}</span>
      <span className="cpr-fee">{card.annual_fee === 0 ? "$0" : `$${card.annual_fee}/yr`}</span>
    </button>
  );
}

export function CardPicker({
  cards,
  excludeIds,
  categories,
  filterLabel,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const available = useMemo(
    () => excludeHiddenSecuredCards(cards.filter((c) => !excludeIds.includes(c.id))),
    [cards, excludeIds],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (c) => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    );
  }, [available, query]);

  const groups = useMemo(
    () => groupCardsForPicker(matches, categories),
    [matches, categories],
  );

  return (
    <div
      ref={rootRef}
      className="card-picker"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="card-picker-search">
        <input
          type="text"
          autoFocus
          placeholder="Search by card name or bank…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search cards"
        />
        <button type="button" onClick={onClose} aria-label="Close card picker">
          ×
        </button>
      </div>
      <div className="card-picker-results">
        {groups.length === 0 && (
          <p className="card-picker-empty">
            {query
              ? `No cards match "${query}"${filterLabel ? ` in ${filterLabel}` : ""}.`
              : `No cards match "${filterLabel}".`}
          </p>
        )}
        {groups.map(({ label, cards: groupCards }) => (
          <div key={label} className="card-picker-group">
            <div className="card-picker-group-label">{label}</div>
            {groupCards.map((c) => (
              <CardRow key={c.id} card={c} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
