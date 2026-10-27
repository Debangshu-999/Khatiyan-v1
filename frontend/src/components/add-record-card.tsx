import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Plus, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A full-width card that adds a record, such as Record external visit on
 * Manage Visits and Create external booking on Bookings (user, 2026-10-19):
 * a pale grey fill with no border, the icon and label in the app's blue, an
 * optional caption, and the + on a pale blue disc.
 */
export function AddRecordCard({
  accessibilityLabel,
  caption,
  icon: Icon,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  caption?: string | null;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? (caption ? `${label}, ${caption}` : label)}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.primary} size={22} strokeWidth={2.1} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 16 }}>{label}</Text>
        {caption ? <Text style={[type.caption, { color: colors.muted }]}>{caption}</Text> : null}
      </View>
      {/* The + on a pale blue disc, as the user asked (2026-10-19). */}
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 32, justifyContent: "center", width: 32 }}>
        <Plus color={colors.primary} size={18} strokeWidth={2.4} />
      </View>
    </AnimatedPressable>
  );
}
