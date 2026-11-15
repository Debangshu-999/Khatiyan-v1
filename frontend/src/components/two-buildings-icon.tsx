import Svg, { Path, Rect } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";

/**
 * Two square buildings side by side, in the line-icon style (user, 2026-11-08: the registered
 * properties on the Account tab).
 */
export function TwoBuildingsIcon({ color = "currentColor", size = 24, strokeWidth = 2 }: LucideProps) {
  return (
    <Svg fill="none" height={size} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}>
      <Rect height={11} rx={1} width={9} x={2} y={10} />
      <Rect height={14} rx={1} width={10} x={12} y={7} />
      <Path d="M5 13.5h1m2 0h0M5 17h1m2 0h0M15 10.5h1m2 0h1M15 14h1m2 0h1M16 21v-3h2v3" />
    </Svg>
  );
}
