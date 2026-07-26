import { useEffect, useMemo, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCard, fetchCards } from "../api/cards";
import { PageTabs } from "../components/PageTabs";
import { CompareSlot } from "../components/CompareSlot";
import { useCompareList } from "../hooks/useCompareList";
import { useCreditUsage } from "../hooks/useCreditUsage";
import { trackEvent } from "../utils/analytics";
import { CARD_IMAGES } from "../utils/cardImages";
import type { Card, CardSummary } from "../types/cards";

const MAX_CARDS = 4;

function parseSelectedIds(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of raw.split(",").map((s) => s.trim())) {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(0, MAX_CARDS);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {children}
    </tr>
  );
}

// cpp is cents per point, so cpp dollars is exactly the value of 100 points —
// e.g. 2.0¢/pt → $2 per 100 points. Formatted small ("$2 per 100 points")
// instead of the large, harder-to-parse "$2,000 per 100k" points value.
function formatPer100Points(cpp: number): string {
  const rounded = cpp.toFixed(2);
  const trimmed = rounded.endsWith(".00") ? rounded.slice(0, -3) : rounded;
  return `$${trimmed} per 100 points`;
}

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { compareIds, setCompareIds } = useCompareList();
  const selectedIds = useMemo(() => parseSelectedIds(searchParams.get("cards")), [searchParams]);

  // Arriving at /compare with no ?cards param (e.g. clicking the bare tab
  // link) — seed the URL from whatever was picked earlier via "Add to
  // Compare" on card detail pages, so the link is immediately shareable.
  // Self-limiting: once the URL has a cards param the guard below skips it,
  // and updateSelection() always clears searchParams and compareIds
  // together, so this can't loop or fight the user's own edits.
  useEffect(() => {
    if (!searchParams.has("cards") && compareIds.length > 0) {
      const params = new URLSearchParams(searchParams);
      params.set("cards", compareIds.join(","));
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, compareIds, setSearchParams]);

  const updateSelection = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (next.length > 0) {
      params.set("cards", next.join(","));
    } else {
      params.delete("cards");
    }
    setSearchParams(params);
    setCompareIds(next);
  };

  const {
    data: allCards,
    isLoading: summariesLoading,
    isError: summariesError,
    error: summariesErrorObj,
  } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const detailQueries = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: ["card", id],
      queryFn: () => fetchCard(id),
    })),
  });

  const summariesById = useMemo(() => {
    const map = new Map<string, CardSummary>();
    for (const c of allCards ?? []) map.set(c.id, c);
    return map;
  }, [allCards]);

  const detailsById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const q of detailQueries) {
      if (q.data) map.set(q.data.id, q.data);
    }
    return map;
  }, [detailQueries]);

  const selectedSummaries = selectedIds
    .map((id) => summariesById.get(id))
    .filter((c): c is CardSummary => Boolean(c));

  // Comma-joined ids of only the selections that resolved to a real card —
  // a stable primitive key so the tracking effect below only re-triggers
  // when the actual validated comparison set changes.
  const validCardIdsKey = selectedSummaries.map((c) => c.id).join(",");

  // Debounced so building a comparison one card at a time (pick 1, pick 2,
  // pick 3...) fires a single compare_cards event for the settled set
  // rather than one event per incremental edit. Gated on selectedSummaries
  // (validated against the fetched catalog) rather than raw selectedIds, so
  // a stale/typo'd share link never counts an unresolved id as compared.
  useEffect(() => {
    const ids = validCardIdsKey ? validCardIdsKey.split(",") : [];
    if (ids.length < 2) return;
    const timeoutId = window.setTimeout(() => {
      trackEvent("compare_cards", { card_ids: validCardIdsKey, card_count: ids.length });
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [validCardIdsKey]);

  const { getCardUsage } = useCreditUsage();

  // How much a cardholder will actually capture from a credit varies too
  // much person-to-person to guess (someone without a car won't use a
  // rideshare credit) — so this reuses the exact numbers the user already
  // set on each card's own detail-page sliders (persisted via
  // useCreditUsage) rather than assuming a percentage. `null` means the
  // card's full credit list hasn't loaded yet; `hasSavedUsage: false` means
  // it loaded but the user hasn't customized anything on that card yet.
  function yourCreditsTotal(cardId: string): { value: number; hasSavedUsage: boolean } | null {
    const detail = detailsById.get(cardId);
    if (!detail) return null;
    const saved = getCardUsage(cardId);
    const active = detail.credits.filter((c) => !c.removed);
    const value = active.reduce((sum, c) => sum + (saved?.[c.id] ?? c.default_value), 0);
    return { value, hasSavedUsage: Boolean(saved && Object.keys(saved).length > 0) };
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 11.5,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "var(--faint)",
              marginBottom: 16,
            }}
          >
            The Wallet Audit
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
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
            Compare cards
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14.5, margin: 0 }}>
            Pick up to {MAX_CARDS} cards from any bank and see them side by side.
          </p>
        </header>

        <PageTabs active="compare" />

        {summariesLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 16,
              marginTop: 8,
            }}
          >
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--panel-s)",
                  minHeight: 140,
                  animation: "pulse 1.5s ease-in-out infinite",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {summariesError && (
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
              {summariesErrorObj instanceof Error ? summariesErrorObj.message : "Unknown error"}
            </p>
          </div>
        )}

        {!summariesLoading && !summariesError && (
          <>
            <div className="compare-grid" style={{ marginTop: 8 }}>
              {Array.from({ length: MAX_CARDS }, (_, i) => (
                <CompareSlot
                  key={i}
                  cardSummary={selectedSummaries[i]}
                  allCards={allCards ?? []}
                  excludeIds={selectedIds}
                  onPick={(id) => updateSelection([...selectedIds, id])}
                  onRemove={() =>
                    updateSelection(selectedIds.filter((_, idx) => idx !== i))
                  }
                />
              ))}
            </div>

            {selectedSummaries.length === 0 ? (
              <p style={{ color: "var(--faint)", marginTop: 32, fontSize: 14.5 }}>
                Pick up to {MAX_CARDS} cards to compare, mix and match across any bank.
              </p>
            ) : (
              <div className="compare-table-wrap" style={{ marginTop: 36 }}>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th scope="col" />
                      {selectedSummaries.map((c) => {
                        const cardImage = CARD_IMAGES[c.id];
                        return (
                          <th key={c.id} scope="col">
                            {cardImage && (
                              <img src={cardImage} alt="" className="compare-table-art" />
                            )}
                            <div className="compare-table-issuer">{c.issuer}</div>
                            <div className="compare-table-name">{c.name}</div>
                            <span className={`verdict-badge ${c.verdict.status}`}>
                              {c.verdict.text}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="Annual fee">
                      {selectedSummaries.map((c) => (
                        <td key={c.id}>{c.annual_fee === 0 ? "$0" : `$${c.annual_fee}`}</td>
                      ))}
                    </Row>
                    <Row label="Effective cost">
                      {selectedSummaries.map((c) => (
                        <td key={c.id}>{c.effective_cost}</td>
                      ))}
                    </Row>
                    <Row label="Credits (yours / max)">
                      {selectedSummaries.map((c) => {
                        const yours = yourCreditsTotal(c.id);
                        return (
                          <td key={c.id}>
                            {yours ? `$${yours.value}` : "…"} / ${c.total_max_credits}
                            {yours && (
                              <div className="compare-credit-hint">
                                <Link to={`/cards/${c.id}`}>
                                  {yours.hasSavedUsage ? "Adjust your usage →" : "Set your usage →"}
                                </Link>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </Row>
                    <Row label="Best-case net">
                      {selectedSummaries.map((c) => {
                        const net = c.annual_fee - c.total_max_credits;
                        return (
                          <td
                            key={c.id}
                            style={{ color: net <= 0 ? "var(--green)" : "var(--red)" }}
                          >
                            {net <= 0 ? `+$${Math.abs(net)}` : `$${net}`}
                          </td>
                        );
                      })}
                    </Row>
                    <Row label="Network · points program">
                      {selectedSummaries.map((c) => (
                        <td key={c.id}>
                          {c.network}
                          <br />
                          {c.points_program}
                        </td>
                      ))}
                    </Row>
                    <Row label="How you earn">
                      {selectedSummaries.map((c) => {
                        const detail = detailsById.get(c.id);
                        return (
                          <td key={c.id}>
                            {detail ? (
                              <ul className="compare-list">
                                {detail.earn_rates.map((r) => (
                                  <li key={r.category}>
                                    <b>{r.multiplier}</b> {r.category}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="compare-loading">Loading…</span>
                            )}
                          </td>
                        );
                      })}
                    </Row>
                    <Row label="Points value">
                      {selectedSummaries.map((c) => {
                        const detail = detailsById.get(c.id);
                        const best = detail?.points.redemption_options.find((o) => o.best);
                        return (
                          <td key={c.id}>
                            {detail ? (
                              best ? (
                                <>
                                  {formatPer100Points(best.cpp)}
                                  <br />
                                  via {best.method}
                                </>
                              ) : (
                                detail.points.per_100k
                              )
                            ) : (
                              <span className="compare-loading">Loading…</span>
                            )}
                          </td>
                        );
                      })}
                    </Row>
                    <Row label="Transfer partners">
                      {selectedSummaries.map((c) => {
                        const detail = detailsById.get(c.id);
                        return (
                          <td key={c.id}>
                            {detail ? (
                              <>
                                {detail.transfer_partners.airline_count} airline ·{" "}
                                {detail.transfer_partners.hotel_count} hotel
                              </>
                            ) : (
                              <span className="compare-loading">Loading…</span>
                            )}
                          </td>
                        );
                      })}
                    </Row>
                    <Row label="Insurance & protections">
                      {selectedSummaries.map((c) => {
                        const detail = detailsById.get(c.id);
                        return (
                          <td key={c.id}>
                            {detail ? (
                              <ul className="compare-list">
                                {detail.insurance.map((ins) => (
                                  <li key={ins.coverage}>
                                    {ins.coverage}: <b>{ins.level}</b>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="compare-loading">Loading…</span>
                            )}
                          </td>
                        );
                      })}
                    </Row>
                    {selectedSummaries.some((c) => (detailsById.get(c.id)?.status_perks.length ?? 0) > 0) && (
                      <Row label="Status & perks">
                        {selectedSummaries.map((c) => {
                          const detail = detailsById.get(c.id);
                          return (
                            <td key={c.id}>
                              {detail && detail.status_perks.length > 0 ? (
                                <ul className="compare-list">
                                  {detail.status_perks.map((p) => (
                                    <li key={p.name}>{p.name}</li>
                                  ))}
                                </ul>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                      </Row>
                    )}
                    <Row label="">
                      {selectedSummaries.map((c) => (
                        <td key={c.id}>
                          <Link to={`/cards/${c.id}`} className="compare-detail-link">
                            View full details →
                          </Link>
                        </td>
                      ))}
                    </Row>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
