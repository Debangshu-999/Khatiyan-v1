import { View } from "react-native";
import { useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme/use-theme";

// Shared ambient background used on every screen via ScreenScrollView. It is a
// very soft vertical wash plus two low-opacity colour orbs so screens feel
// cohesive with the auth hero without competing with foreground cards. Kept
// deliberately subtle in both light and dark modes.
export function AppBackground() {
  const { colors, isDark } = useTheme();
  const { height, width } = useWindowDimensions();

  const top = isDark ? "#0A0C12" : "#EFF3FC";
  const mid = isDark ? "#070708" : "#F7F9FD";
  const bottom = colors.background;

  const primaryGlow = colors.primary;
  const warmGlow = isDark ? "#1E293B" : "#F6C667";

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
            <Stop offset="0" stopColor={primaryGlow} stopOpacity={isDark ? 0.14 : 0.1} />
            <Stop offset="1" stopColor={primaryGlow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="app-orb-warm" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={warmGlow} stopOpacity={isDark ? 0.1 : 0.12} />
            <Stop offset="1" stopColor={warmGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#app-base)" height={height} width={width} x="0" y="0" />
        <Circle cx={width * 0.12} cy={height * 0.06} fill="url(#app-orb-primary)" r={width * 0.65} />
        <Circle cx={width * 0.96} cy={height * 0.82} fill="url(#app-orb-warm)" r={width * 0.55} />
      </Svg>
    </View>
  );
}
