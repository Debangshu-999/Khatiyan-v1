import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

/**
 * Past bills in colour (user, 2026-11-14): a bill, its zigzag foot and a rupee
 * amount, with the clock badge Past requests wears, the bills that are over.
 */
export function PastBillsIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="pastBillClock" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#8EA8FF" />
          <Stop offset="1" stopColor="#4B67E8" />
        </LinearGradient>
        <LinearGradient id="pastBillHead" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#34C38F" />
          <Stop offset="1" stopColor="#1E9E6E" />
        </LinearGradient>
      </Defs>
      {/* An older bill behind. */}
      <Rect fill="#DCE5FB" height={38} rx={4} transform="rotate(-10 26 30)" width={28} x={12} y={10} />
      {/* The bill: paper with a zigzag foot. */}
      <Path
        d="M18 9 H44 a3 3 0 0 1 3 3 V49 l-3.5 -2.5 -3.5 2.5 -3.5 -2.5 -3.5 2.5 -3.5 -2.5 -3.5 2.5 -3.5 -2.5 -3.5 2.5 V12 a3 3 0 0 1 3 -3 Z"
        fill="#FFFFFF"
        stroke="#C9D6F2"
        strokeLinejoin="round"
        strokeWidth={1.2}
      />
      {/* Its green head with the rupee. */}
      <Rect fill="url(#pastBillHead)" height={9} rx={2.5} width={24} x={19} y={13} />
      <SvgText fill="#FFFFFF" fontSize={8} fontWeight="bold" textAnchor="middle" x={31} y={20.2}>₹</SvgText>
      {/* Lines, and the amount underlined. */}
      <Path d="M21 27 H41 M21 32.5 H36" stroke="#9AA9C9" strokeLinecap="round" strokeWidth={2} />
      <Path d="M21 39 H30" stroke="#1E9E6E" strokeLinecap="round" strokeWidth={2.6} />
      {/* The clock badge. */}
      <Circle cx={46} cy={47} fill="#FFFFFF" r={13} />
      <Circle cx={46} cy={47} fill="url(#pastBillClock)" r={11} />
      <Path d="M46 40.5 V47 L50.5 49.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}
