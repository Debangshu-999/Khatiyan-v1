import { ActivityIndicator, Text } from "react-native";
import { CalendarDays, ChevronDown } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The screen's one period control. While a new period loads, the chevron becomes a spinner and the old cards stay readable. */
export function PeriodPill({ label, onPress, updating }: { label: string; onPress: () => void; updating: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityHint="Opens the period picker"
      accessibilityLabel={`Period, ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md }}
    >
      <CalendarDays color={colors.ink} size={17} strokeWidth={2.1} />
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 16 }}>{label}</Text>
      {updating ? <ActivityIndicator color={colors.muted} size="small" /> : <ChevronDown color={colors.muted} size={18} strokeWidth={2.1} />}
    </AnimatedPressable>
  );
}
