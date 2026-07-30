import { useEffect, useMemo, useRef, useState } from "react";
import type { CardSummary } from "../types/cards";
import {
  brandTagsForCards,
  filterByBrands,
  filterByCategories,
  filterByIssuers,
  ISSUERS,
  STRUCTURAL_CHIP_ORDER,
  summaryTags,
} from "../utils/cardTaxonomy";

interface Props {
  cards: CardSummary[];
  issuers: Set<string>;
  onIssuersChange: (issuers: Set<string>) => void;
  brands: Set<string>;
  onBrandsChange: (brands: Set<string>) => void;
  categories: Set<string>;
  onCategoriesChange: (categories: Set<string>) => void;
}

/** Drops any selected option no longer present in its own options list (e.g.
 * a brand selection that a newly-added issuer/category filter has narrowed
 * out) — every dropdown does this for itself so a stale pick never silently
 * lingers pinned to a combination that can now only ever match zero cards. */
function useDropStale(
  options: string[],
  selected: Set<string>,
  onChange: (next: Set<string>) => void,
) {
  useEffect(() => {
    const stale = [...selected].filter((v) => !options.includes(v));
    if (stale.length === 0) return;
    const next = new Set(selected);
    for (const v of stale) next.delete(v);
    onChange(next);
    // Only re-check when the option list itself changes — `selected`/`onChange`
    // are read for their current value, not depended on, so clearing a stale
    // pick here can't retrigger this same effect on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  };

  return (
    <div ref={rootRef} className="compare-filter-dropdown">
      <button
        type="button"
        className={`compare-filter-trigger ${selected.size > 0 ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
        {selected.size > 0 && <span className="compare-filter-count">{selected.size}</span>}
        <span className="compare-filter-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="compare-filter-panel" role="group" aria-label={`Filter by ${label}`}>
          {options.length === 0 && (
            <p className="compare-filter-panel-empty">No options match the other filters.</p>
          )}
          {options.map((option) => (
            <label key={option} className="compare-filter-option">
              <input
                type="checkbox"
                checked={selected.has(option)}
                onChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              className="compare-filter-clear"
              onClick={() => onChange(new Set())}
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A single shared filter bar above all four compare slots — set Issuer,
 * Category, and Brand (all multi-select, OR'd within a filter and AND'd
 * across them) once, and every "+ Add a card" picker respects it instead of
 * each slot re-filtering independently.
 *
 * Every dropdown's options are computed from the *other two* filters only
 * (never its own current selection) — e.g. Issuer's options come from cards
 * matching the selected Brand(s) and Categories, so picking "Marriott Bonvoy"
 * narrows Issuer down to just Chase/Amex, not all 8. Fully symmetric: the
 * same is true for Brand (scoped by Issuer+Category) and Category (scoped by
 * Issuer+Brand). */
export function CompareFilterBar({
  cards,
  issuers,
  onIssuersChange,
  brands,
  onBrandsChange,
  categories,
  onCategoriesChange,
}: Props) {
  const issuerOptions = useMemo(() => {
    const scoped = filterByCategories(filterByBrands(cards, brands), categories);
    const present = new Set(scoped.map((c) => c.issuer));
    return ISSUERS.map((i) => i.issuerField).filter((f) => present.has(f));
  }, [cards, brands, categories]);

  const brandOptions = useMemo(() => {
    const scoped = filterByCategories(filterByIssuers(cards, issuers), categories);
    return [...brandTagsForCards(scoped)].sort((a, b) => a.localeCompare(b));
  }, [cards, issuers, categories]);

  const categoryOptions = useMemo(() => {
    const scoped = filterByBrands(filterByIssuers(cards, issuers), brands);
    const present = new Set<string>();
    for (const card of scoped) for (const tag of summaryTags(card)) present.add(tag);
    return STRUCTURAL_CHIP_ORDER.filter((t) => present.has(t)).sort((a, b) => a.localeCompare(b));
  }, [cards, issuers, brands]);

  useDropStale(issuerOptions, issuers, onIssuersChange);
  useDropStale(brandOptions, brands, onBrandsChange);
  useDropStale(categoryOptions, categories, onCategoriesChange);

  return (
    <div className="compare-filter-bar">
      <MultiSelectDropdown
        label="Issuer"
        options={issuerOptions}
        selected={issuers}
        onChange={onIssuersChange}
      />
      <MultiSelectDropdown
        label="Category"
        options={categoryOptions}
        selected={categories}
        onChange={onCategoriesChange}
      />
      <MultiSelectDropdown
        label="Brand"
        options={brandOptions}
        selected={brands}
        onChange={onBrandsChange}
      />
    </div>
  );
}
