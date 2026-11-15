import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/** Tenancy tools drawings in colour (user, 2026-11-11). */

/** A filled red map pin with a white centre and a soft shadow under it. */
export function RedPinIcon({ size = 46 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="redPin" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FF6B6B" />
          <Stop offset="1" stopColor="#D92D20" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={24} cy={43} fill="rgba(0, 0, 0, 0.15)" rx={8} ry={2.2} />
      <Path d="M24 4 C15.7 4 10 10.2 10 18 C10 28.5 24 42 24 42 C24 42 38 28.5 38 18 C38 10.2 32.3 4 24 4 Z" fill="url(#redPin)" />
      <Circle cx={24} cy={18} fill="#FFFFFF" r={5.5} />
      <Path d="M16 11.5 a10 10 0 0 1 5 -4" fill="none" stroke="rgba(255, 255, 255, 0.6)" strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  );
}

/** A plate seen from above, a fork on the left and a spoon on the right. */
export function PlateIcon({ size = 46 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="plateRim" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D9DEE8" />
        </LinearGradient>
        <LinearGradient id="cutlery" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#C4C9D4" />
          <Stop offset="1" stopColor="#8A91A0" />
        </LinearGradient>
      </Defs>
      {/* The plate: rim, well and a light on it. */}
      <Circle cx={24} cy={24} fill="url(#plateRim)" r={17} stroke="#C9CFDB" strokeWidth={1} />
      <Circle cx={24} cy={24} fill="#F7F9FC" r={11.5} stroke="#DDE2EB" strokeWidth={1} />
      <Path d="M15 16 a12 12 0 0 1 6 -4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.6} />
      {/* The fork, left. */}
      <Rect fill="url(#cutlery)" height={18} rx={1} width={2.2} x={3.4} y={16} />
      <Path d="M2.4 6 V13 a2.4 2.4 0 0 0 4.8 0 V6 M4.5 6 V12" fill="none" stroke="#8A91A0" strokeLinecap="round" strokeWidth={1.3} />
      {/* The spoon, right. */}
      <Ellipse cx={43.5} cy={10.5} fill="url(#cutlery)" rx={3} ry={4.5} />
      <Rect fill="url(#cutlery)" height={19} rx={1} width={2.2} x={42.4} y={14} />
    </Svg>
  );
}
