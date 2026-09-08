import { Platform } from "react-native";

/**
 * Whether the system already says "Copied" for us.
 *
 * <p>
 * Android 13 (API 33) shows its own clipboard confirmation whenever an app
 * writes to the clipboard, so a toast on top of it is the same word twice.
 * Android 12 and below show nothing at all, and those devices still need to be
 * told — this is a version gate rather than a straight removal for that reason.
 *
 * <p>
 * iOS shows nothing either, so it falls on the "tell them" side.
 *
 * <p>
 * Written once here rather than per screen. It was a local const in the chat
 * thread, which is why every other copy button in the app was double-announcing
 * on a modern phone.
 */
export const CLIPBOARD_ANNOUNCES_ITSELF = Platform.OS === "android" && Number(Platform.Version) >= 33;
