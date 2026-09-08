import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The keyboard's height on Android, measured rather than inferred.
 *
 * <p>
 * <b>Use this for any modal with a text input that is not a `SheetShell`.</b>
 * `KeyboardAvoidingView behavior="padding"` is broken on Android under
 * edge-to-edge (mandatory since Expo SDK 53): it infers the keyboard height by
 * comparing screen height to window height, edge-to-edge makes the window span
 * the whole display, so the number is wrong — and on DISMISSAL its padding does
 * not return to zero. That is the bug where a dialog stays shoved up the screen
 * after the keyboard closes, and it has been re-fixed on several screens.
 *
 * <p>
 * `SheetShell` already does this internally; this is the same measurement
 * extracted so a CENTRED dialog can have it without becoming a bottom sheet.
 * Apply the returned value as bottom padding on the centring container — the
 * box shrinks and the dialog rises with it.
 *
 * <p>
 * Returns 0 on iOS, where the platform avoider works correctly and should be
 * used instead: {@code behavior={Platform.OS === "ios" ? "padding" : undefined}}.
 */
export function useKeyboardInset() {
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) =>
      // Minus the safe-area inset: on a gesture-navigation device the reported
      // keyboard height already includes that strip, and counting it twice
      // lifts the dialog a nav-bar's height too far.
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom)),
    );
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [insets.bottom]);

  return keyboardInset;
}
