import { useFonts } from "expo-font";
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from "@expo-google-fonts/playfair-display";

// Our copies, not the package's: the same Google Sans with Android-friendly vertical
// bounds, made by scripts/tools/patch-google-sans-metrics.py (user, 2026-11-07). The
// package's own bounds are so tall that Android padded every line of text with gaps.
const GoogleSans_400Regular = require("../../assets/fonts/google-sans/GoogleSans_400Regular.ttf");
const GoogleSans_500Medium = require("../../assets/fonts/google-sans/GoogleSans_500Medium.ttf");
const GoogleSans_500Medium_Italic = require("../../assets/fonts/google-sans/GoogleSans_500Medium_Italic.ttf");
const GoogleSans_600SemiBold = require("../../assets/fonts/google-sans/GoogleSans_600SemiBold.ttf");
const GoogleSans_700Bold = require("../../assets/fonts/google-sans/GoogleSans_700Bold.ttf");

/**
 * Loads the app's typefaces.
 *
 * <p>Every key here must match a `fontFamily` string in `typography.ts`. A
 * mismatch does not throw — the text quietly falls back to the system face,
 * which looks like the change never landed rather than like a bug.
 *
 * <p>Returns false until the files are ready. The root layout holds the native
 * splash over that window, because text drawn in the fallback and then reflowed
 * into the real face is a visible flash on every cold start.
 *
 * <p>A load failure counts as ready. The text falls back to the system face,
 * which is ugly but usable. Waiting for a load that failed would hold the splash
 * on screen forever.
 */
export function useAppFonts() {
  const [loaded, error] = useFonts({
    GoogleSans_400Regular,
    GoogleSans_500Medium,
    GoogleSans_500Medium_Italic,
    GoogleSans_600SemiBold,
    GoogleSans_700Bold,
    // The fancy face, for the owner's property name (user, 2026-11-14).
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });

  return loaded || error != null;
}
