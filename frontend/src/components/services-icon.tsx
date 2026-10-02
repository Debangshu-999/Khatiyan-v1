import Svg, { Defs, LinearGradient, Rect, Stop, Path } from "react-native-svg";

/** Filled, softly shaded workspace tiles to pair with the home wallet artwork. */
export function ServicesIcon() {
  return <Svg width={56} height={46} viewBox="0 0 56 46">
    <Defs>
      <LinearGradient id="serviceTile" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#A96BE8" />
        <Stop offset="1" stopColor="#6426AC" />
      </LinearGradient>
    </Defs>
    <Rect x={5} y={7} width={46} height={36} rx={10} fill="#EAE0F7" />
    {[ [8, 3], [30, 3], [8, 25], [30, 25] ].map(([x, y]) => <Rect key={`${x}-${y}`} x={x} y={y} width={18} height={18} rx={5} fill="url(#serviceTile)" />)}
    <Path d="M13 10h8m-8 4h5M35 10h8m-8 4h5M13 32h8m-8 4h5M35 32h8m-8 4h5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={0.9} />
  </Svg>;
}
