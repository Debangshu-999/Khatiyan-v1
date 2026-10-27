import { useSegments } from "expo-router";
import { Platform, type ViewStyle } from "react-native";

/**
 * A soft drop shadow that a phone draws the way a browser does (user,
 * 2026-10-11: "every card on the screen in browser has a subtle shadow to it,
 * this is missing in device not just for this screen but all screens").
 *
 * <p>The app's shadows were written as {@code shadowColor}, {@code shadowOffset},
 * {@code shadowOpacity} and {@code shadowRadius}, with an {@code elevation}
 * beside them for Android. A browser turns the first four into a box shadow.
 * Android ignores all four, and draws {@code elevation} in the shadow colour,
 * which here is a slate at 16 percent: too faint to see. So a card had its
 * lift in the browser and sat flat on a phone.
 *
 * <p>{@code boxShadow} is one description both draw. Android has it from
 * version 9. Before that it falls back to a plain elevation, which is the
 * system's own shadow and the nearest thing that version has.
 *
 * @param color   the theme's shadow colour, with its own transparency
 * @param offsetY how far down the shadow falls
 * @param blur    how far it spreads as it fades
 * @param opacity how much of the colour's own strength it keeps, as
 *                {@code shadowOpacity} was
 */
export function softShadow(color: string, offsetY: number, blur: number, opacity = 1): ViewStyle {
  return {
    boxShadow: `0px ${offsetY}px ${blur}px 0px ${faded(color, opacity)}`,
    ...(Platform.OS === "android" && Number(Platform.Version) < 28 ? { elevation: Math.max(1, Math.round(blur / 4)) } : {}),
  };
}

/**
 * What a card on one of the tab screens keeps: the shadow exactly as it was
 * written before, which a browser draws and a phone does not.
 *
 * <p>The new shadow is for the screens inside a module only (user,
 * 2026-10-11: "The box shadow should only apply in the screen inside a module
 * not the 5 tabs of home, discover, chat, manage and account"). So the tabs
 * are left as they were, on both.
 */
export function tabShadow(color: string, offsetY: number, blur: number, opacity = 1): ViewStyle {
  return { shadowColor: color, shadowOffset: { height: offsetY, width: 0 }, shadowOpacity: opacity, shadowRadius: blur };
}

/**
 * The shadow for a piece that is drawn on tab screens and module screens
 * alike, such as a card: the new one inside a module, the old one on a tab.
 * Asked once at the top of the component, then used like {@link softShadow}.
 */
export function useSoftShadow() {
  // The same test the screen's scroll view uses to leave room for the tab bar.
  const onATab = useSegments()[0] === "(tabs)";
  return onATab ? tabShadow : softShadow;
}

/** The colour at part of its own strength. Only an rgba() colour can be weakened, and the theme's shadow is one. */
function faded(color: string, opacity: number) {
  if (opacity >= 1) return color;
  const parts = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (!parts) return color;
  const alpha = Math.round(Number(parts[4]) * opacity * 1000) / 1000;
  return `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${alpha})`;
}
