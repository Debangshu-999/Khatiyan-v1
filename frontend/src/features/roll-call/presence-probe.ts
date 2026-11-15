import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Platform } from "react-native";

import type { RollCallCheckIn } from "@/store/services/roll-call-api";

/** What Android reports for the router when the app may not read it. */
const HIDDEN_BSSID = "02:00:00:00:00:00";

let configured = false;

/**
 * The router this phone is on (user, 2026-11-15, "Use this WiFi" and the
 * tenant's check-in). Android shows it only with the location permission, so
 * that is asked first. Null on web, off WiFi, or when Android hides it.
 */
export async function readWifi(): Promise<{ bssid: string | null; ssid: string | null }> {
  if (Platform.OS === "web") return { bssid: null, ssid: null };
  if (!configured) {
    NetInfo.configure({ shouldFetchWiFiSSID: true });
    configured = true;
  }
  const permission = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!permission || permission.status !== "granted") return { bssid: null, ssid: null };
  const state = await NetInfo.fetch("wifi").catch(() => null);
  if (!state || state.type !== "wifi" || !state.details) return { bssid: null, ssid: null };
  const details = state.details as { bssid?: string | null; ssid?: string | null };
  const bssid = details.bssid && details.bssid.toLowerCase() !== HIDDEN_BSSID ? details.bssid.toLowerCase() : null;
  return { bssid, ssid: details.ssid ?? null };
}

/**
 * What the tenant's phone can say about where it is, when they open the app in
 * the roll-call window (user, 2026-11-09): the router first, then the position
 * with Android's fake-location flag. No background check, ever. The server
 * decides whether it matches the property.
 */
export async function probePresence(): Promise<RollCallCheckIn> {
  const { bssid } = await readWifi();
  if (Platform.OS === "web") return { bssid: null };
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!permission || permission.status !== "granted") return { bssid };
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      accuracyMeters: position.coords.accuracy ?? undefined,
      bssid,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      mocked: position.mocked === true,
    };
  } catch {
    return { bssid };
  }
}
