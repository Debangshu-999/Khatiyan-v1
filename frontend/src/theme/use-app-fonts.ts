import {
  Inter_400Regular,
  Inter_500Medium,
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
 * <p>Returns false until the files are ready. The root layout renders nothing
 * over the background colour in that window, because text drawn in the fallback
 * and then reflowed into the real face is a visible flash on every cold start.
 */
export function useAppFonts() {
  const [loaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  return loaded;
}
