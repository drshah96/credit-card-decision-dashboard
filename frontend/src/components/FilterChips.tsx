interface Props {
  chips: string[];
  isActive: (chip: string) => boolean;
  onToggle: (chip: string) => void;
}

/** The pill-row filter UI used by IssuerCardsPage — renders `.filter-chip`
 * buttons and reports clicks via `onToggle`/`isActive` only; it has no
 * opinion on select-one vs. select-many, that logic lives entirely in the
 * caller (IssuerCardsPage uses it single-select today, replacing the one
 * active chip on each click), so a future multi-select caller can reuse it
 * as-is by passing a Set-backed `isActive`/`onToggle` instead. */
export function FilterChips({ chips, isActive, onToggle }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter by"
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onToggle(chip)}
          aria-pressed={isActive(chip)}
          className={`filter-chip ${isActive(chip) ? "active" : ""}`}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
