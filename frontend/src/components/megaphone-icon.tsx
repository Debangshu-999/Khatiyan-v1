import Svg, { Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * A colour megaphone for the notice board card (user, 2026-11-14): the 3D
 * drawing was nearly lost on the board's blue, so this one is warm on purpose.
 * A yellow bell opening to the right, a coral cap and handle, and white sound
 * lines that read on any dark ground.
 */
export function MegaphoneIcon({ size = 30, soundColor = "#FFFFFF" }: {
  size?: number;
  /** The sound lines: white on the board's blue, a deep blue on a white glow. */
  soundColor?: string;
}) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="megaphoneBell" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFE082" />
          <Stop offset="0.55" stopColor="#FFC83D" />
          <Stop offset="1" stopColor="#F59E0B" />
        </LinearGradient>
        <LinearGradient id="megaphoneCoral" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FF8A80" />
          <Stop offset="1" stopColor="#E5484D" />
        </LinearGradient>
      </Defs>
      <G transform="rotate(-12 24 24)">
        {/* The handle, under the bell's narrow end. */}
        <Rect fill="url(#megaphoneCoral)" height={11} rx={2.5} width={6} x={14} y={27} />
        {/* The bell, narrow at the back and wide at the mouth. */}
        <Path d="M11 19.5 L33 9 L33 39 L11 28.5 Z" fill="url(#megaphoneBell)" />
        {/* A light along the top of the bell. */}
        <Path d="M13 20.5 L31 12" fill="none" stroke="#FFF6DA" strokeLinecap="round" strokeOpacity={0.85} strokeWidth={1.6} />
        {/* The cap at the back. */}
        <Rect fill="url(#megaphoneCoral)" height={11} rx={2.6} width={6} x={7} y={18.5} />
        {/* The mouth: its rim, and the darker inside. */}
        <Ellipse cx={33} cy={24} fill="#FFF3D6" rx={4.6} ry={15.2} />
        <Ellipse cx={33.6} cy={24} fill="#E08A00" rx={2.6} ry={12.4} />
      </G>
      {/* The sound, coming out of the mouth. */}
      <Path d="M41 17.5 Q44.5 21.5 41.5 26" fill="none" stroke={soundColor} strokeLinecap="round" strokeWidth={2.2} />
      <Path d="M44 13 Q49.5 20.5 44.8 29.5" fill="none" stroke={soundColor} strokeLinecap="round" strokeOpacity={0.75} strokeWidth={2.2} />
    </Svg>
  );
}
