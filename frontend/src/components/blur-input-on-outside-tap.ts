import { useMemo, useRef } from "react";
import { Platform, TextInput, type GestureResponderEvent, type ViewProps } from "react-native";

/** How far a finger may travel and still count as a tap rather than a scroll. */
const TAP_SLOP = 10;

/**
 * Tapping outside a text field takes the focus off it, everywhere in the app
 * (owner's rule, 2026-09-27). The blinking cursor goes with it, whether or not
 * the keyboard is still up: Android's Back key hides the keyboard but leaves
 * the field focused, and that cursor used to blink on until something else
 * took focus.
 *
 * <p>Spread onto the root view. Three properties keep it from breaking
 * anything under it:
 * <ul>
 *   <li>It is only ASKED when nothing under the finger wanted the touch.
 *       `onStartShouldSetResponder` bubbles up from the touched view and stops
 *       at the first that says yes, so a button, a field, a switch or a scroll
 *       view that claimed the touch never reaches the root.</li>
 *   <li>It always answers no. It never becomes the responder, which is what a
 *       Pressable wrapped around a ScrollView does, and that kills scrolling on
 *       Android.</li>
 *   <li>It acts on release, and only for a tap. A finger that travelled was
 *       scrolling, and scrolling a form to reach the next field must not throw
 *       away the one being typed in.</li>
 * </ul>
 *
 * <p>A tap on a button keeps the focus, deliberately: a show-password eye or a
 * lookup beside a field should not end the typing. A scroll view set to
 * `keyboardShouldPersistTaps="handled"` claims empty-space taps itself while a
 * field is focused, and blurs it on release the same way.
 *
 * <p>Nothing on web: a browser already moves focus off a field when the page
 * around it is clicked.
 */
export function useBlurInputOnOutsideTap(): ViewProps {
  const start = useRef<{ x: number; y: number } | null>(null);

  return useMemo<ViewProps>(() => {
    if (Platform.OS === "web") {
      return {};
    }
    return {
      onStartShouldSetResponder: (event: GestureResponderEvent) => {
        start.current = TextInput.State.currentlyFocusedInput() != null
          ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
          : null;
        return false;
      },
      onTouchCancel: () => {
        start.current = null;
      },
      onTouchEnd: (event: GestureResponderEvent) => {
        const from = start.current;
        start.current = null;
        if (!from) {
          return;
        }
        const { pageX, pageY } = event.nativeEvent;
        if (Math.abs(pageX - from.x) > TAP_SLOP || Math.abs(pageY - from.y) > TAP_SLOP) {
          return;
        }
        const focused = TextInput.State.currentlyFocusedInput();
        if (focused) {
          TextInput.State.blurTextInput(focused);
        }
      },
    };
  }, []);
}
