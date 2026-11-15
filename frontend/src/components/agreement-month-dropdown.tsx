import { ScrollView, Text, View } from "react-native";
import { AnchoredDropdown, useDropdownTrigger } from "./anchored-dropdown";
import { ChevronDisc } from "./chevron-disc";
import { AnimatedPressable } from "./animated-pressable";
import { useTheme } from "@/theme/use-theme";
import { radii, spacing } from "@/theme/spacing";

export function AgreementMonthDropdown({ value, disabled, label = "Months (1 to 11)", onChange }: { value: number; disabled?: boolean; label?: string; onChange: (months: number) => void }) {
  const { colors, fonts, type } = useTheme();
  // The shared layer places the list under the field in any window (user, 2026-11-07).
  const { close, open, ref: trigger, trigger: anchor } = useDropdownTrigger();
  return <View style={{ gap: spacing.xs }}>
    <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
    <View ref={trigger} collapsable={false}>
      <AnimatedPressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Agreement term: ${value} months`} accessibilityState={{ disabled, expanded: !!anchor }} onPress={open} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radii.card, padding: spacing.md }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 15 }}>{value} {value === 1 ? "month" : "months"}</Text>
        <ChevronDisc />
      </AnimatedPressable>
    </View>
    {anchor ? <AnchoredDropdown maxHeight={240} onClose={close} trigger={anchor}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
          {Array.from({ length: 11 }, (_, i) => i + 1).map(month => <AnimatedPressable key={month} accessibilityRole="button" accessibilityState={{ selected: month === value }} onPress={() => { onChange(month); close(); }} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: month === value ? colors.surfaceSunken : colors.surface }}>
            <Text style={{ color: colors.ink, fontFamily: month === value ? fonts.sansBold : fonts.sans, fontSize: 15 }}>{month} {month === 1 ? "month" : "months"}</Text>
          </AnimatedPressable>)}
        </ScrollView>
    </AnchoredDropdown> : null}
  </View>;
}
