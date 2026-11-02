import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The shortcuts this person uses most, on this device (2026-10-29). They fill
 * Home's suggestions when nothing is waiting. A convenience
 * only: lost storage just means the starters show instead.
 */
type Uses = Record<string, { count: number; last: number }>;

const KEY = (userId: string) => `quick-actions:uses:${userId}`;
const cache = new Map<string, Uses>();
const listeners = new Set<() => void>();

async function load(userId: string): Promise<Uses> {
  const cached = cache.get(userId);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY(userId));
    const uses = raw ? (JSON.parse(raw) as Uses) : {};
    cache.set(userId, uses);
    return uses;
  } catch {
    return {};
  }
}

/** Most used first, the latest breaking a tie. */
function ranked(uses: Uses) {
  return Object.entries(uses)
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .map(([id]) => id);
}

export async function recordQuickActionUse(userId: string, actionId: string) {
  const uses = { ...(await load(userId)) };
  uses[actionId] = { count: (uses[actionId]?.count ?? 0) + 1, last: Date.now() };
  cache.set(userId, uses);
  listeners.forEach((listener) => listener());
  try {
    await AsyncStorage.setItem(KEY(userId), JSON.stringify(uses));
  } catch {
    // Kept for this session only.
  }
}

/** The action ids this person uses most, most used first. */
export function useRecentQuickActions(userId: string | undefined): string[] {
  const [ids, setIds] = useState<string[]>(() => (userId && cache.get(userId) ? ranked(cache.get(userId)!) : []));
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const refresh = () => void load(userId).then((uses) => { if (live) setIds(ranked(uses)); });
    refresh();
    listeners.add(refresh);
    return () => {
      live = false;
      listeners.delete(refresh);
    };
  }, [userId]);
  return ids;
}

const SEARCH_KEY = (userId: string) => `quick-actions:search-picks:${userId}`;
const SEARCH_LIMIT = 5;
const searchCache = new Map<string, string[]>();
const searchListeners = new Set<() => void>();

async function loadSearchPicks(userId: string): Promise<string[]> {
  const cached = searchCache.get(userId);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(SEARCH_KEY(userId));
    const picks = raw ? (JSON.parse(raw) as string[]) : [];
    searchCache.set(userId, picks);
    return picks;
  } catch {
    return [];
  }
}

/** A result chosen from search: it heads Recent searches. */
export async function recordSearchPick(userId: string, actionId: string) {
  const picks = [actionId, ...(await loadSearchPicks(userId)).filter((id) => id !== actionId)].slice(0, SEARCH_LIMIT);
  searchCache.set(userId, picks);
  searchListeners.forEach((listener) => listener());
  try {
    await AsyncStorage.setItem(SEARCH_KEY(userId), JSON.stringify(picks));
  } catch {
    // Kept for this session only.
  }
}

/** The results this person last chose from search, most recent first. */
export function useRecentSearchPicks(userId: string | undefined): string[] {
  const [ids, setIds] = useState<string[]>(() => (userId ? searchCache.get(userId) ?? [] : []));
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const refresh = () => void loadSearchPicks(userId).then((picks) => { if (live) setIds(picks); });
    refresh();
    searchListeners.add(refresh);
    return () => {
      live = false;
      searchListeners.delete(refresh);
    };
  }, [userId]);
  return ids;
}
