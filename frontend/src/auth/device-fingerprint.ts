import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

import { devicePlatform } from "@/auth/device-identity";

const INSTALL_ID_KEY = "khatiyan.install-id";

/**
 * This installation of the app, generated once and kept in the keystore.
 *
 * <p>Ours rather than a platform identifier. Android's own ID is resettable by
 * the person and carries privacy expectations we would rather not inherit for
 * something this mundane; a value we mint ourselves is stable for as long as
 * the app is installed and means nothing outside it.
 *
 * <p>Read at module load and cached, because the fingerprint is assembled
 * synchronously at the moment somebody presses a button and a promise there
 * would mean either blocking the press or recording nothing.
 */
let installId: string | null = null;

export async function primeInstallId() {
  if (installId) {
    return;
  }

  try {
    const stored = await SecureStore.getItemAsync(INSTALL_ID_KEY);
    if (stored) {
      installId = stored;
      return;
    }

    const minted = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(INSTALL_ID_KEY, minted);
    installId = minted;
  } catch {
    // A keystore that will not answer is not a reason to block a signature.
    // The record is weaker without this field and still stands on the rest.
    installId = null;
  }
}

/**
 * How this device describes itself, for the evidence record on a declaration.
 *
 * <p>Every field is a claim, none of it is verified, and nothing branches on
 * it. Its value is consistency: the same person's declarations look alike month
 * after month, and one that does not is worth a second look.
 *
 * <p>Synchronous and total — a device that will not report its build number
 * still gets to sign.
 */
export function deviceFingerprint() {
  return {
    // From expo-constants, a direct dependency. expo-application would also
    // have this, but it is only here transitively and an import that works by
    // accident is one that breaks on the next install.
    appVersion: Constants.expoConfig?.version ?? null,
    brand: Device.brand ?? Device.manufacturer ?? null,
    installId,
    model: Device.modelName ?? null,
    osBuild: Device.osBuildId ?? null,
    osVersion: Device.osVersion ?? `${Platform.Version}`,
    platform: devicePlatform(),
  };
}
