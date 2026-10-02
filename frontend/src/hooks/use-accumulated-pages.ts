import { useEffect, useMemo, useState } from "react";
import type { Page } from "@/store/pagination";

/** Keep earlier server pages visible; never mix different properties/filters. */
export function useAccumulatedPages<T extends { id: string }>(key: string, response: Page<T> | undefined) {
  const [cache, setCache] = useState<{ key: string; pages: Record<number, Page<T>> }>({ key, pages: {} });
  useEffect(() => {
    if (!response) return;
    setCache((previous) => ({ key, pages: { ...(previous.key === key ? previous.pages : {}), [response.page]: response } }));
  }, [key, response]);
  return useMemo(() => {
    const pages = { ...(cache.key === key ? cache.pages : {}), ...(response ? { [response.page]: response } : {}) };
    const ordered = Object.keys(pages).map(Number).sort((a, b) => a - b);
    const items = new Map<string, T>();
    for (const page of ordered) for (const item of pages[page].items) items.set(item.id, item);
    const latest = pages[ordered[ordered.length - 1]];
    return latest ? { ...latest, items: [...items.values()] } : undefined;
  }, [cache, key, response]);
}
