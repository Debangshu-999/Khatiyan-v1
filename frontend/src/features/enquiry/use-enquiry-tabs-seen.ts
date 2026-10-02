import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type EnquiryTabKey = "all" | "mine";

/** When each tab was last looked at, in epoch ms. */
type SeenAt = Record<EnquiryTabKey, number>;

const STORAGE_PREFIX = "khatiyan.enquiry-tabs-seen.v1.";

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
 * When the viewer last looked at each enquiries tab, so a tab can count what
 * has arrived since (user, 2026-10-02): new enquiries in All, enquiries newly
 * handed to them in My enquiries.
 *
 * <p>A timestamp per tab rather than a list of seen ids: it stays a few bytes
 * however many enquiries a property collects, which keeps it well inside
 * SecureStore's comfortable size.
 *
 * <p>The first time, both tabs start as seen now, so a person opening the
 * screen for the first time is not met with every enquiry counted as new.
 *
 * @param scopeKey the viewer and property; null until both are known.
 */
export function useEnquiryTabsSeen(scopeKey: string | null) {
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
      const fresh = { all: now, mine: now };
      setSeenAt(fresh);
      void save(storageKey, fresh);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const markSeen = useCallback(
    (tab: EnquiryTabKey) => {
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
