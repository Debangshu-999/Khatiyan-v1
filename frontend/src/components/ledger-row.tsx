import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import { ChevronRight, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type LedgerRowProps = {
  icon?: ComponentType<LucideProps>;
  /** The glyph's colour. No tile behind it (user, 2026-10-27): the card carries the colour instead. */
  iconColor?: string;
  /** A pale tone fill for the whole card, in place of the border (user, 2026-10-27). */
  fill?: string;
  title: string;
  caption?: string;
  // Right-hand slot — a MoneyText, a count, a pill. Rendered before the chevron.
  trailing?: ReactNode;
  // Extra content under the main row (actions, badges) inside the same card.
  footer?: ReactNode;
  onPress?: () => void;
  // Chevron defaults on for pressable rows, off otherwise.
  chevron?: boolean;
};

// The app's standard list row: icon chip → title + caption → trailing figure →
// chevron, in a flat bordered card. One rhythm for expenses, actions, people
// and history entries everywhere.
export function LedgerRow({ caption, chevron, fill, footer, icon: Icon, iconColor, onPress, title, trailing }: LedgerRowProps) {
  const { colors, type } = useTheme();
  const showChevron = chevron ?? Boolean(onPress);

  const body = (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* A label icon: the glyph alone, no tile or fill behind it. */}
        {Icon ? (
          <View style={{ alignItems: "center", height: 32, justifyContent: "center", width: 32 }}>
            <Icon color={iconColor ?? colors.ink} size={26} strokeWidth={2} />
          </View>
        ) : null}
        {/* Title and caption wrap rather than cut off (user, 2026-10-27). */}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>{title}</Text>
          {caption ? <Text style={[type.caption, { color: colors.muted }]}>{caption}</Text> : null}
        </View>
        {trailing}
        {showChevron ? <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} /> : null}
      </View>
      {footer}
    </>
  );

  const cardStyle = {
    backgroundColor: fill ?? colors.surface,
    borderColor: colors.borderStrong,
    borderCurve: "continuous" as const,
    borderRadius: 14,
    borderWidth: fill ? 0 : 1,
    gap: spacing.sm,
    padding: spacing.md,
  };

  if (onPress) {
    return (
      <AnimatedPressable accessibilityRole="button" onPress={onPress} style={cardStyle}>
        {body}
      </AnimatedPressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}
