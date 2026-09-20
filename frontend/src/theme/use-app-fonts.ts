import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useInterFonts,
} from "@expo-google-fonts/inter";
import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

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
  const [loaded, error] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  return loaded || error != null;
}
