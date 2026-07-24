import { useState } from "react";
import type { CardSummary } from "../types/cards";
import { VERDICT_STYLES } from "../constants/styles";
import { CARD_IMAGES } from "../utils/cardImages";
import { CardPicker } from "./CardPicker";

interface Props {
  cardSummary: CardSummary | undefined;
  allCards: CardSummary[];
  excludeIds: string[];
  onPick: (id: string) => void;
  onRemove: () => void;
}

export function CompareSlot({ cardSummary, allCards, excludeIds, onPick, onRemove }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!cardSummary) {
    return (
      <div className="compare-slot compare-slot-empty">
        <button type="button" className="compare-slot-add" onClick={() => setPickerOpen(true)}>
          + Add a card
        </button>
        {pickerOpen && (
          <CardPicker
            cards={allCards}
            excludeIds={excludeIds}
            onSelect={(id) => {
              onPick(id);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  const cardImage = CARD_IMAGES[cardSummary.id];

  return (
    <div className="compare-slot">
      <button
        type="button"
        className="compare-slot-remove"
        onClick={onRemove}
        aria-label={`Remove ${cardSummary.name}`}
      >
        ×
      </button>
      {cardImage && <img src={cardImage} alt="" className="compare-slot-art" />}
      <div className="compare-slot-issuer">{cardSummary.issuer}</div>
      <div className="compare-slot-name">{cardSummary.name}</div>
      <span
        className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-lg border ${VERDICT_STYLES[cardSummary.verdict.status]}`}
      >
        {cardSummary.verdict.short_tag ?? cardSummary.verdict.text}
      </span>
    </div>
  );
}
