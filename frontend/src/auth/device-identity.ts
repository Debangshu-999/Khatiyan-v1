import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * How this device names itself to the server, for the signed-in devices list.
 *
 * <p>Sent as headers on every request rather than in a login body: a token is
 * issued from six different endpoints — PIN, OTP, e-mail link, Firebase, PIN
 * set, PIN reset — and a body field would have to be threaded through all of
 * them. Headers ride along regardless of which one is being called.
 *
 * <p>Display only. The server length-caps these and never makes a decision on
 * them, because anything a client sends is a claim rather than a fact.
 */
export function deviceLabel() {
  // modelName is what a person recognises ("Pixel 8", "iPhone 15"). deviceName
  // is their own name for it ("Ezio's phone") and is nicer when present, but it
  // is null on plenty of Android builds and on web.
  const named = Device.deviceName?.trim();
  if (named) {
    return named;
  }

  const model = Device.modelName?.trim();
  if (model) {
    return model;
  }

  // Last resort so a row is never blank. The server falls back to the User-Agent
  // if even this is missing.
  return Platform.OS === "web" ? "Web browser" : `${Platform.OS} device`;
}

/**
 * The device FORM FACTOR, not the OS.
 *
 * <p>The list shows an icon per device, and "android" cannot choose between a
 * phone and a tablet — which is the distinction someone scanning the list is
 * actually making. The OS is already implied by the model name in the label.
 *
 * <p>Falls back to `Platform.OS` when expo-device cannot tell: a wrong icon is
 * worse than a generic one.
 */
export function devicePlatform() {
  if (Platform.OS === "web") {
    return "web";
  }

  switch (Device.deviceType) {
    case Device.DeviceType.PHONE:
      return "phone";
    case Device.DeviceType.TABLET:
      return "tablet";
    case Device.DeviceType.DESKTOP:
      return "desktop";
    case Device.DeviceType.TV:
      return "tv";
    default:
      return Platform.OS;
  }
}
