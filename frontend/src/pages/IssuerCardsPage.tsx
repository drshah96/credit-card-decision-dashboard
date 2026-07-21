import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCard, fetchCards } from "../api/cards";
import { CardSummaryCard } from "../components/CardSummaryCard";
import { useCompareList } from "../hooks/useCompareList";
import type { Card, CardSummary } from "../types/cards";
import {
  ALL_CARDS_FILTER,
  brandTagsForCards,
  detailTags,
  getIssuerBySlug,
  groupCardsForAllView,
  orderChips,
  summaryTags,
} from "../utils/cardTaxonomy";

function CardTile({ card, selectMode }: { card: CardSummary; selectMode: boolean }) {
  return (
    <Link
      to={`/cards/${card.id}`}
      aria-label={`View ${card.name} details`}
      style={{ display: "block", height: "100%", textDecoration: "none" }}
    >
      <CardSummaryCard card={card} selectMode={selectMode} />
    </Link>
  );
}

function CardGrid({ cards, selectMode }: { cards: CardSummary[]; selectMode: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
      }}
    >
      {cards.map((card) => (
        <CardTile key={card.id} card={card} selectMode={selectMode} />
      ))}
    </div>
  );
}

export default function IssuerCardsPage() {
  const { issuerSlug } = useParams<{ issuerSlug: string }>();
  const issuer = getIssuerBySlug(issuerSlug);
  const [activeFilter, setActiveFilter] = useState<string>(ALL_CARDS_FILTER);
  const { compareIds, setCompareIds } = useCompareList();
  // Defaults to "on" whenever picks already exist (e.g. returning from a
  // card's detail page) — otherwise the toggle would misleadingly read
  // "Select cards" even though cards are, in fact, already selected.
  const [selectMode, setSelectMode] = useState(() => compareIds.length > 0);

  const { data: allCards, isLoading, isError, error } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const issuerCards = useMemo(
    () => (allCards ?? []).filter((c) => c.issuer === issuer?.issuerField),
    [allCards, issuer],
  );

  // Fetching full detail for every card in this issuer's lineup (at most 23
  // today) is what lets the behavioral filter chips (Dining, Gas, Lounge
  // Access, Balance Transfer, 0% Intro APR, No Foreign Transaction Fee) read
  // real data instead of being guessed — and it's all local API traffic, plus
  // react-query caches each result so opening a card afterward is instant.
  const detailQueries = useQueries({
    queries: issuerCards.map((c) => ({
      queryKey: ["card", c.id],
      queryFn: () => fetchCard(c.id),
    })),
  });

  const detailsById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const q of detailQueries) {
      if (q.data) map.set(q.data.id, q.data);
    }
    return map;
  }, [detailQueries]);

  const tagMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const addTag = (tag: string, cardId: string) => {
      if (!map.has(tag)) map.set(tag, new Set());
      map.get(tag)!.add(cardId);
    };
    for (const card of issuerCards) {
      for (const tag of summaryTags(card)) addTag(tag, card.id);
      const detail = detailsById.get(card.id);
      if (detail) for (const tag of detailTags(detail)) addTag(tag, card.id);
    }
    return map;
  }, [issuerCards, detailsById]);

  const brandTags = useMemo(() => brandTagsForCards(issuerCards), [issuerCards]);
  const chips = useMemo(
    () => orderChips(new Set(tagMap.keys()), brandTags),
    [tagMap, brandTags],
  );

  if (!issuer) {
    return (
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <p style={{ color: "var(--muted)" }}>Unknown issuer.</p>
        <Link to="/" style={{ color: "var(--accent)" }}>
          ← All issuers
        </Link>
      </div>
    );
  }

  const filteredCards =
    activeFilter === ALL_CARDS_FILTER
      ? issuerCards
      : issuerCards.filter((c) => tagMap.get(activeFilter)?.has(c.id));

  const sections = activeFilter === ALL_CARDS_FILTER ? groupCardsForAllView(issuerCards) : null;

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <Link
          to="/"
          style={{
            display: "inline-block",
            marginBottom: 24,
            fontSize: 13.5,
            color: "var(--faint)",
            textDecoration: "none",
          }}
        >
          ← All issuers
        </Link>

        <header style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: '"Fraunces Variable", serif',
              fontWeight: 600,
              fontSize: "clamp(28px, 4.2vw, 42px)",
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            {issuer.label} Cards
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14.5, margin: 0 }}>
            {issuerCards.length} {issuerCards.length === 1 ? "card" : "cards"}
          </p>
        </header>

        {isLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--panel-s)",
                  minHeight: 208,
                  animation: "pulse 1.5s ease-in-out infinite",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

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

        {!isLoading && !isError && (
          <>
            {/* Filter chips */}
            <div
              role="group"
              aria-label="Filter by"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 32,
              }}
            >
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveFilter(chip)}
                  aria-pressed={activeFilter === chip}
                  className={`filter-chip ${activeFilter === chip ? "active" : ""}`}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Once anything is picked, the toggle becomes "Remove Selection"
                (clears every pick) alongside a persistent Compare CTA —
                otherwise it's the plain Select/Done-selecting toggle. */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
              {compareIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCompareIds([]);
                    setSelectMode(false);
                  }}
                  className="filter-chip"
                >
                  Remove Selection
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectMode((v) => !v)}
                  aria-pressed={selectMode}
                  className={`filter-chip ${selectMode ? "active" : ""}`}
                >
                  {selectMode ? "Done selecting" : "Select cards"}
                </button>
              )}
              {compareIds.length > 0 && (
                <Link
                  to={`/compare?cards=${compareIds.join(",")}`}
                  className="compare-cta"
                >
                  Compare ({compareIds.length})
                </Link>
              )}
            </div>

            {/* All Cards: grouped sections. Otherwise: a flat filtered grid. */}
            {sections ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                {sections.map((section) => (
                  <div key={section.label}>
                    <div className="block-head">
                      <span className="lbl">{section.cards.length}</span>
                      <h3>{section.label}</h3>
                    </div>
                    <CardGrid cards={section.cards} selectMode={selectMode} />
                  </div>
                ))}
              </div>
            ) : filteredCards.length > 0 ? (
              <CardGrid cards={filteredCards} selectMode={selectMode} />
            ) : (
              <p style={{ color: "var(--faint)", fontSize: 14 }}>
                No cards match "{activeFilter}" yet — try another filter.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
