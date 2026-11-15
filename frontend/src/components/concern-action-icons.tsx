import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The Concerns screen's two tiles in colour (user, 2026-11-11), in place of
 * plain glyphs on grey.
 */

/** A speech bubble with a warning, and a green plus to raise one. */
export function CreateConcernIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="concernBubble" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#7C8DFF" />
          <Stop offset="1" stopColor="#4B5FE0" />
        </LinearGradient>
        <LinearGradient id="concernPlus" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#3CCB7F" />
          <Stop offset="1" stopColor="#079455" />
        </LinearGradient>
      </Defs>
      <Path d="M8 9 h26 a5 5 0 0 1 5 5 v14 a5 5 0 0 1 -5 5 h-13 l-7 6 v-6 h-6 a5 5 0 0 1 -5 -5 v-14 a5 5 0 0 1 5 -5 z" fill="url(#concernBubble)" />
      <Rect fill="#FFFFFF" height={10} rx={1.5} width={3.4} x={19.3} y={14} />
      <Circle cx={21} cy={28} fill="#FFFFFF" r={2} />
      <Circle cx={37} cy={35} fill="#FFFFFF" r={9} />
      <Circle cx={37} cy={35} fill="url(#concernPlus)" r={7.5} />
      <Path d="M37 31 V39 M33 35 H41" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.4} />
    </Svg>
  );
}

/** An archive box with a tick: concerns that are done with. */
export function ClosedConcernsIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="archiveLid" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#D49A5E" />
          <Stop offset="1" stopColor="#B07440" />
        </LinearGradient>
        <LinearGradient id="archiveBox" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#E9B477" />
          <Stop offset="1" stopColor="#C98A52" />
        </LinearGradient>
        <LinearGradient id="archiveTick" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#3CCB7F" />
          <Stop offset="1" stopColor="#079455" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#archiveBox)" height={22} rx={3} width={30} x={7} y={19} />
      <Rect fill="url(#archiveLid)" height={9} rx={2.5} width={34} x={5} y={11} />
      <Rect fill="#FFFFFF" height={4} opacity={0.85} rx={2} width={12} x={16} y={25} />
      <Circle cx={37} cy={36} fill="#FFFFFF" r={9} />
      <Circle cx={37} cy={36} fill="url(#archiveTick)" r={7.5} />
      <Path d="M33.5 36 L36 38.5 L40.5 33.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}
