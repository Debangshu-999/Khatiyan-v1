import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { ArrowUpRight, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionCardProps = {
  title: string;
  description: string;
  /**
   * Drops the card's own border and fill so it can sit inside another card as a
   * row. Without it, nesting draws a box inside a box.
   */
  flush?: boolean;
  meta?: string;
  // Optional leading icon rendered in a soft rounded box.
  icon?: ComponentType<LucideProps>;
  // When > 0, renders a red attention badge with the count next to the arrow.
  badge?: number;
  onPress?: () => void;
  tone?: "default" | "primary";
};

// Press-target card with a tracked-out kicker, a serif title, and a quiet
// affordance arrow at the corner so it reads as navigable without a noisy
// "Open" button.
export function ActionCard({ badge, description, flush, icon: Icon, meta, onPress, title, tone = "default" }: ActionCardProps) {
  const { colors, fonts, type } = useTheme();
  const badgeLabel = badge != null && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  const isPrimary = tone === "primary";
  const backgroundColor = isPrimary ? colors.accentSoft : colors.surface;
  const borderColor = isPrimary ? colors.accent : colors.borderStrong;
  const titleColor = colors.ink;
  const metaColor = isPrimary ? colors.accent : colors.kicker;
  const arrowColor = isPrimary ? colors.accent : colors.kicker;

  const content = (
    <>
      {meta ? (
        <Text style={[type.eyebrow, { color: metaColor }]}>
          {meta}
        </Text>
      ) : null}

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <Text
          style={[
            type.display,
            { color: titleColor, flex: 1, fontSize: 19, lineHeight: 25 },
          ]}
        >
          {title}
        </Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: 3 }}>
          {badgeLabel ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.danger,
                borderRadius: 999,
                justifyContent: "center",
                minWidth: 20,
                paddingHorizontal: 6,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11, }}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
          {onPress ? <ArrowUpRight color={arrowColor} size={18} strokeWidth={2} /> : null}
        </View>
      </View>

      <Text style={[type.body, { color: isPrimary ? colors.inkSoft : colors.muted }]}>
        {description}
      </Text>
    </>
  );

  return (
    <AnimatedPressable onPress={onPress}>
      <View
        style={{
          backgroundColor: flush ? "transparent" : backgroundColor,
          borderColor: flush ? "transparent" : borderColor,
          borderCurve: "continuous",
          borderRadius: 20,
          borderWidth: flush ? 0 : 1,
          padding: spacing.lg,
          ...(Icon ? { alignItems: "flex-start", flexDirection: "row" as const, gap: spacing.md } : { gap: spacing.sm }),
        }}
      >
        {/* The glyph alone — no tile, no ring. A container behind an icon
            competes with the card's own edge and turns a label into a badge. */}
        {Icon ? (
          <View style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}>
            <Icon color={colors.ink} size={22} strokeWidth={2.2} />
          </View>
        ) : null}
        {Icon ? <View style={{ flex: 1, gap: spacing.sm }}>{content}</View> : content}
      </View>
    </AnimatedPressable>
  );
}
