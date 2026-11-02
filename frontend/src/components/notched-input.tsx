import { useState } from "react";
import { Text, View, type KeyboardTypeOptions } from "react-native";

import { AppTextInput } from "@/components/app-text-input";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A field with its label set into its top border, as the sign-in fields have
 * it (user, 2026-10-29), and an optional prefix inside, like the ₹ of a price
 * or the D1 of a damage level. An error turns the border red; its message goes
 * where the caller puts it.
 */
export function NotchedInput({
  editable = true,
  ground,
  invalid,
  keyboardType,
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  prefix,
  required,
  value,
}: {
  /** Several lines in a taller box, for a note (2026-10-29). */
  multiline?: boolean;
  editable?: boolean;
  /** The colour behind the field, which the notch cuts the border with. Defaults to a card's surface. */
  ground?: string;
  invalid?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Set into the border. Omitted, the field has none. */
  label?: string;
  maxLength?: number;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  /** Shows the required mark in the notch and includes it in the input's accessible label. */
  required?: boolean;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);
  const fill = editable ? colors.surfaceRaised : colors.surfaceSunken;
  const borderColor = invalid ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View
      style={{
        alignItems: multiline ? "flex-start" : "center",
        backgroundColor: fill,
        borderColor,
        borderCurve: "continuous",
        borderRadius: 8,
        borderWidth: 1.5,
        flexDirection: "row",
        gap: spacing.xs,
        marginTop: label ? 6 : 0,
        minHeight: multiline ? 112 : 50,
        paddingHorizontal: spacing.md,
      }}
    >
      {label ? (
        <View pointerEvents="none" style={{ left: 10, position: "absolute", top: -9 }}>
          <View style={{ backgroundColor: ground ?? colors.surface, height: 8.25, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View style={{ backgroundColor: fill, bottom: 0, left: 0, position: "absolute", right: 0, top: 8.25 }} />
          <Text
            numberOfLines={1}
            style={{
              color: invalid ? colors.danger : focused ? colors.primary : colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 11,
              letterSpacing: 0.3,
              lineHeight: 16,
              opacity: invalid || focused ? 1 : 0.65,
              paddingHorizontal: 5,
            }}
          >
            {label}
            {required ? <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: colors.danger }}>{" *"}</Text> : null}
          </Text>
        </View>
      ) : null}
      {prefix ? (
        <Text style={{ color: editable ? colors.ink : colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>{prefix}</Text>
      ) : null}
      <AppTextInput
        accessibilityLabel={label ? `${label}${required ? ", required" : ""}` : undefined}
        editable={editable}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: "transparent",
          color: editable ? colors.ink : colors.muted,
          flex: 1,
          fontFamily: fonts.sansMedium,
          fontSize: 15,
          paddingVertical: spacing.sm,
          ...(multiline ? { minHeight: 96, paddingTop: spacing.md, textAlignVertical: "top" as const } : null),
        }}
        underlineColorAndroid="transparent"
        value={value}
      />
    </View>
  );
}
