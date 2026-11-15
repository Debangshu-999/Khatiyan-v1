import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The property on the owner's Home card (user, 2026-11-14): a colour building
 * to sit with the card's drawn scene. A taller blue block with a coral roof
 * edge and a lower side wing, warm and sky windows, a blue entrance, a tree.
 */
export function PropertyHouseIcon({ size = 34 }: { size?: number }) {
  // Lit and unlit windows on the main block, three rows of two.
  const lit = [true, false, true, true, false, true];
  return (
    // A positioned box, so on web it paints over the card's absolute sky (2026-11-14).
    <View style={{ height: size, position: "relative", width: size }}>
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="bldMain" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#8FB0F5" />
          <Stop offset="1" stopColor="#4B67E8" />
        </LinearGradient>
        <LinearGradient id="bldWing" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#C9D8FA" />
          <Stop offset="1" stopColor="#9DB5EE" />
        </LinearGradient>
        <LinearGradient id="bldRoof" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#FF9A7A" />
          <Stop offset="1" stopColor="#E5484D" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="25" cy="45" fill="rgba(15, 23, 42, 0.14)" rx="18" ry="1.8" />
      {/* The side wing, behind the main block. */}
      <Rect fill="url(#bldWing)" height="20" rx="2" width="14" x="29" y="24" />
      <Rect fill="#FFF1BF" height="3.5" rx="0.8" width="8" x="32" y="28.5" />
      <Rect fill="#E3ECFC" height="3.5" rx="0.8" width="8" x="32" y="35" />
      {/* The main block, its roof edge and windows. */}
      <Rect fill="url(#bldMain)" height="36" rx="2.5" width="22" x="10" y="8" />
      <Rect fill="url(#bldRoof)" height="4" rx="1.5" width="25" x="8.5" y="6" />
      {lit.map((on, index) => (
        <Rect
          fill={on ? "#FFE08A" : "#D6E4FF"}
          height="5"
          key={index}
          rx="1"
          width="5.5"
          x={index % 2 === 0 ? 13.5 : 23}
          y={14 + Math.floor(index / 2) * 7.5}
        />
      ))}
      {/* The entrance. */}
      <Rect fill="#2E46B8" height="8" rx="1.5" width="7" x="17.5" y="36" />
      <Rect fill="#FFFFFF" height="1.6" opacity={0.6} rx="0.8" width="9" x="16.5" y="34.6" />
      {/* Light down the block's edge. */}
      <Path d="M12 11 V41" stroke="rgba(255, 255, 255, 0.35)" strokeLinecap="round" strokeWidth="1" />
      {/* A tree by the wing. */}
      <Rect fill="#9A7652" height="5" width="1.8" x="41.6" y="39.5" />
      <Circle cx="42.5" cy="37" fill="#5BAE7E" r="4" />
      <Circle cx="40.5" cy="38.6" fill="#7CC59A" r="2.6" />
    </Svg>
    </View>
  );
}
