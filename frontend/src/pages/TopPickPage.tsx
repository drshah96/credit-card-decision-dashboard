import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCards } from "../api/cards";
import { PageTabs } from "../components/PageTabs";
import { CARD_IMAGES } from "../utils/cardImages";
import { FilterChips } from "../components/FilterChips";
import { SlowLoadNotice } from "../components/SlowLoadNotice";
import { useSlowLoadWarning } from "../hooks/useSlowLoadWarning";
import { groupCardsForPicker, hiddenSecuredIds, ISSUERS } from "../utils/cardTaxonomy";
import { recordPageView } from "../utils/sessionTracking";
import {
  computeTopPicks,
  TOP_PICK_GROUPS,
  type TopPickEntry,
  type TopPickRow,
} from "../utils/topPickCategories";
import type { CardSummary } from "../types/cards";

const NO_CATEGORY_FILTER = new Set<string>();

function parseSelectedIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const ISSUER_FIELDS = ISSUERS.map((i) => i.issuerField);

/** A multi-select, searchable card picker — "which of MY cards is best for
 * each category" instead of the whole catalog. Reuses CardPicker's search +
 * issuer-grouped layout (via the same `groupCardsForPicker`, with no active
 * category so it just alphabetizes within each issuer group) but as
 * checkboxes rather than single-select, since someone's own wallet is
 * commonly more than the 4-card cap the Compare tab uses — kept as an
 * entirely separate selection/URL param from Compare's, rather than reusing
 * `useCompareList`, for exactly that reason.
 *
 * With 100+ cards in the catalog, search alone isn't enough to make picking
 * your own wallet fast: an Issuer chip row (reusing `FilterChips`, the same
 * component IssuerCardsPage uses) narrows the list before you're scanning
 * by name, already-checked cards get their own "Selected" section pinned
 * above the rest so you can review/remove them without re-finding them in a
 * long scroll, and the panel itself is bigger than a typical dropdown. */
function MyCardsFilter({
  allCards,
  selectedIds,
  onChange,
}: {
  allCards: CardSummary[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleIssuer = (issuer: string) => {
    const next = new Set(issuerFilter);
    if (next.has(issuer)) next.delete(issuer);
    else next.add(issuer);
    setIssuerFilter(next);
  };

  // Always shows every currently-selected card, regardless of the search/
  // issuer filter below — so unchecking one stays possible no matter how
  // you've since narrowed the list.
  const selectedCards = useMemo(
    () => allCards.filter((c) => selectedIds.has(c.id)),
    [allCards, selectedIds],
  );

  // Computed from the full catalog (not the already-filtered `matches` list
  // below) so a pair is reliably caught regardless of search/issuer filter —
  // see excludeHiddenSecuredCards's own doc comment for why.
  const hiddenSecured = useMemo(() => hiddenSecuredIds(allCards), [allCards]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCards.filter((c) => {
      if (selectedIds.has(c.id)) return false; // already shown in "Selected"
      // Not excludeHiddenSecuredCards here: an already-selected secured card
      // must stay pickable-off in "Selected" above even though it's hidden
      // from this browsable list.
      if (hiddenSecured.has(c.id)) return false;
      if (issuerFilter.size > 0 && !issuerFilter.has(c.issuer)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q);
    });
  }, [allCards, query, issuerFilter, selectedIds, hiddenSecured]);

  const groups = useMemo(
    () => groupCardsForPicker(matches, NO_CATEGORY_FILTER),
    [matches],
  );

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div ref={rootRef} className="top-pick-my-cards">
      <button
        type="button"
        className={`compare-filter-trigger ${selectedIds.size > 0 ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Choose Your Cards
        {selectedIds.size > 0 && <span className="compare-filter-count">{selectedIds.size}</span>}
        <span className="compare-filter-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="top-pick-my-cards-panel" role="group" aria-label="Choose your cards">
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
          <div className="top-pick-my-cards-issuers">
            <FilterChips
              chips={ISSUER_FIELDS}
              isActive={(issuer) => issuerFilter.has(issuer)}
              onToggle={toggleIssuer}
            />
          </div>
          <div className="card-picker-results">
            {selectedCards.length > 0 && (
              <div className="card-picker-group">
                <div className="card-picker-group-label">Selected ({selectedCards.length})</div>
                {selectedCards.map((c) => (
                  <label key={c.id} className="compare-filter-option">
                    <input type="checkbox" checked onChange={() => toggle(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            {groups.length === 0 && selectedCards.length === 0 && (
              <p className="card-picker-empty">No cards match "{query}".</p>
            )}
            {groups.map(({ label, cards: groupCards }) => (
              <div key={label} className="card-picker-group">
                <div className="card-picker-group-label">{label}</div>
                {groupCards.map((c) => (
                  <label key={c.id} className="compare-filter-option">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="compare-filter-clear"
              onClick={() => onChange(new Set())}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RankCell({ entry }: { entry: TopPickEntry | undefined }) {
  if (!entry) return <td className="top-pick-cell-empty">—</td>;
  const cardImage = CARD_IMAGES[entry.card.id];
  // A "%" rate normally already directly states cents earned per dollar, so
  // its effectiveValue always equals the displayed number — showing it
  // again would just be noise. Except when pooling has boosted it above
  // that raw label (e.g. Freedom Flex's displayed "5%" really means ~10.3¢
  // once pooled into a Sapphire Reserve account) — then the boosted number
  // is exactly the point, and hiding it would make the isPooled note below
  // meaningless.
  const showEffectiveValue = !entry.multiplier.includes("%") || entry.isPooled;
  return (
    <td>
      <Link
        to={`/cards/${entry.card.id}`}
        state={{ from: "/top-picks" }}
        className={`top-pick-card-link ${entry.isFallback ? "fallback" : ""}`}
      >
        {cardImage && <img src={cardImage} alt="" className="top-pick-card-art" />}
        <span className="top-pick-card-text">
          <span className="top-pick-issuer">{entry.card.issuer}</span>
          <span className="top-pick-name">{entry.card.name}</span>
          <span className="top-pick-value">
            {entry.multiplier}
            {showEffectiveValue && (
              <span className="top-pick-effective-value">
                {" "}
                ≈ {entry.effectiveValue.toFixed(1)}¢/$1
              </span>
            )}
          </span>
          {entry.isFallback && (
            <span className="top-pick-fallback-note">No category bonus</span>
          )}
          {entry.isPooled && (
            <span className="top-pick-pooled-note">Boosted by points pooling</span>
          )}
        </span>
      </Link>
    </td>
  );
}

/** A small "ⓘ" toggle next to the category label — click to reveal what the
 * category includes, click outside (or click again) to close. Reuses the
 * same toggle + click-outside pattern as CompareFilterBar's dropdowns.
 *
 * `openUpward` flips the panel above the trigger instead of below — used
 * for the last row in a section, which otherwise has nowhere within the
 * table's own height for a below-opening panel to fit. `.top-pick-table-wrap`
 * only scrolls horizontally (for narrow viewports); per the CSS overflow
 * spec, an element with overflow-x set to anything but visible forces its
 * overflow-y to compute as "auto" too, not "visible", even if overflow-y is
 * explicitly authored — so a panel escaping downward past the wrap's own
 * height triggers a vertical scrollbar there's no clean CSS-only way around
 * short of not needing to escape downward in the first place. */
function CategoryInfo({ row, openUpward }: { row: TopPickRow; openUpward: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <span ref={rootRef} className="top-pick-category-info">
      <button
        type="button"
        className="top-pick-info-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`What counts as ${row.label}`}
      >
        ⓘ
      </button>
      {open && (
        <div
          className={`top-pick-info-panel ${openUpward ? "up" : ""}`}
          role="tooltip"
        >
          {row.description}
        </div>
      )}
    </span>
  );
}

function GroupTable({ label, rows }: { label: string; rows: TopPickRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="block-head">
        <span className="lbl">{rows.length}</span>
        <h3>{label}</h3>
      </div>
      <div className="top-pick-table-wrap">
        <table className="top-pick-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Top Choice</th>
              <th scope="col">Runner-Up</th>
              <th scope="col">Honorable Mention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key}>
                <th scope="row" aria-label={row.label}>
                  <span className="top-pick-category-label">
                    <span aria-hidden="true">{row.emoji}</span> {row.label}
                  </span>
                  <CategoryInfo row={row} openUpward={i === rows.length - 1} />
                </th>
                <RankCell entry={row.topChoice} />
                <RankCell entry={row.runnerUp} />
                <RankCell entry={row.honorableMention} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TopPickPage() {
  const {
    data: allCards,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });
  const slowLoad = useSlowLoadWarning(isLoading);

  useEffect(() => {
    recordPageView("top_pick_view");
  }, []);

  // Lives in the URL (like Compare's ?cards=) rather than localStorage —
  // the whole interaction (open picker, select, see the table update)
  // happens on this one page, so there's no cross-page tray to sync with,
  // and this makes a "my cards, ranked" view shareable as a link.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIds = useMemo(() => parseSelectedIds(searchParams.get("cards")), [searchParams]);
  const setSelectedIds = (next: Set<string>) => {
    const params = new URLSearchParams(searchParams);
    if (next.size > 0) params.set("cards", [...next].join(","));
    else params.delete("cards");
    setSearchParams(params, { replace: true });
  };

  const scopedCards = useMemo(() => {
    if (!allCards) return [];
    if (selectedIds.size === 0) return allCards;
    return allCards.filter((c) => selectedIds.has(c.id));
  }, [allCards, selectedIds]);

  // Validated against the fetched catalog separately from scopedCards
  // above, since scopedCards deliberately falls back to the *whole*
  // catalog when nothing's selected (that's what "no scope" means for
  // ranking) — using it here would wrongly fire a selection event for
  // every card any time selectedIds is empty.
  const selectedCardIdsKey = (allCards ?? [])
    .filter((c) => selectedIds.has(c.id))
    .map((c) => c.id)
    .join(",");

  // Debounced so building "My Cards" one card at a time (pick 1, pick 2,
  // pick 3...) fires one top_pick_card_selected batch for the settled set
  // rather than one event per incremental pick — same debounce ComparePage
  // already uses for its own compare_cards GA4 event. One row per card
  // (not a single event carrying a list) to match how every other
  // selection/view event on this table works — see PageView's docstring
  // in backend/db_models.py.
  useEffect(() => {
    if (!selectedCardIdsKey) return;
    const ids = selectedCardIdsKey.split(",");
    const timeoutId = window.setTimeout(() => {
      for (const id of ids) recordPageView("top_pick_card_selected", undefined, id);
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [selectedCardIdsKey]);

  // Points pooling (Chase Freedom Flex/Unlimited inheriting a Sapphire
  // account's redemption value) only makes sense once we know which cards
  // someone actually holds — never applied to the whole-catalog default.
  const rows = allCards
    ? computeTopPicks(scopedCards, { applyPointsPooling: selectedIds.size > 0 })
    : [];

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
        <header style={{ marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: '"Fraunces Variable", serif',
              fontWeight: 600,
              fontSize: "clamp(22px, 3.2vw, 32px)",
              lineHeight: 1.15,
              margin: "0 0 14px",
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Top pick by category
          </h1>
          <p style={{ color: "var(--muted)", maxWidth: 640, fontSize: 15.5, margin: 0 }}>
            {selectedIds.size > 0
              ? `The best card among your ${selectedIds.size} selected cards for dining, groceries, gas, travel, and more.`
              : "The best credit card for dining, groceries, gas, travel, and more, ranked across our full catalog."}{" "}
            Click a card for caps, activation requirements, and real point values.
          </p>
        </header>

        <PageTabs active="topPicks" />

        {!isLoading && !isError && allCards && (
          <div className="top-pick-toolbar">
            <span className="top-pick-toolbar-text">
              <span className="top-pick-toolbar-label">
                {selectedIds.size > 0
                  ? `Scoped to ${selectedIds.size} of your cards`
                  : `Ranking all ${allCards.length} cards in the catalog`}
              </span>
              {selectedIds.size === 0 && (
                <span className="top-pick-toolbar-hint">
                  Add the credit cards you have, or ones you're considering, to compare their
                  real value.
                </span>
              )}
            </span>
            <MyCardsFilter allCards={allCards} selectedIds={selectedIds} onChange={setSelectedIds} />
          </div>
        )}

        {isLoading && (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid var(--line)",
              background: "var(--panel-s)",
              minHeight: 400,
              marginTop: 8,
              animation: "pulse 1.5s ease-in-out infinite",
              opacity: 0.6,
            }}
          />
        )}
        {isLoading && slowLoad && <SlowLoadNotice />}

        {isError && (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(242,112,138,.3)",
              background: "rgba(242,112,138,.08)",
              padding: 24,
              color: "var(--red)",
            }}
          >
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Failed to load cards</p>
            <p style={{ fontSize: 13.5, color: "var(--red)", margin: 0 }}>
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {!isLoading && !isError && selectedIds.size > 0 && scopedCards.length === 0 && (
          <p style={{ color: "var(--faint)", marginTop: 24, fontSize: 14.5 }}>
            None of your selected cards were found — they may have been renamed or removed.{" "}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                font: "inherit",
                color: "var(--accent)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Clear selection
            </button>
          </p>
        )}

        {!isLoading && !isError && (
          <div style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 8 }}>
            {TOP_PICK_GROUPS.map((group) => (
              <GroupTable
                key={group}
                label={group}
                rows={rows.filter((row) => row.group === group)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
