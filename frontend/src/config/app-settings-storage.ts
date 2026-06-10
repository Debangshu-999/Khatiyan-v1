import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { ThemeMode } from "@/theme/colors";

const APP_SETTINGS_KEY = "khatiyan.appSettings.v1";

type StoredAppSettings = {
  themeMode?: ThemeMode;
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

async function clearAppSettings() {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(APP_SETTINGS_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(APP_SETTINGS_KEY);
}
