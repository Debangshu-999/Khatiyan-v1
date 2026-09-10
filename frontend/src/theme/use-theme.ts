import { useMemo } from "react";

import { useAppSelector } from "@/store/hooks";
import { themes, type ThemeMode } from "@/theme/colors";
import { radii, spacing } from "@/theme/spacing";
import { tenantFonts, tenantType } from "@/theme/tenant-typography";
import { fonts, type } from "@/theme/typography";

export function useTheme() {
  const tenantFacing = useAppSelector((state) => state.account.activeAccount === "tenant");

  // Dark mode is temporarily disabled while we polish the UI — force light
  // regardless of the saved preference. To re-enable, restore the
  // `state.appConfig.themeMode` selector and drive `mode` from it.
  return useMemo(
    () => ({
      mode: "light" as ThemeMode,
      colors: themes.light,
      isDark: false,
      fonts: tenantFacing ? tenantFonts : fonts,
      tenantFacing,
      type: tenantFacing ? tenantType : type,
      spacing,
      radii,
    }),
    [tenantFacing],
  );
}
