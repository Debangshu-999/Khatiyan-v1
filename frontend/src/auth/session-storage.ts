import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { RootState } from "@/store/store";

const SESSION_KEY = "khatiyan.session.v1";

export type PersistedSession = Pick<RootState["auth"], "accessToken" | "user">;

export async function saveSession(session: PersistedSession) {
  const serializedSession = JSON.stringify(session);

  if (Platform.OS === "web") {
    window.localStorage.setItem(SESSION_KEY, serializedSession);
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, serializedSession);
}

export async function loadSession(): Promise<PersistedSession | null> {
  const serializedSession =
    Platform.OS === "web"
      ? window.localStorage.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);

  if (!serializedSession) {
    return null;
  }

  try {
    return JSON.parse(serializedSession) as PersistedSession;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function clearStoredSession() {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}
