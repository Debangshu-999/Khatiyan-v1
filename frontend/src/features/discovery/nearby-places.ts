import type { MaterialCommunityIcons } from "@expo/vector-icons";

/** Shared vocabulary for the tenant's nearby map and its search sheet. */

export type MaterialGlyph = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * A glyph per suggested category, so a bubble reads before its label does.
 *
 * <p>Keyed by the query the chip sends, which is also what a typed search
 * matches against — so a person who types "pharmacy" gets the same pill icon
 * beside the suggestion that the chip carries.
 */
export const CHIP_GLYPHS: Record<string, MaterialGlyph> = {
  atm: "cash",
  bank: "bank",
  pharmacy: "pill",
  "petrol pump": "gas-station",
  "police station": "police-badge",
  restaurant: "silverware-fork-knife",
};

/** "820 m" under a kilometre, "1.4 km" over it. */
export function formatMetres(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * A Google Maps directions link that opens the APP, not a browser tab.
 *
 * <p>`maps/dir/?api=1` is Google's documented universal form: Android and iOS
 * both hand it to the installed Google Maps app, and it degrades to the web
 * only where the app is absent. Mappls' own `mappls.com/<eLoc>` link went to
 * the browser every time, which is a page about a place rather than a route.
 *
 * <p>Coordinates when we have them. A live Mappls result usually has none — it
 * carries an eLoc, which means nothing to Google — so those fall back to the
 * name and address as a destination query, which is what a person would have
 * typed anyway.
 */
export function googleDirectionsUrl(
  name: string,
  address: string | null,
  latitude: number | null,
  longitude: number | null,
): string {
  const destination =
    latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : encodeURIComponent([name, address].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
