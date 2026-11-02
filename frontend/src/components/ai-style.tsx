import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { GhostPill, GhostText, useIsSkeleton } from "@/components/skeleton-boundary";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The purple end of the AI's gradient, for a small mark that cannot carry the gradient itself. */
export const AI_INK = "#A05FC8";

/**
 * The AI's colours, coral to purple (user, 2026-11-02): what the app shows wherever the AI is
 * at work. Pinned on all four sides, because a percent size on Android leaves it short of the
 * edge of a parent with padding. The parent sets the shape and needs overflow hidden.
 *
 * <p>Drawn at its measured size, never "100%": on a phone a percent Svg kept the size it first
 * had, so a card that grew (suggestions arriving, a toggle opening it) showed a border with gaps.
 * The plain fill under it covers the frame before the first measure.
 */
export function AiGradient() {
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => setSize({ height: layout.height, width: layout.width })}
      style={{ backgroundColor: "#C8508E", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
    >
      {size ? (
      <Svg height={size.height} width={size.width}>
        <Defs>
          <SvgGradient id="ai-gradient" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#F0405C" />
            <Stop offset="1" stopColor={AI_INK} />
          </SvgGradient>
        </Defs>
        <Rect fill="url(#ai-gradient)" height={size.height} width={size.width} />
      </Svg>
      ) : null}
    </View>
  );
}

/**
 * Text in the AI's gradient, as spans to put inside a Text. One colour a letter, stepped from
 * coral to purple: true gradient text needs a mask, which is a native dependency.
 */
export function aiGradientSpans(text: string) {
  const channel = (from: number, to: number, at: number) => Math.round(from + (to - from) * at);
  return Array.from(text).map((letter, index, letters) => {
    const at = letters.length > 1 ? index / (letters.length - 1) : 0;
    return (
      <Text key={index} style={{ color: `rgb(${channel(0xf0, 0xa0, at)}, ${channel(0x40, 0x5f, at)}, ${channel(0x5c, 0xc8, at)})` }}>
        {letter}
      </Text>
    );
  });
}

/** An AI feature on and off, in the AI's colours (user, 2026-11-02). */
export function AiModeToggle({
  accessibilityLabel,
  disabled = false,
  enabled,
  onChange,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { colors } = useTheme();
  const slide = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(slide, { duration: 200, toValue: enabled ? 1 : 0, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [enabled, slide]);
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onChange(!enabled)}
      style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 28, justifyContent: "center", overflow: "hidden", width: 50 }}
    >
      {enabled ? <AiGradient /> : null}
      <Animated.View
        style={{
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderRadius: 999,
          height: 22,
          justifyContent: "center",
          marginLeft: 3,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }],
          width: 22,
        }}
      >
        <Sparkles color={enabled ? AI_INK : colors.kicker} size={13} strokeWidth={2.4} />
      </Animated.View>
    </AnimatedPressable>
  );
}

/**
 * What the AI wrote about something (user, 2026-11-02): a soft grey card edged in the AI's
 * gradient, with one paragraph in plain black. A badge, such as the AI's score, sits in its
 * corner.
 */
export function AiReviewCard({ badge, text }: { badge?: string | null; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <AiCardFrame>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AiSparkleDisc />
        <GhostText ghostWidth="40%" style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>AI review</GhostText>
        {badge ? (
          <GhostPill height={24} width={46}>
            <View style={{ borderRadius: 999, overflow: "hidden", paddingHorizontal: spacing.sm + 2, paddingVertical: 3 }}>
              <AiGradient />
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 12.5 }}>{badge}</Text>
            </View>
          </GhostPill>
        ) : null}
      </View>
      <BoldedText text={text} />
    </AiCardFrame>
  );
}

/** The same card with no title: the AI's mark with its words beside it, for a line on a property. */
export function AiNoteCard({ text }: { text: string }) {
  return (
    <AiCardFrame>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <AiSparkleDisc />
        <View style={{ flex: 1, minWidth: 0 }}>
          <BoldedText text={text} />
        </View>
      </View>
    </AiCardFrame>
  );
}

function AiCardFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  // While it loads the edge is barely there, so the bars inside are what draw the eye.
  const skeleton = useIsSkeleton();
  return (
    <View style={{ borderCurve: "continuous", borderRadius: 14, marginTop: spacing.xs, overflow: "hidden", padding: 1.5 }}>
      <View style={{ bottom: 0, left: 0, opacity: skeleton ? 0.12 : 1, position: "absolute", right: 0, top: 0 }}>
        <AiGradient />
      </View>
      <View style={{ backgroundColor: colors.surfaceRaised, borderCurve: "continuous", borderRadius: 12.5, gap: spacing.sm, padding: spacing.md }}>
        {children}
      </View>
    </View>
  );
}

function AiSparkleDisc() {
  return (
    <GhostPill height={26} width={26}>
      <View style={{ alignItems: "center", borderRadius: 999, height: 26, justifyContent: "center", overflow: "hidden", width: 26 }}>
        <AiGradient />
        <View><Sparkles color="#FFFFFF" size={14} strokeWidth={2.4} /></View>
      </View>
    </GhostPill>
  );
}

/**
 * The AI's paragraph in plain black, in the family of the card's "AI review" title but
 * smaller, with the key words it marked a weight heavier (user, 2026-11-02).
 */
function BoldedText({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  // One bar would say a line is coming: while it loads, a paragraph's worth stands in.
  if (useIsSkeleton()) {
    const line = { fontSize: 13, lineHeight: 20 };
    return (
      <View>
        <GhostText ghostWidth="96%" style={line}>{text}</GhostText>
        <GhostText ghostWidth="100%" style={line}>{text}</GhostText>
        <GhostText ghostWidth="62%" style={line}>{text}</GhostText>
      </View>
    );
  }
  return (
    <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 13, lineHeight: 20 }}>
      {text.split("**").map((part, index) =>
        index % 2 === 1 ? <Text key={`${index}-${part}`} style={{ fontFamily: fonts.display }}>{part}</Text> : part,
      )}
    </Text>
  );
}
