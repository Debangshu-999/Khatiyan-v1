import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Opt-in highlights, never a replacement for ordinary operational cards. */
export const highlightPalette = {
  night: { gradient: ["#101B3E", "#24366A", "#4A4278"], ink: "#FFFFFF", muted: "#D9E2FF", line: "#6675A5", art: "#D8D3FF" },
  visit: { gradient: ["#123D65", "#145968", "#1A6468"], ink: "#FFFFFF", muted: "#D3F4F3", line: "#559698", art: "#C5F4ED" },
  finance: { gradient: ["#18294F", "#303C77", "#514C8C"], ink: "#FFFFFF", muted: "#DDE5FF", line: "#7883AD", art: "#D1DCFF" },
  collections: { gradient: ["#0B302D", "#124C40", "#1C6351"], ink: "#FFFFFF", muted: "#D9F1E6", line: "#5B8C75", art: "#E7D6A3" },
  // Soft lavender, not mint or yellow (user, 2026-11-08: the Expense tracker budget card).
  budget: { gradient: ["#FAF7FF", "#F1EAFD", "#E6DCF9"], ink: "#2E2452", muted: "#5F5583", line: "#DCD0F2", art: "#7559C2" },
  warm: { gradient: ["#FFF9EE", "#FFF0D8", "#F8E3C7"], ink: "#49301C", muted: "#75573E", line: "#E5CEAE", art: "#B77933" },
  leads: { gradient: ["#F3F7FF", "#EDF0FF", "#E9E5FA"], ink: "#253764", muted: "#586381", line: "#D2D8ED", art: "#7774BC" },
  booking: { gradient: ["#F1F8FF", "#E7F2FC", "#DCEEF1"], ink: "#173D57", muted: "#4C677A", line: "#BDDAE6", art: "#468C9E" },
  property: { gradient: ["#FFFDF7", "#F9F2E5", "#F2E7D2"], ink: "#392F22", muted: "#6E6252", line: "#DDD0BA", art: "#A58B5E" },
  // Soft coral to peach, for damage and repairs (user, 2026-11-07: the levels toggle).
  damage: { gradient: ["#FFF6F3", "#FDE9E2", "#F8DCD1"], ink: "#4A2620", muted: "#7A5048", line: "#EFCFC4", art: "#C2654F" },
} as const;

type HighlightProps = {
  children: ReactNode;
  /** False drops the variant's picture (the warm bowl, say) and keeps the circles behind it. */
  motif?: boolean;
  variant: keyof typeof highlightPalette;
  /** Any style form: a bottom sheet hands its panel an array (grabber room). */
  style?: StyleProp<ViewStyle>;
};

/** A clipped gradient header/panel. Decoration cannot capture taps or be read aloud. */
export function HighlightPanel({ children, motif = true, variant, style }: HighlightProps) {
  const palette = highlightPalette[variant];
  return (
    <LinearGradient
      colors={palette.gradient}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      // Layered, never spread: spreading an array style made "0" and "1" keys, which the web refuses.
      style={[{ backgroundColor: palette.gradient[0], borderColor: palette.line, borderRadius: radii.card, borderWidth: 1, gap: spacing.md, overflow: "hidden", padding: spacing.md }, style]}
    >
      <HighlightArtwork motif={motif} variant={variant} />
      {children}
    </LinearGradient>
  );
}

/** Shadow lives outside the clipped artwork, so Android does not cut it off. */
export function HighlightCard(props: HighlightProps) {
  const { colors } = useTheme();
  return <View style={{ borderRadius: radii.card, ...cardShadow(colors.shadow) }}><HighlightPanel {...props} /></View>;
}

function HighlightArtwork({ motif = true, variant }: { motif?: boolean; variant: keyof typeof highlightPalette }) {
  const stroke = highlightPalette[variant].art;
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={260} height={180} viewBox="0 0 260 180" style={{ position: "absolute", right: -24, bottom: -24 }}>
        <Circle cx={190} cy={103} r={85} fill={stroke} opacity={0.045} />
        {/* No ring inside it (user, 2026-11-08: "remove this from all card designs"). */}
        {/* The leads card keeps its circles and loses the two wavy lines (user, 2026-11-07). */}
        {!motif || variant === "collections" || variant === "leads" || variant === "budget" ? null : variant === "night" ? <>
          {[[25, 38], [88, 17], [134, 66], [191, 25], [227, 93], [47, 128]].map(([cx, cy], index) => <Circle key={index} cx={cx} cy={cy} r={1.3} fill={stroke} opacity={0.65} />)}
          <Path d="M186 40v8m-4-4h8M216 123v6m-3-3h6" stroke={stroke} opacity={0.5} />
        </> : variant === "warm" ? <Path d="M128 102h85c-3 29-17 43-42 43s-40-14-43-43Zm-8 48h102M150 86c-18-19 19-23 0-43m22 43c-18-19 19-23 0-43m22 43c-18-19 19-23 0-43" fill="none" stroke={stroke} opacity={0.16} strokeWidth={2} strokeLinecap="round" />
          : variant === "property" || variant === "visit" ? <Path d="M108 153V72h51v81m0-112h52v112m-93-68h12m14 0h6m-32 21h12m14 0h6m-32 21h12m14 0h6m19-73h12m12 0h9m-33 23h12m12 0h9m-33 23h12m12 0h9m-33 23h12m12 0h9M96 153h131" fill="none" stroke={stroke} opacity={0.16} strokeWidth={2} strokeLinejoin="round" />
            : variant === "booking" ? <Path d="M97 57h127v91H97V57Zm0 26h127M121 48v18m78-18v18M156 102l11 11 23-25" fill="none" stroke={stroke} opacity={0.14} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              : <Path d="M90 141c28 0 21-30 49-30s27-36 52-36 27-25 52-25M94 158c28 0 25-24 51-24s26-33 53-33 25-23 48-23" fill="none" stroke={stroke} opacity={0.16} strokeWidth={2} strokeLinecap="round" />}
      </Svg>
      {/* Small curved notes drifting across the card, in place of the one big note (user, 2026-11-03). */}
      {variant === "collections" ? ([
        { left: "46%", rotate: "-18deg", top: "9%", width: 30 },
        { left: "42%", rotate: "22deg", top: "76%", width: 22 },
        { left: "61%", rotate: "14deg", top: "66%", width: 26 },
        { left: "68%", rotate: "10deg", top: "7%", width: 22 },
        { left: "90%", rotate: "-24deg", top: "11%", width: 28 },
        { left: "88%", rotate: "-10deg", top: "74%", width: 32 },
      ] as const).map((note) => (
        <View key={`${note.left}-${note.top}`} style={{ left: note.left, position: "absolute", top: note.top, transform: [{ rotate: note.rotate }] }}>
          <Svg height={note.width * 0.65} viewBox="0 0 40 26" width={note.width}>
            <Path d="M2 8C10 2 18 2 26 6S34 9 38 5V18C34 22 30 21 26 19S10 15 2 21Z" fill={stroke} fillOpacity={0.05} stroke={stroke} strokeLinejoin="round" strokeOpacity={0.2} strokeWidth={1.8} />
            <Circle cx={20} cy={12} fill="none" r={3.6} stroke={stroke} strokeOpacity={0.2} strokeWidth={1.6} />
          </Svg>
        </View>
      )) : null}
      {/* Small bills scattered across the card, as the collections card has notes (user, 2026-11-08). */}
      {motif && variant === "budget" ? ([
        // Kept to the space above the card's button, which would hide them.
        { left: "44%", rotate: "-14deg", top: "8%", width: 18 },
        { left: "57%", rotate: "10deg", top: "24%", width: 15 },
        { left: "66%", rotate: "-8deg", top: "8%", width: 15 },
        { left: "60%", rotate: "-16deg", top: "48%", width: 16 },
        { left: "75%", rotate: "14deg", top: "47%", width: 18 },
        { left: "36%", rotate: "18deg", top: "26%", width: 14 },
        { left: "91%", rotate: "12deg", top: "46%", width: 16 },
      ] as const).map((bill) => (
        <View key={`${bill.left}-${bill.top}`} style={{ left: bill.left, position: "absolute", top: bill.top, transform: [{ rotate: bill.rotate }] }}>
          <Svg height={bill.width * 1.35} viewBox="0 0 20 27" width={bill.width}>
            <Path d="M2 2h16v22l-2.67-2-2.66 2-2.67-2-2.67 2-2.66-2L2 24V2Z" fill={stroke} fillOpacity={0.06} stroke={stroke} strokeLinejoin="round" strokeOpacity={0.3} strokeWidth={1.5} />
            <Path d="M6 8h8M6 12h8M6 16h5" stroke={stroke} strokeLinecap="round" strokeOpacity={0.3} strokeWidth={1.4} />
          </Svg>
        </View>
      )) : null}
    </View>
  );
}
