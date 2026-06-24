import { useState } from "react";
import { TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Reusable search box for history/data screens: leading search icon, clear
 * button, themed focus border.
 */
export function SearchField({
  onChangeText,
  placeholder,
  value,
}: {
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
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{ color: colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: "500" }}
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
