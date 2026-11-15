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
 * <p>Discover, Chats, Manage and Account keep their original treatment. Home
 * now explicitly opts into the phone-visible shadows used inside modules
 * (user, 2026-10-29).
 */
export function tabShadow(color: string, offsetY: number, blur: number, opacity = 1): ViewStyle {
  return { shadowColor: color, shadowOffset: { height: offsetY, width: 0 }, shadowOpacity: opacity, shadowRadius: blur };
}

/**
 * The shadow for a piece that is drawn on tab screens and module screens
 * alike: the new one inside a module or Home, the old one on other tabs.
 * Asked once at the top of the component, then used like {@link softShadow}.
 */
/**
 * Every card's depth, app wide (user, 2026-11-13): the owner's Edit property
 * room-tab cards' look: a faint, tight shadow at 28% and thicker, darker
 * bottom, right and left edges (user, 2026-11-13), so a card reads as raised without a visible shadow under it.
 * Not for floating things (sheets, toasts, the map's overlays), which keep
 * softShadow.
 *
 * <p>The edge stands in for `elevation: 1`, drawn by hand (user, 2026-11-13).
 * On a phone that elevation WAS the 3D look, a dark rim heaviest along the
 * bottom, but Android draws it at full strength while a tab cross-fades, so the
 * old tab's cards flashed a shadow. A border is ordinary drawing and fades with
 * its screen. Never put elevation back on a card.
 */
export function cardShadow(color: string): ViewStyle {
  return {
    ...softShadow(color, 3, 9, 0.28),
    borderBottomColor: deepened(color, 1.1),
    borderBottomWidth: 2,
    borderLeftColor: deepened(color, 1.1),
    borderLeftWidth: 2,
    borderRightColor: deepened(color, 1.1),
    borderRightWidth: 2,
  };
}

/** The colour at more than its own strength, for an edge drawn where a shadow was. Capped at solid. */
function deepened(color: string, factor: number) {
  const parts = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (!parts) return color;
  const alpha = Math.min(1, Math.round(Number(parts[4]) * factor * 1000) / 1000);
  return `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${alpha})`;
}

export function useSoftShadow() {
  // App wide now (user, 2026-11-09): every tab draws the shadow a phone shows,
  // not only Home and the modules. Kept as a hook so callers need no change.
  return softShadow;
}

/** The colour at part of its own strength. Only an rgba() colour can be weakened, and the theme's shadow is one. */
function faded(color: string, opacity: number) {
  if (opacity >= 1) return color;
  const parts = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (!parts) return color;
  const alpha = Math.round(Number(parts[4]) * opacity * 1000) / 1000;
  return `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${alpha})`;
}
