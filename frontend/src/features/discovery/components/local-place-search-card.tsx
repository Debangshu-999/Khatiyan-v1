import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type LocalPlaceSearchCardProps = {
  disabled?: boolean;
  filtering: boolean;
  onClearSearch: () => void;
  onSearchChange: (value: string) => void;
  searchValue: string;
};

export function LocalPlaceSearchCard({
  disabled = false,
  filtering,
  onClearSearch,
  onSearchChange,
  searchValue,
}: LocalPlaceSearchCardProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Card>
      <View
        style={{
          alignItems: "center",
          backgroundColor: focused ? colors.surfaceRaised : colors.neutralSoft,
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: 12,
          borderWidth: 1,
          boxShadow: focused ? `0 1px 8px ${colors.shadow}` : "none",
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <Search color={colors.muted} size={19} strokeWidth={2.3} />
        <TextInput
          accessibilityLabel="Search services"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          onBlur={() => setFocused(false)}
          onChangeText={onSearchChange}
          onFocus={() => setFocused(true)}
          placeholder="Search services..."
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={{
            color: colors.text,
            flex: 1,
            fontSize: 16,
            fontWeight: "600",
            minHeight: 46,
            paddingVertical: 0,
          }}
          value={searchValue}
        />
        {filtering ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        {searchValue.length > 0 && !filtering ? (
          <AnimatedPressable accessibilityLabel="Clear service search" onPress={onClearSearch}>
            <X color={colors.muted} size={20} strokeWidth={2.4} />
          </AnimatedPressable>
        ) : null}
      </View>
    </Card>
  );
}
