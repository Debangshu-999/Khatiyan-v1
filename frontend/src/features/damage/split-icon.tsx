import Svg, { Circle, Path } from "react-native-svg";

/**
 * A line rising from a dot and splitting in two: a cost shared equally
 * between the room's tenants (user, 2026-10-29).
 */
export function SplitIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx={12} cy={20} fill={color} r={2.2} />
      <Path d="M12 18v-6M12 12 6.5 5M12 12l5.5-7" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      <Path d="M5.5 8.5 6.2 4.6 10 5.4M18.5 8.5l-.7-3.9-3.8.8" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}
