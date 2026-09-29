import { Linking, NativeModules, Platform } from "react-native";

/**
 * UIDAI's Aadhaar App, as this phone sees it.
 *
 * <p>Backed by the Kotlin module the `with-aadhaar-app` config plugin writes at
 * prebuild. It does not exist in Expo Go or in a build older than the plugin,
 * and then nothing here can say whether the Aadhaar App is installed. That is
 * reported as `null`, never as true: opening a session charges the owner, so
 * "cannot tell" must stop the flow rather than guess.
 */
const AADHAAR_APP_PACKAGE = "in.gov.uidai.pehchaan";

type AadhaarAppNative = {
  isInstalled(): Promise<boolean>;
  open(): Promise<boolean>;
  openLink(url: string): Promise<boolean>;
  /** Missing on a build from before 2026-09-27's Developer options check. */
  isDeveloperModeOn?(): Promise<boolean>;
  openDeveloperSettings?(): Promise<boolean>;
};

const native =
  Platform.OS === "android" ? (NativeModules.AadhaarApp as AadhaarAppNative | undefined) : undefined;

/** True, false, or null when this build cannot tell. */
export async function isAadhaarAppInstalled(): Promise<boolean | null> {
  if (!native) {
    return null;
  }
  try {
    return await native.isInstalled();
  } catch {
    return null;
  }
}

/** Opens the Aadhaar App at its start screen, for signing up. Costs nothing. */
export async function openAadhaarApp(): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.open();
  } catch {
    return false;
  }
}

/**
 * Whether Developer options is on. The Aadhaar App will not open while it is.
 * Null when this build cannot tell.
 */
export async function isDeveloperModeOn(): Promise<boolean | null> {
  if (!native?.isDeveloperModeOn) {
    return null;
  }
  try {
    return await native.isDeveloperModeOn();
  } catch {
    return null;
  }
}

/** Opens Developer options, where its own switch turns it off. */
export async function openDeveloperSettings(): Promise<boolean> {
  if (!native?.openDeveloperSettings) {
    return false;
  }
  try {
    return await native.openDeveloperSettings();
  } catch {
    return false;
  }
}

/** The Aadhaar App's Play Store page. */
export async function openAadhaarAppStore() {
  try {
    await Linking.openURL(`market://details?id=${AADHAAR_APP_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${AADHAAR_APP_PACKAGE}`);
  }
}

/**
 * Hands the tenant to the session: straight into the Aadhaar App when it takes
 * the link, otherwise through the browser. The server already turns Decentro's
 * QR-form link into the Aadhaar App's own `pehchaan://webIntentRequest` link
 * (`AadhaarIntentLinks`). The development stand-in is a web page, so it always
 * takes the browser path.
 */
export async function openAadhaarSession(url: string) {
  if (native) {
    try {
      if (await native.openLink(url)) {
        if (__DEV__) {
          console.log(`[aadhaar-app] session opened via ${url.split("?")[0]}`);
        }
        return;
      }
    } catch {
      // Fall through to the browser.
    }
  }
  await Linking.openURL(url);
}
