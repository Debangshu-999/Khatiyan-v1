import { useState } from "react";
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
  onChangeText,
  placeholder,
  value,
}: {
  // Marquee a long placeholder that overflows the box; off for the map picker.
  animatePlaceholder?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
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
        autoCapitalize="none"
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
    </View>
  );
}
