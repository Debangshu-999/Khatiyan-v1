import { useMemo } from "react";

import { useAppSelector } from "@/store/hooks";
import { themes } from "@/theme/colors";
import { radii, spacing } from "@/theme/spacing";
import { fonts, type } from "@/theme/typography";

export function useTheme() {
  const themeMode = useAppSelector((state) => state.appConfig.themeMode);

  return useMemo(
    () => ({
      mode: themeMode,
      colors: themes[themeMode],
      isDark: themeMode === "dark",
      fonts,
      type,
      spacing,
      radii,
    }),
    [themeMode],
  );
}
