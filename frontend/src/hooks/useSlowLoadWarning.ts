import { useEffect, useState } from "react";

/** True once `isLoading` has stayed true for `delayMs` straight, false again
 * the moment loading finishes. Lets a page distinguish an ordinary load from
 * one taking long enough that a user would reasonably think the site is
 * broken — most often the backend waking up from a Render free-tier cold
 * start, which can take up to a minute after 15 minutes of no traffic. */
export function useSlowLoadWarning(isLoading: boolean, delayMs = 4000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(id);
  }, [isLoading, delayMs]);

  return slow;
}
