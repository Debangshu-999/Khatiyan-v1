import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PREFIX = "khatiyan.notificationPromptDismissed";

export async function hasDismissedNotificationPrompt(userId: string) {
  const key = keyForUser(userId);
  const value = Platform.OS === "web" ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  return value === "true";
}

export async function dismissNotificationPrompt(userId: string) {
  const key = keyForUser(userId);
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, "true");
    return;
  }
  await SecureStore.setItemAsync(key, "true");
}

function keyForUser(userId: string) {
  return `${PREFIX}.${userId}`;
}
