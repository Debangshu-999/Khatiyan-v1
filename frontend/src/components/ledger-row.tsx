import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import { ChevronRight, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type LedgerRowProps = {
  icon?: ComponentType<LucideProps>;
  // Icon chip colours; default to the primary soft treatment.
  iconColor?: string;
  iconBackground?: string;
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
export function LedgerRow({ caption, chevron, footer, icon: Icon, iconBackground, iconColor, onPress, title, trailing }: LedgerRowProps) {
  const { colors, type } = useTheme();
  const showChevron = chevron ?? Boolean(onPress);

  const body = (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {Icon ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: iconBackground ?? colors.primarySoft,
              borderCurve: "continuous",
              borderRadius: 12,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Icon color={iconColor ?? colors.primary} size={19} strokeWidth={2.2} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          {caption ? (
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
        {trailing}
        {showChevron ? <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} /> : null}
      </View>
      {footer}
    </>
  );

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderCurve: "continuous" as const,
    borderRadius: 14,
    borderWidth: 1,
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
