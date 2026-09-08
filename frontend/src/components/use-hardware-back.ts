import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Makes the device back button do what a screen's own back control did.
 *
 * <p>
 * <b>Why this exists.</b> The app has no back buttons at the top of its screens
 * any more — the gesture and the hardware button are the way back, and an arrow
 * above every header was one more thing between the reader and the content. That
 * is safe where back simply means "leave", because Expo Router's stack already
 * pops on the hardware button. It is NOT safe where the button did something
 * else: stepping back through a wizard, closing an in-screen overlay, or asking
 * about unsaved changes first. Left unhandled, the hardware button unmounted the
 * whole screen from step four and threw away everything typed.
 *
 * <p>
 * Return {@code true} from the handler to say the press was dealt with and the
 * screen should stay; return {@code false} to let it fall through to the stack
 * and pop as usual. Pass {@code enabled: false} when there is nothing to
 * intercept — at the first step of a wizard, say — so the stack keeps its
 * ordinary behaviour rather than being blocked by a handler that does nothing.
 *
 * <p>
 * Android only in effect: iOS has no hardware back button, and the swipe gesture
 * is the stack's own. {@code BackHandler} is a no-op there.
 */
export function useHardwareBack(handler: () => boolean, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => subscription.remove();
  }, [enabled, handler]);
}
