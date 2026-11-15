import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";

/** How long the second press has to land in, after the first. */
const WINDOW_MS = 2000;

/**
 * On the screen it is used on, a single back does not close the app (user,
 * 2026-11-09): the first shows Android's own toast, which carries the app icon
 * before the text on Android 12 and later, and a second within two seconds
 * closes it. Only while the screen is focused, and an open modal still takes
 * back first. Android only: iOS has no back button.
 */
export function useDoubleBackToExit(message = "Swipe again to close the app") {
  const lastPress = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        const now = Date.now();
        if (now - lastPress.current < WINDOW_MS) {
          // Not handled: the system's own back closes the app.
          return false;
        }
        lastPress.current = now;
        ToastAndroid.show(message, ToastAndroid.SHORT);
        return true;
      });
      return () => subscription.remove();
    }, [message]),
  );
}
