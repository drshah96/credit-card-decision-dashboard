import { useEffect, useMemo, useRef, useState } from "react";
import type { CardSummary } from "../types/cards";
import { excludeHiddenSecuredCards, groupCardsForPicker } from "../utils/cardTaxonomy";

interface Props {
  /** Already filtered by issuer/category/brand — see ComparePage's shared
   * CompareFilterBar. This component adds free-text search on top and does
   * the final ordering (grouped by issuer, ranked by category relevance
   * within each group — see `groupCardsForPicker`). */
  cards: CardSummary[];
  /** Currently-selected ids. Selected cards stay in the list and render
   * checked, rather than disappearing: this is a multi-select, so the list is
   * also how you deselect. */
  selectedIds: string[];
  /** The active Category filter(s), if any — needed here (not just upstream)
   * because it decides the sort order *within* each issuer group, not just
   * which cards are included. */
  categories: Set<string>;
  filterLabel: string;
  /** Rows are disabled once this many are selected, so the cap is enforced
   * where the user is looking rather than silently on submit. */
  maxSelected: number;
  /** Id of the "you're at the cap" explanation, attached to disabled rows so
   * the reason is announced rather than only shown. */
  capHintId?: string;
  onToggle: (id: string) => void;
  onClose: () => void;
}

function CardRow({
  card,
  checked,
  disabled,
  describedBy,
  onToggle,
}: {
  card: CardSummary;
  checked: boolean;
  disabled: boolean;
  describedBy?: string;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      aria-describedby={disabled ? describedBy : undefined}
      className={`card-picker-result${checked ? " is-selected" : ""}`}
      onClick={() => onToggle(card.id)}
    >
      <span className="cpr-check" aria-hidden="true">
        {checked ? "✓" : ""}
      </span>
      <span className="cpr-name">{card.name}</span>
      <span className="cpr-fee">{card.annual_fee === 0 ? "$0" : `$${card.annual_fee}/yr`}</span>
    </button>
  );
}

export function CardPicker({
  cards,
  selectedIds,
  categories,
  filterLabel,
  maxSelected,
  capHintId,
  onToggle,
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

  // Secured variants are hidden from every listing surface (see
  // excludeHiddenSecuredCards); selected cards are deliberately NOT filtered
  // out here, since unchecking them is the only way to remove one from inside
  // the picker.
  const available = useMemo(() => excludeHiddenSecuredCards(cards), [cards]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (c) => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    );
  }, [available, query]);

  const groups = useMemo(() => groupCardsForPicker(matches, categories), [matches, categories]);

  const atCap = selectedIds.length >= maxSelected;

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
            {groupCards.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <CardRow
                  key={c.id}
                  card={c}
                  checked={checked}
                  // At the cap, everything unselected is unclickable, but the
                  // selected ones stay live so you can swap without closing.
                  disabled={atCap && !checked}
                  describedBy={capHintId}
                  onToggle={onToggle}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
