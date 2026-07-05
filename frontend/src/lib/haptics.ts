import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Centralised haptic vocabulary — keep it to two verbs so the app has a
// consistent physical feel: `selectHaptic` for switching context (tabs,
// segments), `tapHaptic` for committing an action (primary CTAs).

export function tapHaptic() {
  if (Platform.OS === "web") {
    return;
  }
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    // Haptics are best-effort — some devices/emulators have none.
  });
}

export function selectHaptic() {
  if (Platform.OS === "web") {
    return;
  }
  Haptics.selectionAsync().catch(() => {
    // Haptics are best-effort — some devices/emulators have none.
  });
}
