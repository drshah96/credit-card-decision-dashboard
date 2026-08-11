import { useEffect, useMemo, useRef, useState } from "react";
import type { CardSummary } from "../types/cards";
import { excludeHiddenSecuredCards, groupCardsForPicker } from "../utils/cardTaxonomy";

interface Props {
  /** Already narrowed by the Issuer/Category/Brand filters beside this one. */
  cards: CardSummary[];
  selectedIds: string[];
  /** Selected cards resolved to summaries. Passed in rather than derived here
   * so a card that survives in the URL but not the current filters still shows
   * as selected and can be removed. */
  selected: CardSummary[];
  /** Decides ordering *within* each issuer group, not just membership. */
  categories: Set<string>;
  max: number;
  onToggle: (id: string) => void;
}

/**
 * Card selection for /compare.
 *
 * Deliberately the same control as TopPickPage's "My Cards": the same trigger,
 * count badge and caret as the Issuer/Category/Brand filters beside it, with
 * selected cards pinned to the top of the list under a "Selected" heading.
 *
 * It does not display the chosen cards anywhere. The comparison table below is
 * already a full-width, per-card breakdown with art, issuer, name and verdict,
 * so any summary here is the same information twice. Two earlier versions of
 * this page did exactly that: four slots showing art/issuer/name/verdict, then
 * chips showing issuer/name. Both were the table's own header, restated.
 *
 * It is a filter in appearance only. Issuer, Category and Brand narrow an
 * already-useful page; this one is the page's input, and with nothing selected
 * there is no comparison at all, which is what `is-required` marks.
 */
export function CompareCardSelect({
  cards,
  selectedIds,
  selected,
  categories,
  max,
  onToggle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const atCap = selectedIds.length >= max;

  // Selected cards are listed separately above, so drop them from the groups
  // rather than rendering each one twice.
  const unselected = useMemo(
    () => excludeHiddenSecuredCards(cards).filter((c) => !selectedIds.includes(c.id)),
    [cards, selectedIds],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return unselected;
    return unselected.filter(
      (c) => c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    );
  }, [unselected, query]);

  const groups = useMemo(() => groupCardsForPicker(matches, categories), [matches, categories]);

  return (
    <div
      ref={rootRef}
      className="compare-filter-dropdown"
      // The old picker closed on Escape and a test pinned it; keep that.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
    >
      <button
        type="button"
        className={`compare-filter-trigger${selectedIds.length > 0 ? " active" : " is-required"}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Cards
        {selectedIds.length > 0 && (
          <span className="compare-filter-count">{selectedIds.length}</span>
        )}
        <span className="compare-filter-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="compare-filter-panel" role="group" aria-label="Choose cards to compare">
          <div className="card-picker-search">
            <input
              type="text"
              autoFocus
              placeholder="Search by card name or bank…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search cards"
            />
          </div>

          <div className="card-picker-results">
            {selected.length > 0 && (
              <div className="card-picker-group">
                <div className="card-picker-group-label">
                  Selected ({selected.length} of {max})
                </div>
                {selected.map((c) => (
                  <label key={c.id} className="compare-filter-option">
                    <input type="checkbox" checked onChange={() => onToggle(c.id)} />
                    <span className="cpr-name">{c.name}</span>
                    <span className="cpr-fee">
                      {c.annual_fee === 0 ? "$0" : `$${c.annual_fee}/yr`}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {atCap && (
              <p className="card-picker-empty" id="compare-cap-hint">
                {max} selected, the maximum. Uncheck one to swap in another.
              </p>
            )}

            {!atCap && groups.length === 0 && (
              <p className="card-picker-empty">
                {query ? `No other cards match "${query}".` : "No other cards match these filters."}
              </p>
            )}

            {!atCap &&
              groups.map(({ label, cards: groupCards }) => (
                <div key={label} className="card-picker-group">
                  <div className="card-picker-group-label">{label}</div>
                  {groupCards.map((c) => (
                    <label key={c.id} className="compare-filter-option">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => {
                          onToggle(c.id);
                          // Close on the pick that fills the last place. Only
                          // on the way up: unchecking is a swap in progress.
                          if (selectedIds.length + 1 >= max) setOpen(false);
                        }}
                      />
                      <span className="cpr-name">{c.name}</span>
                      <span className="cpr-fee">
                        {c.annual_fee === 0 ? "$0" : `$${c.annual_fee}/yr`}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
