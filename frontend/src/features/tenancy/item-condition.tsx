import { useState } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ChevronDisc } from "@/components/chevron-disc";
import { ITEM_CONDITIONS, type ItemCondition } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * An item's condition at move-in (user, 2026-11-07): Working, Damaged or Broken. Set
 * fresh for every tenancy, separate from the damage levels, which are only price tiers.
 */
export function useConditionTone() {
  const { colors } = useTheme();
  return (condition: ItemCondition) =>
    condition === "WORKING"
      ? { fill: colors.jadeSoft, ink: colors.jade }
      : condition === "DAMAGED"
        ? { fill: colors.warningSoft, ink: colors.warningText }
        : { fill: colors.dangerSoft, ink: colors.danger };
}

export function conditionLabel(condition: ItemCondition) {
  return ITEM_CONDITIONS.find((entry) => entry.value === condition)?.label ?? condition;
}

/** A condition as read back: a tinted caps label, no dot. */
export function ItemConditionChip({ condition }: { condition: ItemCondition }) {
  const { fonts } = useTheme();
  const tone = useConditionTone()(condition);
  return (
    <View style={{ backgroundColor: tone.fill, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <Text style={{ color: tone.ink, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.4 }}>
        {conditionLabel(condition).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The condition as a dropdown that opens in place, under the field, and pushes the
 * rest down. "Select an option" until one is picked.
 */
export function ItemConditionDropdown({
  error,
  onChange,
  value,
}: {
  error?: boolean;
  onChange: (condition: ItemCondition) => void;
  value: ItemCondition | null;
}) {
  const { colors, fonts, type } = useTheme();
  const tone = useConditionTone();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>Condition *</Text>
      <AnimatedPressable
        accessibilityLabel={`Condition, ${value ? conditionLabel(value) : "not picked"}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          alignItems: "center",
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text style={{ color: value ? colors.ink : colors.muted, flex: 1, fontFamily: value ? fonts.sansSemiBold : fonts.sans, fontSize: 15 }}>
          {value ? conditionLabel(value) : "Select an option"}
        </Text>
        <ChevronDisc direction={open ? "up" : "down"} />
      </AnimatedPressable>
      {open ? (
        <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
          {ITEM_CONDITIONS.map((option, index) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === value }}
              key={option.value}
              onPress={() => { onChange(option.value); setOpen(false); }}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                borderTopWidth: index === 0 ? 0 : 1,
                flexDirection: "row",
                gap: spacing.sm,
                padding: spacing.md,
              }}
            >
              {/* The condition's own colour on the words, no tinted fill (user, 2026-11-07). */}
              <Text style={{ color: tone(option.value).ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{option.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
