import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One section of a screen, as a pill: ink-filled when it is the one showing,
 * outlined when it is not, with a count of what is new beside the label.
 *
 * <p>The chat screen's section bubbles (My chats, Tenants, Enquiries, Nudges),
 * shared so the Enquiries screen's All and My bubbles look the same
 * (user, 2026-10-03). Lay them out in a wrapping row with `spacing.xs` between.
 *
 * @param count new items, shown in a small circle. Nothing renders at 0.
 */
export function SectionPill({
  count,
  label,
  onPress,
  selected,
}: {
  count: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.ink : colors.surface,
        borderColor: selected ? colors.ink : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: selected ? colors.surface : colors.inkSoft, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
      {count > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: selected ? colors.surface : colors.primary,
            borderRadius: 999,
            minWidth: 17,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}
        >
          <Text style={{ color: selected ? colors.ink : colors.surface, fontSize: 10, fontWeight: "700" }}>
            {count}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
