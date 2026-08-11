import { useState } from "react";
import type { CardSummary } from "../types/cards";
import { CardPicker } from "./CardPicker";

interface Props {
  selected: CardSummary[];
  selectedIds: string[];
  /** Already narrowed by the shared CompareFilterBar above. */
  pickerCards: CardSummary[];
  pickerCategories: Set<string>;
  pickerFilterLabel: string;
  max: number;
  onToggle: (id: string) => void;
}

/**
 * Card selection for /compare.
 *
 * Replaces four fixed "+ Add a card" slots. Those rendered the same four
 * things the comparison table's header already renders (art, issuer, name,
 * verdict), so every chosen card appeared on the page twice, and at
 * `min-height: 140px` in a single column below ~416px they cost roughly 608px
 * of empty boxes on a phone before any comparison was visible.
 *
 * They also weren't really slots: every slot's picker appended to the end of
 * the selection regardless of which one was clicked, so the positional layout
 * promised an addressability that didn't exist.
 *
 * The table below is now the only preview of what's selected. This is just the
 * control: one button carrying the count, and a chip per selection for
 * removal.
 */
export function CompareSelectionBar({
  selected,
  selectedIds,
  pickerCards,
  pickerCategories,
  pickerFilterLabel,
  max,
  onToggle,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = selected.length >= max;

  return (
    <div className="compare-select">
      <div className="compare-select-row">
        <button
          type="button"
          className="compare-select-add"
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
        >
          {selected.length === 0 ? "Select cards to compare" : "Add or remove cards"}
          <span className="compare-select-count">
            {selected.length} of {max}
          </span>
        </button>

        {selected.map((c) => (
          <span key={c.id} className="compare-chip">
            <span className="compare-chip-issuer">{c.issuer}</span>
            <span className="compare-chip-name">{c.name}</span>
            <button
              type="button"
              className="compare-chip-remove"
              onClick={() => onToggle(c.id)}
              aria-label={`Remove ${c.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {pickerOpen && (
        <div className="compare-select-picker">
          <CardPicker
            cards={pickerCards}
            selectedIds={selectedIds}
            categories={pickerCategories}
            filterLabel={pickerFilterLabel}
            maxSelected={max}
            onToggle={(id) => {
              onToggle(id);
              // Close on the selection that fills the last slot. Only on the
              // way up: unchecking at the cap, or checking after having
              // removed one, should leave the picker open.
              if (!selectedIds.includes(id) && selectedIds.length + 1 >= max) {
                setPickerOpen(false);
              }
            }}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {full && !pickerOpen && (
        <p className="compare-select-hint">
          Remove a card to swap in a different one.
        </p>
      )}
    </div>
  );
}
