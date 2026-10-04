import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** The Manage Visits tabs that count what is new. Today counts what is still to come instead. */
export type VisitTabKey = "upcoming" | "missed";

/** When each tab was last looked at, in epoch ms. */
type SeenAt = Record<VisitTabKey, number>;

const STORAGE_PREFIX = "khatiyan.visit-tabs-seen.v1.";

async function load(key: string): Promise<SeenAt | null> {
  try {
    const raw = Platform.OS === "web" ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as SeenAt) : null;
  } catch {
    return null;
  }
}

async function save(key: string, value: SeenAt) {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") window.localStorage.setItem(key, raw);
    else await SecureStore.setItemAsync(key, raw);
  } catch {
    // A lost watermark only means a count shows again; never worth an error.
  }
}

/**
 * When the viewer last looked at Manage Visits' Upcoming and Missed tabs, so
 * each can count what has been added to it since (user, 2026-10-04) instead of
 * everything in it: a tab that has been visited shows no count, until
 * something new arrives.
 *
 * <p>The Enquiries tabs' own way (`useEnquiryTabsSeen`), kept apart from it so
 * that one stays as it is: a timestamp per tab rather than a list of seen
 * visits, and the first time both start as seen now, so a person opening the
 * screen for the first time is not met with every visit counted as new.
 *
 * @param scopeKey the viewer and property; null until both are known.
 */
export function useVisitTabsSeen(scopeKey: string | null) {
  const storageKey = scopeKey ? STORAGE_PREFIX + scopeKey : null;
  const [seenAt, setSeenAt] = useState<SeenAt | null>(null);

  useEffect(() => {
    let active = true;
    setSeenAt(null);
    if (!storageKey) return;
    void load(storageKey).then((stored) => {
      if (!active) return;
      if (stored) {
        setSeenAt(stored);
        return;
      }
      const now = Date.now();
      const fresh = { missed: now, upcoming: now };
      setSeenAt(fresh);
      void save(storageKey, fresh);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const markSeen = useCallback(
    (tab: VisitTabKey) => {
      if (!storageKey) return;
      setSeenAt((current) => {
        if (!current) return current;
        const next = { ...current, [tab]: Date.now() };
        void save(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { markSeen, seenAt };
}
