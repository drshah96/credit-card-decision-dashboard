import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "credit-usage";
// Same same-tab-sync problem and fix as useCompareList: the native `storage`
// event only fires in *other* tabs, so a custom event keeps every mounted
// instance (a card detail page's sliders, the compare page's totals) in sync
// the moment one of them writes, even within the same tab.
const LOCAL_CHANGE_EVENT = "credit-usage-changed";

type UsageMap = Record<string, Record<string, number>>; // cardId -> creditId -> dollars/yr

function readStoredUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as UsageMap;
  } catch {
    return {};
  }
}

function writeStoredUsage(usage: UsageMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Storage unavailable (private browsing, quota) — usage just won't
    // persist across pages this session, which is a safe fallback.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

/**
 * Persists the "how much will I actually use" slider value a cardholder sets
 * per credit on a card's detail page, keyed by card id + credit id. This is
 * what lets the Compare page show a real, personalized credit total instead
 * of a guessed one — the same number the card's own Credit Calculator shows,
 * reused rather than re-estimated.
 */
export function useCreditUsage() {
  const [usage, setUsage] = useState<UsageMap>(() => readStoredUsage());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setUsage(readStoredUsage());
    }
    function onLocalChange() {
      setUsage(readStoredUsage());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    };
  }, []);

  const setCreditValue = useCallback((cardId: string, creditId: string, value: number) => {
    const current = readStoredUsage();
    const next = { ...current, [cardId]: { ...current[cardId], [creditId]: value } };
    writeStoredUsage(next);
    setUsage(next);
  }, []);

  const getCardUsage = useCallback(
    (cardId: string): Record<string, number> | undefined => usage[cardId],
    [usage],
  );

  return { getCardUsage, setCreditValue };
}
