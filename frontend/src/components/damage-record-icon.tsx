import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * Damage records in colour (user, 2026-11-10): a cracked window in a wooden
 * frame with an orange warning badge, in place of the flat blue mark.
 */
export function DamageRecordIcon({ repair = false, size = 48 }: { repair?: boolean; size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="damageGlass" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#DDF1FF" />
          <Stop offset="1" stopColor="#8CC6F2" />
        </LinearGradient>
        <LinearGradient id="damageFrame" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#D79A5C" />
          <Stop offset="1" stopColor="#A86A32" />
        </LinearGradient>
        <LinearGradient id="damageBadge" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="1" stopColor="#F07A1A" />
        </LinearGradient>
      </Defs>
      {/* Shadow, frame and glass. */}
      <Rect fill="rgba(0, 0, 0, 0.12)" height={44} rx={6} width={44} x={8} y={11} />
      <Rect fill="url(#damageFrame)" height={44} rx={6} width={44} x={6} y={8} />
      <Rect fill="url(#damageGlass)" height={34} rx={3} width={34} x={11} y={13} />
      {/* The crack, from a point of impact. */}
      <Path
        d="M27 27 L19 16 M27 27 L38 18 M27 27 L41 33 M27 27 L22 45 M27 27 L13 31 M23 22 L18 24 M33 22 L36 26 M33 30 L33 37"
        fill="none"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Circle cx={27} cy={27} fill="#FFFFFF" r={2.2} />
      {/* A glint on the glass. */}
      <Path d="M14 18 L18 14" stroke="rgba(255, 255, 255, 0.85)" strokeLinecap="round" strokeWidth={2} />
      {/* The warning badge. */}
      <Circle cx={47} cy={47} fill="#FFFFFF" r={12} />
      <Circle cx={47} cy={47} fill="url(#damageBadge)" r={10} />
      {repair ? (
        // Owners' Damages & Repairs (user, 2026-11-14): a spanner in the badge, for the repair.
        <Path
          d="M52.6 40.6a4.6 4.6 0 0 0-5.9 5.9l-6 6a1.7 1.7 0 0 0 2.4 2.4l6-6a4.6 4.6 0 0 0 5.9-5.9l-2.8 2.8-2.5-.6-.6-2.5Z"
          fill="#FFFFFF"
        />
      ) : (
        <>
          <Path d="M47 41 L47 48" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={3} />
          <Circle cx={47} cy={52.2} fill="#FFFFFF" r={1.7} />
        </>
      )}
    </Svg>
  );
}
