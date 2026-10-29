import { Platform, TextInput } from "react-native";

type Listener = () => void;

type FocusedInput = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null;

/**
 * The input holding focus, or null. react-native-web has no
 * currentlyFocusedInput (only currentlyFocusedField), and calling it threw
 * "currentlyFocusedInput is not a function" on the web login (2026-10-29).
 */
export function focusedInput(): FocusedInput {
  const state = TextInput.State as unknown as Record<string, unknown>;
  const read = typeof state.currentlyFocusedInput === "function"
    ? state.currentlyFocusedInput
    : state.currentlyFocusedField;
  return typeof read === "function" ? ((read as () => FocusedInput).call(TextInput.State) ?? null) : null;
}
const listeners = new Set<Listener>();

/**
 * The keyboard is on its way down, said before Android says so (user,
 * 2026-10-29).
 *
 * <p>Android only reports `keyboardDidHide`, once the keyboard has finished
 * closing, so a sheet or dialog lifted above it dropped late. An input losing
 * focus (a tap outside, the back button) is the moment the keyboard starts to
 * close, so the shared input announces it here and whatever is lifted drops at
 * once. Focus moving to another input is not a close: nothing is announced if
 * an input still holds focus a moment later.
 */
export function announceInputBlur() {
  // No on-screen keyboard on web.
  if (Platform.OS === "web") return;
  setTimeout(() => {
    if (focusedInput()) return;
    listeners.forEach((listener) => listener());
  }, 40);
}

/** Called when the keyboard starts to close. Returns the unsubscribe. */
export function onKeyboardLeaving(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
