import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "compare-cards";
const MAX_COMPARE = 4;

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
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
