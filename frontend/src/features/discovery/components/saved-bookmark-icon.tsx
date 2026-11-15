import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/theme/use-theme";

/**
 * The saved mark (user, 2026-11-14): a bookmark filled blue with a black outline
 * round its shape. On the profile's save button and the saved cards' bookmark.
 */
export function SavedBookmarkIcon({ size = 21 }: { size?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M6.5 2.5h11a1.5 1.5 0 0 1 1.5 1.5v17.2l-7-4.6-7 4.6V4a1.5 1.5 0 0 1 1.5-1.5Z"
        fill={colors.primary}
        stroke={isDark ? colors.ink : "#000000"}
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}
