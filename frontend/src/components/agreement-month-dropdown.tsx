import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { AnimatedPressable } from "./animated-pressable";
import { useTheme } from "@/theme/use-theme";
import { spacing } from "@/theme/spacing";

export function AgreementMonthDropdown({ value, disabled, onChange }: { value: number; disabled?: boolean; onChange: (months: number) => void }) {
  const { colors, fonts, type } = useTheme();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const close = () => setAnchor(null);
  const open = () => trigger.current?.measureInWindow((x, y, w, h) => {
    const top = y + h + 8;
    const menuHeight = Math.max(0, Math.min(240, height - top - 16));
    setAnchor({ left: Math.max(16, Math.min(x, width - w - 16)), top, width: Math.min(w, width - 32), height: menuHeight });
  });
  return <View style={{ gap: spacing.xs }}>
    <Text style={[type.label, { color: colors.muted }]}>Months (1 to 11)</Text>
    <View ref={trigger} collapsable={false}>
      <AnimatedPressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Agreement term: ${value} months`} accessibilityState={{ disabled, expanded: !!anchor }} onPress={open} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 14, padding: spacing.md }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 15 }}>{value} {value === 1 ? "month" : "months"}</Text>
        <ChevronDown color={colors.muted} size={20} />
      </AnimatedPressable>
    </View>
    {/* Match the measured app window: a translucent status bar shifts Android's modal origin. */}
    {anchor ? <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View style={{ position: "absolute", left: anchor.left, top: anchor.top, width: anchor.width, maxHeight: anchor.height, backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 14, overflow: "hidden", elevation: 8 }}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
          {Array.from({ length: 11 }, (_, i) => i + 1).map(month => <AnimatedPressable key={month} accessibilityRole="button" accessibilityState={{ selected: month === value }} onPress={() => { onChange(month); close(); }} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: month === value ? colors.surfaceSunken : colors.surface }}>
            <Text style={{ color: colors.ink, fontFamily: month === value ? fonts.sansBold : fonts.sans, fontSize: 15 }}>{month} {month === 1 ? "month" : "months"}</Text>
            {month === value ? <Check color={colors.primary} size={18} /> : null}
          </AnimatedPressable>)}
        </ScrollView>
      </View>
    </Modal> : null}
  </View>;
}
