import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The action centre as a 3D clipboard (user, 2026-11-14), beside the owner's
 * yellow bell and drawn the same way: a light board, a coral clip, and a list
 * of ticks and lines, with a soft shadow under it.
 */
export function ActionCenter3D({ size = 28 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 32 32" width={size}>
      <Defs>
        <LinearGradient id="actionBoard" x1="0.1" x2="0.9" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#DCE5F7" />
        </LinearGradient>
        <LinearGradient id="actionBack" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#7FA2F5" />
          <Stop offset="1" stopColor="#3D63D9" />
        </LinearGradient>
        <LinearGradient id="actionClip" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FF9A7A" />
          <Stop offset="1" stopColor="#E5484D" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="16" cy="30.2" fill="rgba(0, 0, 0, 0.16)" rx="9" ry="1.5" />
      {/* The board's blue back, then the paper on it. */}
      <Rect fill="url(#actionBack)" height="25" rx="3.2" width="21" x="5.5" y="4.5" />
      <Rect fill="url(#actionBoard)" height="21" rx="2" width="17" x="7.5" y="7" />
      {/* The clip. */}
      <Rect fill="url(#actionClip)" height="5" rx="1.6" width="10" x="11" y="2.4" />
      <Circle cx="16" cy="4.2" fill="#FFFFFF" r="1" />
      {/* Two ticked rows and an open one. */}
      <Path d="M10 12.3 l1.3 1.3 2.4 -2.6" fill="none" stroke="#16A34A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <Path d="M15.5 12.4 H22" stroke="#9AA9C9" strokeLinecap="round" strokeWidth="1.6" />
      <Path d="M10 17.6 l1.3 1.3 2.4 -2.6" fill="none" stroke="#16A34A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <Path d="M15.5 17.7 H22" stroke="#9AA9C9" strokeLinecap="round" strokeWidth="1.6" />
      <Rect fill="none" height="2.6" rx="0.6" stroke="#9AA9C9" strokeWidth="1.2" width="2.6" x="10.3" y="21.6" />
      <Path d="M15.5 22.9 H20" stroke="#9AA9C9" strokeLinecap="round" strokeWidth="1.6" />
      {/* Light on the board's edge. */}
      <Path d="M7 9 V24" stroke="rgba(255, 255, 255, 0.55)" strokeLinecap="round" strokeWidth="0.9" />
    </Svg>
  );
}
