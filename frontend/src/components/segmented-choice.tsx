import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type SegmentedOption<T extends string> = { label: string; value: T };

/**
 * A row of equal-width, mutually exclusive options.
 *
 * <p>For a choice between two or three shapes of the same thing — indefinite
 * versus fixed term, exit versus room change — where the options are peers and
 * exactly one is always selected. That is what separates it from
 * {@code ChoiceButton}, which is a content-width pill for optional tags and
 * wraps when there are several.
 *
 * <p>Equal widths matter: unequal segments read as "one of these is the main
 * one", which is exactly wrong when the whole point is that neither is a
 * default the user should drift into.
 *
 * <p>Shared rather than redefined per screen. Three divergent local copies of
 * ActionButton existed in this codebase at once, all subtly different, and every
 * one of them had to be found and fixed by hand.
 */
export function SegmentedChoice<T extends string>({
  disabled,
  onChange,
  options,
  value,
}: {
  /** Greys the whole row and swallows presses — for a choice not yet available. */
  disabled?: boolean;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Null shows no selection, for a choice that must be made deliberately. */
  value: T | null;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(disabled), selected: active }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              backgroundColor: active ? colors.primary : colors.surface,
              borderColor: active ? colors.primary : colors.borderStrong,
              opacity: disabled ? 0.45 : 1,
              borderRadius: 0,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              minHeight: 46,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                type.bodyStrong,
                { color: active ? colors.onPrimary : colors.ink },
              ]}
            >
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
