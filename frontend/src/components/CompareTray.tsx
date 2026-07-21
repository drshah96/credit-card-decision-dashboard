import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { fetchCards } from "../api/cards";
import { useCompareList } from "../hooks/useCompareList";
import { CARD_IMAGES } from "../utils/cardImages";

/**
 * A persistent bottom tray showing every currently-picked compare card as a
 * small thumbnail, so picks stay visible while scrolling a long card grid or
 * switching between issuers — the whole point of it existing is that the
 * per-card checkmark badges scroll out of view. Only ever shows once at
 * least one card is picked, and hides on /compare itself since that page
 * already shows full-size versions of the same cards.
 */
export function CompareTray() {
  const { compareIds, removeCard, setCompareIds } = useCompareList();
  const location = useLocation();
  const { data: allCards } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
    enabled: compareIds.length > 0,
  });

  if (compareIds.length === 0 || location.pathname === "/compare") {
    return null;
  }

  const summariesById = new Map((allCards ?? []).map((c) => [c.id, c]));

  return (
    <div className="compare-tray" role="region" aria-label="Cards picked for comparison">
      <div className="compare-tray-inner">
        <div className="compare-tray-cards">
          {compareIds.map((id) => {
            const card = summariesById.get(id);
            const art = CARD_IMAGES[id];
            const name = card?.name ?? id;
            return (
              <div key={id} className="compare-tray-card">
                {art ? (
                  <img src={art} alt="" className="compare-tray-art" />
                ) : (
                  <div className="compare-tray-art-fallback" aria-hidden="true" />
                )}
                <span className="compare-tray-name">{name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${name} from compare`}
                  onClick={() => removeCard(id)}
                  className="compare-tray-remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setCompareIds([])}
          className="filter-chip compare-tray-remove-all"
        >
          Remove Selection
        </button>
        <Link to={`/compare?cards=${compareIds.join(",")}`} className="compare-cta compare-tray-cta">
          Compare ({compareIds.length})
        </Link>
      </div>
    </div>
  );
}
