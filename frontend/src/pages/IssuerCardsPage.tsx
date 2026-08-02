import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { fetchCardDetails, fetchCards } from "../api/cards";
import { CardSummaryCard } from "../components/CardSummaryCard";
import { FilterChips } from "../components/FilterChips";
import { SlowLoadNotice } from "../components/SlowLoadNotice";
import { useCompareList } from "../hooks/useCompareList";
import { useSlowLoadWarning } from "../hooks/useSlowLoadWarning";
import type { Card, CardSummary } from "../types/cards";
import {
  ALL_CARDS_FILTER,
  brandTagsForCards,
  excludeHiddenSecuredCards,
  getIssuerBySlug,
  groupCardsForAllView,
  orderChips,
  sortFilteredCards,
  summaryTags,
} from "../utils/cardTaxonomy";

function CardTile({ card, selectMode }: { card: CardSummary; selectMode: boolean }) {
  // Carries the current filter (it lives in this page's URL, see below) so
  // the card detail page's back link can return here with the same filter
  // still selected, rather than resetting to "All Cards".
  const location = useLocation();
  return (
    <Link
      to={`/cards/${card.id}`}
      state={{ from: location.pathname + location.search }}
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
  // Lives in the URL (rather than useState) so it survives navigating to a
  // card's detail page and back — a plain useState resets to "All Cards" on
  // remount, since React Router unmounts this page while a card is open.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter") ?? ALL_CARDS_FILTER;
  const setActiveFilter = (filter: string) => {
    const next = new URLSearchParams(searchParams);
    if (filter === ALL_CARDS_FILTER) next.delete("filter");
    else next.set("filter", filter);
    setSearchParams(next, { replace: true });
  };
  const { compareIds } = useCompareList();
  // Defaults to "on" whenever picks already exist (e.g. returning from a
  // card's detail page) — otherwise the toggle would misleadingly read
  // "Select cards" even though cards are, in fact, already selected.
  const [selectMode, setSelectMode] = useState(() => compareIds.length > 0);

  const { data: allCards, isLoading, isError, error } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });
  const slowLoad = useSlowLoadWarning(isLoading);

  const issuerCards = useMemo(
    () =>
      excludeHiddenSecuredCards((allCards ?? []).filter((c) => c.issuer === issuer?.issuerField)),
    [allCards, issuer],
  );
  const issuerCardIds = useMemo(() => issuerCards.map((c) => c.id), [issuerCards]);

  // Fetching full detail for every card in this issuer's lineup (at most 23
  // today) is what lets sortFilteredCards rank cards within a filtered view
  // by real earn-rate relevance (e.g. within "Dining", the card that
  // actually earns the most dining multiplier first) — every filter chip
  // itself now comes from CardSummary alone (see summaryTags), this is only
  // for in-filter ordering. One bulk request for the whole lineup rather
  // than a fetchCard-per-card fan-out — the latter meant visiting an issuer
  // with a large lineup (e.g. Citi's 23 cards) fired 23 separate requests on
  // every page load.
  const queryClient = useQueryClient();
  const { data: cardDetails } = useQuery({
    queryKey: ["cardDetails", issuerCardIds],
    queryFn: () => fetchCardDetails(issuerCardIds),
    enabled: issuerCardIds.length > 0,
  });

  // Seed the single-card cache (["card", id], read by CardDetailPage) from
  // this bulk response so clicking into a card afterward is still instant
  // instead of re-fetching detail this page already has.
  useEffect(() => {
    for (const card of cardDetails ?? []) {
      queryClient.setQueryData(["card", card.id], card);
    }
  }, [cardDetails, queryClient]);

  const detailsById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of cardDetails ?? []) map.set(c.id, c);
    return map;
  }, [cardDetails]);

  const tagMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const addTag = (tag: string, cardId: string) => {
      if (!map.has(tag)) map.set(tag, new Set());
      map.get(tag)!.add(cardId);
    };
    for (const card of issuerCards) {
      for (const tag of summaryTags(card)) addTag(tag, card.id);
    }
    return map;
  }, [issuerCards]);

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
      : sortFilteredCards(
          issuerCards.filter((c) => tagMap.get(activeFilter)?.has(c.id)),
          activeFilter,
          detailsById,
        );

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
            {isLoading
              ? "Loading…"
              : `${issuerCards.length} ${issuerCards.length === 1 ? "card" : "cards"}`}
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

        {!isLoading && !isError && (
          <>
            {/* Filter chips */}
            <div style={{ marginBottom: 32 }}>
              <FilterChips
                chips={chips}
                isActive={(chip) => chip === activeFilter}
                onToggle={setActiveFilter}
              />
            </div>

            {/* Select-mode toggle only — "Remove Selection" and the Compare
                CTA both live in the persistent CompareTray now, so there's
                just one of each visible at a time instead of two. */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setSelectMode((v) => !v)}
                aria-pressed={selectMode}
                className={`filter-chip ${selectMode ? "active" : ""}`}
              >
                {selectMode ? "Done selecting" : "Select cards"}
              </button>
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
                No cards match "{activeFilter}" yet. Try another filter.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
