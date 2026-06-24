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
};

export async function loadAppSettings(): Promise<StoredAppSettings> {
  const serializedSettings =
    Platform.OS === "web"
      ? window.localStorage.getItem(APP_SETTINGS_KEY)
      : await SecureStore.getItemAsync(APP_SETTINGS_KEY);

  if (!serializedSettings) {
    return {};
  }

  try {
    return JSON.parse(serializedSettings) as StoredAppSettings;
  } catch {
    await clearAppSettings();
    return {};
  }
}

export async function saveThemeMode(themeMode: ThemeMode) {
  const currentSettings = await loadAppSettings();
  const nextSettings: StoredAppSettings = {
    ...currentSettings,
    themeMode,
  };
  const serializedSettings = JSON.stringify(nextSettings);

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
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
  const currentSettings = await loadAppSettings();
  const serializedSettings = JSON.stringify({
    ...currentSettings,
    themeModesByUserId: {
      ...(currentSettings.themeModesByUserId ?? {}),
      [userId]: themeMode,
    },
  });

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
}

export async function savePinnedOwnerModules(pinnedOwnerModules: string[]) {
  const currentSettings = await loadAppSettings();
  const serializedSettings = JSON.stringify({ ...currentSettings, pinnedOwnerModules });

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
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
  const currentSettings = await loadAppSettings();
  const serializedSettings = JSON.stringify({
    ...currentSettings,
    pinnedOwnerModulesByUserId: {
      ...(currentSettings.pinnedOwnerModulesByUserId ?? {}),
      [userId]: pinnedOwnerModules,
    },
  });

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
}

export async function saveActiveAccount(activeAccount: AccountType | null) {
  const currentSettings = await loadAppSettings();
  const serializedSettings = JSON.stringify({ ...currentSettings, activeAccount });

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
}

export async function saveHasSeenGetStarted() {
  const currentSettings = await loadAppSettings();
  const serializedSettings = JSON.stringify({ ...currentSettings, hasSeenGetStarted: true });

  if (Platform.OS === "web") {
    window.localStorage.setItem(APP_SETTINGS_KEY, serializedSettings);
    return;
  }

  await SecureStore.setItemAsync(APP_SETTINGS_KEY, serializedSettings);
}

async function clearAppSettings() {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(APP_SETTINGS_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(APP_SETTINGS_KEY);
}
