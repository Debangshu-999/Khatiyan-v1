import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";
import { onKeyboardLeaving } from "@/components/keyboard-intent";

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
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) =>
      // From the keyboard's top edge to the bottom of the screen, as SheetShell
      // measures it (2026-10-29). The keyboard's height less the safe-area
      // inset was right on gesture navigation only.
      setKeyboardInset(Math.max(0, Dimensions.get("screen").height - event.endCoordinates.screenY)),
    );
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));
    // Sooner than keyboardDidHide: the input losing focus is when the keyboard starts to close.
    const offLeaving = onKeyboardLeaving(() => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
      offLeaving();
    };
  }, []);

  return keyboardInset;
}
