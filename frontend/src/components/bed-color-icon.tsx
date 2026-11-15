import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * A bed in colour (user, 2026-11-11: no bland outlined glyph here): a wooden
 * frame, a white pillow and a blue blanket folded back.
 */
export function BedColorIcon({ size = 32 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="bedBlanket" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#6E8BFF" />
          <Stop offset="1" stopColor="#3E5BD8" />
        </LinearGradient>
        <LinearGradient id="bedWood" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#D49A5E" />
          <Stop offset="1" stopColor="#A56A33" />
        </LinearGradient>
      </Defs>
      {/* Headboard and legs. */}
      <Rect fill="url(#bedWood)" height={30} rx={4} width={8} x={6} y={16} />
      <Rect fill="url(#bedWood)" height={8} rx={2} width={6} x={7} y={44} />
      <Rect fill="url(#bedWood)" height={8} rx={2} width={6} x={52} y={44} />
      {/* Mattress. */}
      <Rect fill="#F3F5FA" height={10} rx={3} width={46} x={12} y={34} />
      <Rect fill="url(#bedWood)" height={5} rx={2} width={48} x={11} y={42} />
      {/* Pillow. */}
      <Rect fill="#FFFFFF" height={9} rx={4.5} stroke="#D7DDEB" strokeWidth={1} width={16} x={15} y={25} />
      {/* Blanket, folded back at the top. */}
      <Path d="M30 28 H55 a3 3 0 0 1 3 3 V40 H30 Z" fill="url(#bedBlanket)" />
      <Path d="M30 28 H55 a3 3 0 0 1 3 3 V32 H30 Z" fill="#A9BBFF" />
    </Svg>
  );
}
