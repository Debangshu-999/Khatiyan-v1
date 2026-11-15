import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * A golden key, slanted with its head down (user, 2026-11-11): the Tenancy
 * tools card's mark. Drawn upright with the head at the bottom, then turned.
 */
export function GoldenKeyIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Defs>
        <LinearGradient id="goldenKey" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFE08A" />
          <Stop offset="0.5" stopColor="#F5B524" />
          <Stop offset="1" stopColor="#C98A00" />
        </LinearGradient>
      </Defs>
      <G transform="rotate(35 12 12)">
        {/* The shaft, rising from the head, with two teeth on the right. */}
        <Rect fill="url(#goldenKey)" height={12} rx={1} width={3} x={10.5} y={2} />
        <Rect fill="url(#goldenKey)" height={2} rx={0.6} width={3} x={13} y={3} />
        <Rect fill="url(#goldenKey)" height={2} rx={0.6} width={2.2} x={13} y={6.5} />
        {/* The head, at the bottom, with its hole. */}
        <Circle cx={12} cy={17} fill="url(#goldenKey)" r={5} stroke="#B07A00" strokeWidth={0.6} />
        <Circle cx={12} cy={17} fill="#FFFFFF" r={1.8} />
        <Path d="M9.6 14.6 a3.4 3.4 0 0 1 2.4 -1" fill="none" stroke="rgba(255, 255, 255, 0.75)" strokeLinecap="round" strokeWidth={0.9} />
      </G>
    </Svg>
  );
}
