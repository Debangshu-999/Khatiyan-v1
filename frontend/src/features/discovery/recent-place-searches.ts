import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * The last few things a tenant looked for on the nearby map.
 *
 * <p>Kept on the device, never sent anywhere: a list of searches is a list of
 * where somebody goes, and it is only worth keeping because it saves them
 * retyping "pharmacy" every week.
 *
 * <p>Stored through SecureStore because that is how this app already persists
 * across launches — AsyncStorage is not installed — with the web falling back
 * to localStorage the same way app settings do.
 */
const RECENT_SEARCHES_KEY = "khatiyan.nearbySearches.v1";

/** Enough to be useful, short enough that the sheet never needs scrolling to reach typing. */
const MAX_RECENT_SEARCHES = 8;

async function read(): Promise<string[]> {
  const stored =
    Platform.OS === "web"
      ? window.localStorage.getItem(RECENT_SEARCHES_KEY)
      : await SecureStore.getItemAsync(RECENT_SEARCHES_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    // Anything that is not a list of strings is treated as absent rather than
    // repaired: this is a convenience, and a broken one is not worth a crash.
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

async function write(searches: string[]): Promise<string[]> {
  const serialized = JSON.stringify(searches);

  if (Platform.OS === "web") {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, serialized);
    return searches;
  }

  await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, serialized);
  return searches;
}

export async function loadRecentSearches(): Promise<string[]> {
  return read();
}

/**
 * Puts a search at the top, and returns the whole list as it now stands.
 *
 * <p>Matched without case, so "Pharmacy" typed after tapping the pharmacy chip
 * does not become a second entry for the same thing.
 */
export async function rememberSearch(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return read();
  }

  const existing = await read();
  const withoutDuplicate = existing.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  return write([trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES));
}

export async function forgetSearch(query: string): Promise<string[]> {
  const existing = await read();
  return write(existing.filter((entry) => entry.toLowerCase() !== query.trim().toLowerCase()));
}
