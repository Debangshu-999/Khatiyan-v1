import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * Past requests in colour (user, 2026-11-10): a stack of filed request slips
 * with a clock badge, the requests that are over.
 */
export function PastRequestsIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="pastClock" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#8EA8FF" />
          <Stop offset="1" stopColor="#4B67E8" />
        </LinearGradient>
      </Defs>
      {/* Two slips behind, one in front. */}
      <Rect fill="#DCE5FB" height={34} rx={4} transform="rotate(-12 26 28)" width={26} x={13} y={11} />
      <Rect fill="#EEF2FD" height={34} rx={4} stroke="#C9D6F2" strokeWidth={1} transform="rotate(-5 28 28)" width={26} x={15} y={11} />
      <Rect fill="#FFFFFF" height={36} rx={4} stroke="#C9D6F2" strokeWidth={1.2} width={28} x={18} y={12} />
      <Path d="M23 20 H40 M23 26 H40 M23 32 H34" stroke="#9AA9C9" strokeLinecap="round" strokeWidth={2.2} />
      {/* The clock badge. */}
      <Circle cx={45} cy={46} fill="#FFFFFF" r={13} />
      <Circle cx={45} cy={46} fill="url(#pastClock)" r={11} />
      <Path d="M45 39.5 V46 L49.5 48.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}
