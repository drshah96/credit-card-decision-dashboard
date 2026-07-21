import { useEffect, useMemo, useRef, useState } from "react";
import type { CardSummary } from "../types/cards";
import { ISSUERS } from "../utils/cardTaxonomy";

interface Props {
  cards: CardSummary[];
  excludeIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function CardPicker({ cards, excludeIds, onSelect, onClose }: Props) {
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = cards.filter((c) => !excludeIds.includes(c.id));
    const matching = q
      ? available.filter(
          (c) => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
        )
      : available;

    return ISSUERS.map((issuer) => ({
      issuer,
      cards: matching
        .filter((c) => c.issuer === issuer.issuerField)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.cards.length > 0);
  }, [cards, excludeIds, query]);

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
        {groups.length === 0 && <p className="card-picker-empty">No cards match "{query}".</p>}
        {groups.map(({ issuer, cards: groupCards }) => (
          <div key={issuer.slug} className="card-picker-group">
            <div className="card-picker-group-label">{issuer.label}</div>
            {groupCards.map((c) => (
              <button
                key={c.id}
                type="button"
                className="card-picker-result"
                onClick={() => onSelect(c.id)}
              >
                <span className="cpr-name">{c.name}</span>
                <span className="cpr-fee">{c.annual_fee === 0 ? "$0" : `$${c.annual_fee}/yr`}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
