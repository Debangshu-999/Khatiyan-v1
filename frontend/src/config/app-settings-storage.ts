import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { AccountType } from "@/features/account/accounts";
import type { ThemeMode } from "@/theme/colors";

const APP_SETTINGS_KEY = "khatiyan.appSettings.v1";

type StoredAppSettings = {
  // Legacy/default theme used before a user is signed in.
  themeMode?: ThemeMode;
  themeModesByUserId?: Record<string, ThemeMode>;
  // Legacy owner pins. Kept only as a fallback for the owner account.
  pinnedOwnerModules?: string[];
  pinnedOwnerModulesByUserId?: Record<string, string[]>;
  activeAccount?: AccountType | null;
  // Set after the first-run onboarding screen has been viewed.
  hasSeenGetStarted?: boolean;
  // The analytics period each user last picked. Presets only, never a custom range.
  analyticsPresetByUserId?: Record<string, string>;
};

/**
 * Every setting lives in ONE stored blob, and every save used to read it,
 * change a field and write it all back with nothing ordering the saves. Two
 * in flight at once meant the later wrote back a copy read before the earlier
 * landed, silently undoing it: a pin saved beside an analytics-period or
 * account save vanished from storage while the screen still showed it, and
 * signing out (which drops the in-memory copy) made it look as if sign-out had
 * cleared the pins (seen 2026-09-26).
 *
 * <p>So every change goes through {@link updateSettings}, one at a time, each
 * reading the blob the previous one wrote. Reads wait for queued writes, so a
 * load right after a save sees it.
 */
let pendingWrites: Promise<unknown> = Promise.resolve();

async function readSettings(): Promise<StoredAppSettings> {
  const serializedSettings =
    Platform.OS === "web"
      ? window.localStorage.getItem(APP_SETTINGS_KEY)
      : await SecureStore.getItemAsync(APP_SETTINGS_KEY);

  if (!serializedSettings) {
    return {};
  }

  try {
    return JSON.parse(serializedSettings) as StoredAppSettings;
  } catch (error) {
    // Unreadable, but NOT deleted here: this used to wipe every setting (pins,
    // theme, account) on one bad read. The next save replaces it anyway.
    console.warn("App settings could not be read; starting from defaults", error);
    return {};
  }
}

async function writeSettings(settings: StoredAppSettings) {
  const serializedSettings = JSON.stringify(settings);

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
}

/** Applies one change to the stored settings, after every change queued before it. */
function updateSettings(change: (current: StoredAppSettings) => StoredAppSettings): Promise<void> {
  const run = pendingWrites.then(async () => {
    const current = await readSettings();
    await writeSettings(change(current));
  });
  // A failed write must not jam the queue for every later one.
  pendingWrites = run.catch(() => undefined);
  return run;
}

export async function loadAppSettings(): Promise<StoredAppSettings> {
  await pendingWrites;
  return readSettings();
}

export async function saveThemeMode(themeMode: ThemeMode) {
  return updateSettings((current) => ({ ...current, themeMode }));
}

export async function loadThemeModeForUser(userId: string): Promise<ThemeMode | undefined> {
  const currentSettings = await loadAppSettings();
  return currentSettings.themeModesByUserId?.[userId];
}

export function themeModeForUser(settings: StoredAppSettings, userId: string | undefined): ThemeMode | undefined {
  if (!userId) {
    return settings.themeMode;
  }
  return settings.themeModesByUserId?.[userId];
}

export async function saveThemeModeForUser(userId: string, themeMode: ThemeMode) {
  return updateSettings((current) => ({
    ...current,
    themeModesByUserId: { ...(current.themeModesByUserId ?? {}), [userId]: themeMode },
  }));
}

export async function loadAnalyticsPresetForUser(userId: string): Promise<string | undefined> {
  const currentSettings = await loadAppSettings();
  return currentSettings.analyticsPresetByUserId?.[userId];
}

/** A custom range is never saved: next launch falls back to the default preset. */
export async function saveAnalyticsPresetForUser(userId: string, preset: string) {
  return updateSettings((current) => ({
    ...current,
    analyticsPresetByUserId: { ...(current.analyticsPresetByUserId ?? {}), [userId]: preset },
  }));
}

export async function savePinnedOwnerModules(pinnedOwnerModules: string[]) {
  return updateSettings((current) => ({ ...current, pinnedOwnerModules }));
}

export function pinnedOwnerModulesForUser(
  settings: StoredAppSettings,
  userId: string | undefined,
): string[] {
  if (!userId) {
    return [];
  }

  const scopedPins = settings.pinnedOwnerModulesByUserId?.[userId];
  if (scopedPins) {
    return scopedPins;
  }

  return settings.pinnedOwnerModules ?? [];
}

export async function loadPinnedOwnerModulesForUser(userId: string): Promise<string[]> {
  const currentSettings = await loadAppSettings();
  return pinnedOwnerModulesForUser(currentSettings, userId);
}

export async function savePinnedOwnerModulesForUser(
  userId: string,
  pinnedOwnerModules: string[],
) {
  return updateSettings((current) => ({
    ...current,
    pinnedOwnerModulesByUserId: { ...(current.pinnedOwnerModulesByUserId ?? {}), [userId]: pinnedOwnerModules },
  }));
}

export async function saveActiveAccount(activeAccount: AccountType | null) {
  return updateSettings((current) => ({ ...current, activeAccount }));
}

export async function saveHasSeenGetStarted() {
  return updateSettings((current) => ({ ...current, hasSeenGetStarted: true }));
}
