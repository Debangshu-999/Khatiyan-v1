import { StyleSheet, View } from "react-native";
import { LinearGradient as FillGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The owner's property card ground (user, 2026-11-14), in place of the faded
 * photograph: a soft sky with a sun, a far skyline, a residence block with lit
 * windows, trees and a green rise. It keeps to the right; the left fades to the
 * card's own colour so the name and address stay clean.
 */
const LIGHT = {
  skyTop: "#DCE9FF",
  skyBottom: "#F7FAFF",
  sun: "#FFD966",
  glow: "#FFE8A3",
  cloud: "#FFFFFF",
  far: "#C7D7F5",
  block: "#8FAEEB",
  blockShade: "#7A9BDF",
  side: "#B9CCF3",
  window: "#FFF1BF",
  windowDim: "#DCE6FA",
  roof: "#6F8FD6",
  tree: "#7CC59A",
  treeDark: "#5BAE7E",
  trunk: "#9A7652",
  ground: "#D8EED9",
  fade: "#FFFFFF",
};

const DARK = {
  skyTop: "#18223F",
  skyBottom: "#121A2E",
  sun: "#F5D27A",
  glow: "#5A5236",
  cloud: "#2A3557",
  far: "#24304F",
  block: "#33467A",
  blockShade: "#2B3C6B",
  side: "#2B3962",
  window: "#F5D27A",
  windowDim: "#3A4A78",
  roof: "#3E5390",
  tree: "#2F6B4E",
  treeDark: "#265A41",
  trunk: "#5B4632",
  ground: "#1E3A2D",
  fade: "#121A2E",
};

/** The card's ground under the sky, its lower colour, so nothing else shows at the edges. */
export function propertyCardGround(dark: boolean) {
  return dark ? DARK.skyBottom : LIGHT.skyBottom;
}

export function PropertyCardScenery({ dark = false }: { dark?: boolean }) {
  const c = dark ? DARK : LIGHT;
  // Lit and dark windows, a fixed pattern so the block does not flicker between renders.
  const lit = [true, false, true, true, true, true, false, true, false, true, true, true];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* The sky across the whole card (user, 2026-11-14), the scene drawn over its right. */}
      <FillGradient colors={[c.skyTop, c.skyBottom]} end={{ x: 0, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      {/* Its own positioned box: on web a bare svg paints under the absolute sky above it. */}
      <View style={StyleSheet.absoluteFill}>
      <Svg height="100%" preserveAspectRatio="xMaxYMax meet" viewBox="0 0 360 110" width="100%">
        <Defs>
          <LinearGradient id="propSky" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={c.skyTop} />
            <Stop offset="1" stopColor={c.skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#propSky)" height="110" width="360" x="0" y="0" />

        {/* Sun with a soft glow, and two clouds. */}
        <Circle cx="318" cy="26" fill={c.glow} opacity={0.55} r="20" />
        <Circle cx="318" cy="26" fill={c.sun} r="11" />
        <G opacity={dark ? 0.6 : 0.95}>
          <Ellipse cx="262" cy="22" fill={c.cloud} rx="16" ry="5.5" />
          <Ellipse cx="272" cy="18.5" fill={c.cloud} rx="9" ry="5.5" />
          <Ellipse cx="214" cy="34" fill={c.cloud} rx="11" ry="4" />
        </G>

        {/* The far skyline. */}
        <Path
          d="M180 110 V80 H192 V70 H204 V84 H214 V64 H228 V78 H238 V72 H248 V110 Z M330 110 V74 H342 V66 H352 V80 H360 V110 Z"
          fill={c.far}
        />

        {/* The residence block, with a side wing and lit windows. */}
        <Rect fill={c.side} height="40" rx="2" width="30" x="296" y="70" />
        <Rect fill={c.block} height="62" rx="3" width="48" x="252" y="48" />
        <Rect fill={c.blockShade} height="62" width="8" x="292" y="48" />
        <Path d="M248 50 L276 36 L304 50 Z" fill={c.roof} />
        {lit.map((on, index) => (
          <Rect
            fill={on ? c.window : c.windowDim}
            height="6"
            key={index}
            rx="1"
            width="7"
            x={258 + (index % 3) * 12}
            y={56 + Math.floor(index / 3) * 12}
          />
        ))}
        <Rect fill={c.window} height="12" rx="1.5" width="9" x="268.5" y="98" />
        {[0, 1].map((row) => (
          <Rect fill={row === 0 ? c.window : c.windowDim} height="5" key={row} rx="1" width="14" x="304" y={78 + row * 11} />
        ))}

        {/* Trees either side of the block. */}
        <Rect fill={c.trunk} height="12" width="3" x="238.5" y="96" />
        <Circle cx="240" cy="90" fill={c.tree} r="10" />
        <Circle cx="235" cy="94" fill={c.treeDark} r="6" />
        <Rect fill={c.trunk} height="10" width="3" x="337.5" y="98" />
        <Circle cx="339" cy="93" fill={c.tree} r="8" />

        {/* The green rise along the bottom. */}
        <Path d="M150 110 C200 100 250 103 290 104 C320 105 345 101 360 99 V110 Z" fill={c.ground} />
      </Svg>
      </View>
    </View>
  );
}
