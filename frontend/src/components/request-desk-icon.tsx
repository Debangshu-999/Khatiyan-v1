import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The Request desk in colour (user, 2026-11-10): a request slip behind a gold
 * service bell on a wooden counter, the desk you ring to ask for something.
 */
export function RequestDeskIcon({ size = 48 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="deskBell" x1="0.2" x2="0.85" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFF0A8" />
          <Stop offset="0.45" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#E09400" />
        </LinearGradient>
        <LinearGradient id="deskTop" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#C98A52" />
          <Stop offset="1" stopColor="#97602E" />
        </LinearGradient>
      </Defs>
      {/* The request slip, tilted behind the bell. */}
      <Rect fill="#FFFFFF" height={30} rx={3} stroke="#C9D6F2" strokeWidth={1.2} transform="rotate(-10 34 20)" width={24} x={30} y={5} />
      <Path d="M35 13 L49 10.5 M35.8 18 L50 15.5 M36.6 23 L46 21.3" stroke="#5B7CFA" strokeLinecap="round" strokeWidth={2} />
      <Circle cx={51} cy={27} fill="#30A46C" r={4.5} />
      <Path d="M48.9 27 L50.5 28.6 L53.3 25.6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
      {/* The counter. */}
      <Rect fill="url(#deskTop)" height={9} rx={2.5} width={56} x={4} y={48} />
      <Rect fill="#7A4A20" height={3} rx={1.5} width={56} x={4} y={55} />
      {/* The bell: base, dome, knob and shine. */}
      <Ellipse cx={24} cy={46.5} fill="#B9B9C2" rx={16} ry={3} />
      <Path d="M9.5 45 C9.5 33 15.5 26.5 24 26.5 C32.5 26.5 38.5 33 38.5 45 Z" fill="url(#deskBell)" stroke="#C98400" strokeWidth={0.8} />
      <Rect fill="#D18B00" height={4} rx={1} width={4} x={22} y={23} />
      <Ellipse cx={24} cy={22} fill="#E3A100" rx={4} ry={2} />
      <Ellipse cx={17.5} cy={34} fill="rgba(255, 255, 255, 0.7)" rx={2} ry={5} transform="rotate(25 17.5 34)" />
    </Svg>
  );
}
