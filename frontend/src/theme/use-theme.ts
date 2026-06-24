import { useMemo } from "react";

import { themes, type ThemeMode } from "@/theme/colors";
import { radii, spacing } from "@/theme/spacing";
import { fonts, type } from "@/theme/typography";

export function useTheme() {
  // Dark mode is temporarily disabled while we polish the UI — force light
  // regardless of the saved preference. To re-enable, restore the
  // `state.appConfig.themeMode` selector and drive `mode` from it.
  return useMemo(
    () => ({
      mode: "light" as ThemeMode,
      colors: themes.light,
      isDark: false,
      fonts,
      type,
      spacing,
      radii,
    }),
    [],
  );
}
