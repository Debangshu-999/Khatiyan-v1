import { useEffect, useRef } from "react";

/**
 * Pull-to-refresh, finished (user, 2026-11-07: "make sure it actually refreshes the data").
 *
 * <p>A pull refetches every query on screen. A screen that copied its data into a form
 * once, so a background refetch never wipes an edit, would still show the old copy.
 * The scroll view announces here once the refetched data has arrived, and such a screen
 * reloads its form from it, when it has no unsaved changes.
 */
const listeners = new Set<() => void>();

export function announcePullRefreshed() {
  listeners.forEach((listener) => listener());
}

/** Runs after every finished pull-to-refresh. Always the latest callback, so it reads fresh data. */
export function usePullRefreshed(callback: () => void) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const listener = () => latest.current();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

/** Resolves once no query is loading, or after `limitMs`, whichever comes first. */
export async function untilQueriesSettle(isLoading: () => boolean, limitMs = 10_000) {
  const started = Date.now();
  // A beat for the invalidation to start the refetches it causes.
  await new Promise((resolve) => setTimeout(resolve, 50));
  while (isLoading() && Date.now() - started < limitMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
