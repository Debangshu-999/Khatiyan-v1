import { useState } from "react";
import { Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PickerOptionRow } from "@/components/picker-option-row";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type SelectOption<Value extends string> = { label: string; value: Value };

/**
 * A choice made from a short list that opens in place, under the field (user,
 * 2026-10-19). Nothing is chosen until the person chooses: it shows "Select an
 * option" until then. The chevron sits on a grey disc, like the app's other
 * dropdowns.
 */
export function SelectField<Value extends string>({
  disabled,
  error,
  label,
  onChange,
  options,
  placeholder = "Select an option",
  value,
}: {
  disabled?: boolean;
  error?: string;
  label: string;
  onChange: (value: Value) => void;
  options: SelectOption<Value>[];
  placeholder?: string;
  value: Value | null;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) ?? null;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      <AnimatedPressable
        accessibilityLabel={`${label}: ${current ? current.label : placeholder}`}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 10,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingLeft: spacing.md,
          paddingRight: spacing.sm,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: current ? colors.ink : colors.muted, flex: 1, fontFamily: current ? fonts.sansSemiBold : fonts.sans, fontSize: 15 }}
        >
          {current ? current.label : placeholder}
        </Text>
        <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 24, justifyContent: "center", width: 24 }}>
          {/* An up chevron while open (user, 2026-10-19): a rotated icon did not turn on every platform. */}
          {open ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
        </View>
      </AnimatedPressable>
      {open ? (
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, padding: spacing.xs }}>
          {options.map((option) => (
            <PickerOptionRow
              key={option.value}
              label={option.label}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              selected={option.value === value}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}
