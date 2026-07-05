import { useNavigation, useRouter } from "expo-router";
import { useMemo } from "react";

// Timestamp of the last committed forward navigation, shared across the whole
// app. A second forward navigation anywhere within this window is treated as an
// accidental double tap and dropped.
let lastNavAt = 0;
const NAV_WINDOW_MS = 650;

/**
 * Drop-in replacement for expo-router's {@link useRouter} that guards the
 * forward-navigation methods (`push` / `navigate` / `replace`) against rapid
 * double taps. Two things caused the "opens the same page twice, and Back
 * returns to it again" bug:
 *
 *  1. A card pushed a screen, and a second tap landed before the transition
 *     started — so two identical entries were pushed.
 *  2. Different cards were tapped in quick succession.
 *
 * The guard blocks a navigation when either the initiating screen is no longer
 * focused (it already navigated away) or another navigation committed within
 * {@link NAV_WINDOW_MS}. Back / dismiss / setParams and everything else pass
 * straight through, so this is a safe swap for `const router = useRouter()`.
 */
export function useGuardedRouter() {
  const router = useRouter();
  const navigation = useNavigation();

  return useMemo(() => {
    const allow = () => {
      const now = Date.now();
      if (now - lastNavAt < NAV_WINDOW_MS) {
        return false;
      }
      const focused = typeof navigation.isFocused === "function" ? navigation.isFocused() : true;
      if (!focused) {
        return false;
      }
      lastNavAt = now;
      return true;
    };

    return {
      ...router,
      navigate: (...args: Parameters<typeof router.navigate>) => {
        if (allow()) {
          router.navigate(...args);
        }
      },
      push: (...args: Parameters<typeof router.push>) => {
        if (allow()) {
          router.push(...args);
        }
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        if (allow()) {
          router.replace(...args);
        }
      },
    };
  }, [navigation, router]);
}
