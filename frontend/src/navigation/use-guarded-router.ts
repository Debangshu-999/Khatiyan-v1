import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { resetPressableTapLocks } from "@/components/animated-pressable";

// Share duplicate-tap protection between controls on one screen, not between
// different screens. A newly focused page must be usable immediately.
const lastNavAt = new WeakMap<object, number>();
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
 * focused (it already navigated away) or this same screen navigated within
 * {@link NAV_WINDOW_MS}. Focus/blur reset the lock, including hardware Back.
 * Back and dismiss clear it and dispatch immediately; API loading is unrelated.
 */
export function useGuardedRouter() {
  const router = useRouter();
  const navigation = useNavigation();
  useEffect(() => {
    const reset = () => { lastNavAt.delete(navigation); };
    const unfocus = navigation.addListener("blur", reset);
    const focus = navigation.addListener("focus", () => { reset(); resetPressableTapLocks(); });
    return () => { unfocus(); focus(); reset(); };
  }, [navigation]);

  return useMemo(() => {
    const allow = () => {
      const now = Date.now();
      const previous = lastNavAt.get(navigation);
      if (previous !== undefined && now - previous < NAV_WINDOW_MS) {
        return false;
      }
      const focused = typeof navigation.isFocused === "function" ? navigation.isFocused() : true;
      if (!focused) {
        return false;
      }
      lastNavAt.set(navigation, now);
      return true;
    };

    return {
      ...router,
      back: (...args: Parameters<typeof router.back>) => {
        lastNavAt.delete(navigation);
        router.back(...args);
      },
      dismiss: (...args: Parameters<typeof router.dismiss>) => {
        lastNavAt.delete(navigation);
        router.dismiss(...args);
      },
      dismissAll: (...args: Parameters<typeof router.dismissAll>) => {
        lastNavAt.delete(navigation);
        router.dismissAll(...args);
      },
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
