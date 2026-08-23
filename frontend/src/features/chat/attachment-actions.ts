import { Platform } from "react-native";

import type { ChatAttachment } from "@/store/services/chat-api";

/**
 * What went wrong, in words a person can act on.
 *
 * <p>Thrown rather than returned so every caller has to deal with it. The
 * failures here are all things the reader can do something about — grant a
 * permission, install a reader, reconnect — and a silently swallowed one leaves
 * them tapping a button that appears to do nothing.
 */
export class AttachmentError extends Error {}

/**
 * The native modules behind these two actions, resolved on use.
 *
 * <p>Deliberately not top-level imports. Each of these throws from its own
 * module body when the matching native code is missing from the installed
 * binary, and a static import takes the whole route down with it: expo-router
 * cannot read `ErrorBoundary` off a module that never finished evaluating, so
 * the reader gets a blank screen instead of a chat.
 *
 * <p>Loaded here, a binary built before these packages were added costs the
 * person Save and Open — with a message saying so — and nothing else.
 */
function native() {
  try {
    return {
      FileSystem: require("expo-file-system") as typeof import("expo-file-system"),
      IntentLauncher: require("expo-intent-launcher") as typeof import("expo-intent-launcher"),
      LegacyFileSystem: require("expo-file-system/legacy") as typeof import("expo-file-system/legacy"),
      MediaLibrary: require("expo-media-library") as typeof import("expo-media-library"),
    };
  } catch {
    throw new AttachmentError(
      "This copy of the app was built before attachment support was added. Reinstall it to save and open attachments.",
    );
  }
}

/**
 * Pulls a remote attachment into the app's cache directory.
 *
 * <p>Both actions below need the bytes on disk. Android will not hand a remote
 * https URL to another app, and the media store saves from a local path.
 *
 * <p>The cache, not documents: these are copies of something that already lives
 * on the server, and the system is welcome to reclaim them.
 */
async function download(url: string, fileName?: string | null) {
  const { FileSystem } = native();

  // Named after the sender's own filename where there is one, so the app that
  // opens it shows "Rent agreement.pdf" rather than the storage id we happen to
  // have stored it under.
  const named = fileName ? new FileSystem.File(FileSystem.Paths.cache, safeName(fileName)) : null;

  try {
    return await FileSystem.File.downloadFileAsync(url, named ?? FileSystem.Paths.cache, {
      // Without this the second tap on the same attachment throws, because the
      // copy left in the cache by the first one is still there.
      idempotent: true,
    });
  } catch {
    throw new AttachmentError("That file could not be downloaded. Check your connection and try again.");
  }
}

/**
 * A filename the cache directory will accept.
 *
 * <p>The sender chose this string on their own device and it reaches us
 * unaltered, so it can carry separators. Anything that could climb out of the
 * cache directory becomes an underscore.
 */
function safeName(fileName: string) {
  const cleaned = fileName.replace(/[/\\:*?"<>|]/g, "_").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "attachment";
}

/**
 * Writes an image into the device gallery, asking first if it has to.
 *
 * <p>Write-only permission. Saving a picture is not a reason to be able to read
 * everything else in someone's gallery, and on Android 13+ the narrower request
 * is a different, less alarming prompt.
 */
export async function saveImageToDevice(url: string) {
  const { MediaLibrary } = native();

  if (!(await ensureCanSave())) {
    throw new AttachmentError(
      "Khatiyan needs permission to save pictures. You can grant it in Settings under Permissions.",
    );
  }

  const file = await download(url);
  try {
    await MediaLibrary.Asset.create(file.uri);
  } catch {
    throw new AttachmentError("That image could not be saved to your gallery.");
  }
}

/**
 * Asks for gallery-write access, but only when it is not already held.
 *
 * <p>Checking first matters: on Android a request that has been denied twice
 * never shows a prompt again, so re-requesting a permission already granted
 * would be a no-op while re-requesting a denied one looks like nothing
 * happened. The refusal message points at Settings for exactly that case.
 */
async function ensureCanSave() {
  const { MediaLibrary } = native();

  const existing = await MediaLibrary.getPermissionsAsync(true);
  if (existing.granted) {
    return true;
  }
  if (!existing.canAskAgain) {
    return false;
  }

  const requested = await MediaLibrary.requestPermissionsAsync(true);
  return requested.granted;
}

/**
 * Hands a document to whatever app on the device can read it.
 *
 * <p>Deliberately not a preview of our own. A PDF, a spreadsheet and a scan of
 * an agreement all want different readers, and the one the person already uses
 * will beat anything rendered here — it has their zoom, their annotations and
 * their print setup.
 *
 * <p>Android is handed a `content://` URI, never the `file://` one. Passing a
 * file URI across an app boundary throws `FileUriExposedException`; the content
 * URI is granted through the app's FileProvider and is what the receiving app
 * is allowed to read.
 */
export async function openFileWithApp(attachment: ChatAttachment) {
  if (Platform.OS !== "android") {
    throw new AttachmentError("Opening files is only supported on Android.");
  }

  const { IntentLauncher, LegacyFileSystem } = native();
  const file = await download(attachment.url, attachment.fileName);
  const contentUri = await LegacyFileSystem.getContentUriAsync(file.uri);

  try {
    // The literal action, because ActivityAction only enumerates the Settings
    // screens — there is no VIEW constant to reach for.
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      // Read permission for the app that gets picked. Without it the chooser
      // still appears and the app it opens sees nothing.
      flags: 1,
      type: attachment.contentType ?? "*/*",
    });
  } catch {
    throw new AttachmentError("No app on this device can open that file.");
  }
}
