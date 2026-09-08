import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { Search, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Reusable search box for history/data screens: leading search icon, clear
 * button, themed focus border.
 */
export function SearchField({
  animatePlaceholder = true,
  autoCapitalize = "none",
  onChangeText,
  placeholder,
  trailing,
  value,
}: {
  // Marquee a long placeholder that overflows the box; off for the map picker.
  animatePlaceholder?: boolean;
  /**
   * "characters" for screens searched by reference code — the request queues
   * look up TEX-2026-000042, and a lower-case keyboard there means shifting
   * for every letter of something that is never lower case.
   */
  autoCapitalize?: "none" | "characters";
  onChangeText: (value: string) => void;
  placeholder: string;
  /**
   * A control on the right of the box, behind a hairline rule.
   *
   * <p>Inside the field rather than beside it: a filter button set next to the
   * box is a second object competing with it, when what it does is narrow the
   * same search. Sharing one border says they are one control.
   */
  trailing?: ReactNode;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: focused ? colors.primary : colors.border,
        borderRadius: 14,
        borderWidth: focused ? 1.5 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 50,
        paddingHorizontal: spacing.md,
      }}
    >
      <Search color={focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
      <AppTextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        marqueePlaceholder={animatePlaceholder}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, }}
        value={value}
      />
      {value.length > 0 ? (
        <AnimatedPressable accessibilityLabel="Clear search" onPress={() => onChangeText("")} style={{ padding: 2 }}>
          <X color={colors.muted} size={17} strokeWidth={2.3} />
        </AnimatedPressable>
      ) : null}
      {trailing ? (
        <>
          {/* Inset top and bottom rather than a full-height edge, so the rule
              reads as a separator inside one control instead of the seam
              between two. */}
          <View style={{ backgroundColor: colors.border, marginVertical: spacing.sm, width: 1 }} />
          {trailing}
        </>
      ) : null}
    </View>
  );
}
