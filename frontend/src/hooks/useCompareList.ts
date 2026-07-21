import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "compare-cards";
const MAX_COMPARE = 4;
// The native `storage` event only fires in *other* tabs/windows, never the
// one that made the write — so two components in the same page (e.g. a
// CardSummaryCard's circle toggle and IssuerCardsPage's own "Compare (N)"
// button) each hold an independent useState and would otherwise drift out
// of sync with each other after either one writes. This custom event is
// dispatched on every write and heard by every mounted instance, same tab
// included, to keep them all in lockstep.
const LOCAL_CHANGE_EVENT = "compare-cards-changed";

function readStoredIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function writeStoredIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private browsing, quota) — compare list just
    // won't persist across pages this session, which is a safe fallback.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

/**
 * Persists the up-to-4 card ids picked for comparison in localStorage, so
 * "Add to Compare" on a card detail page and the /compare page itself always
 * agree on the current picks — the URL on /compare remains the shareable
 * source of truth for that page view, but this is what lets picks survive
 * navigating between pages before you're ready to go look at the comparison.
 */
export function useCompareList() {
  const [ids, setIds] = useState<string[]>(() => readStoredIds());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setIds(readStoredIds());
    }
    function onLocalChange() {
      setIds(readStoredIds());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    };
  }, []);

  const replace = useCallback((next: string[]) => {
    const deduped = Array.from(new Set(next)).slice(0, MAX_COMPARE);
    writeStoredIds(deduped);
    setIds(deduped);
  }, []);

  const addCard = useCallback(
    (id: string) => {
      replace([...readStoredIds(), id]);
    },
    [replace],
  );

  const removeCard = useCallback(
    (id: string) => {
      replace(readStoredIds().filter((x) => x !== id));
    },
    [replace],
  );

  return { compareIds: ids, addCard, removeCard, setCompareIds: replace, maxCompare: MAX_COMPARE };
}
