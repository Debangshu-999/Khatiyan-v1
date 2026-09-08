import { View } from "react-native";
import { useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme/use-theme";

// Shared ambient background for screens that don't supply their own. Dark mode
// keeps the soft vertical wash and its colour orbs; light mode is flat white.
//
// The wash was a grey one while the page was grey, and its whole job was to
// stop cards floating on white at the top of a scroll and on grey at the foot.
// With the page back to white there is nothing to reconcile: an overhauled
// screen paints its own pale-blue band fading into white, and a screen still
// waiting its turn should be the same white underneath rather than a second,
// competing tint.
export function AppBackground() {
  const { colors, isDark } = useTheme();
  const { height, width } = useWindowDimensions();

  const top = isDark ? "#0A0C12" : colors.background;
  const mid = isDark ? "#070708" : colors.background;
  const bottom = colors.background;

  // Both orbs are dark-mode only, so neither carries a light-mode value.
  const primaryGlow = colors.primary;
  const warmGlow = "#1E293B";

  return (
    <View style={{ flex: 1 }}>
      <Svg height={height} width={width}>
        <Defs>
          <LinearGradient id="app-base" x1="0" x2="0.3" y1="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
          <RadialGradient id="app-orb-primary" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={primaryGlow} stopOpacity="0.14" />
            <Stop offset="1" stopColor={primaryGlow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="app-orb-warm" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={warmGlow} stopOpacity="0.1" />
            <Stop offset="1" stopColor={warmGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#app-base)" height={height} width={width} x="0" y="0" />
        {isDark ? (
          <>
            <Circle cx={width * 0.12} cy={height * 0.06} fill="url(#app-orb-primary)" r={width * 0.65} />
            <Circle cx={width * 0.96} cy={height * 0.82} fill="url(#app-orb-warm)" r={width * 0.55} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
