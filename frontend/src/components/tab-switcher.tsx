import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type TabOption<T extends string> = {
  label: string;
  value: T;
};

/**
 * The app's one tab switcher.
 *
 * <p>Every screen had grown its own — a sunken track with inner padding and a
 * selected pill floating inside it, each with slightly different radii, heights
 * and weights. The pill never reached the track's edge, so the control read as a
 * box inside a box. The track still carries no padding and clips its children,
 * so a segment fills the control's full boundary corner to corner.
 *
 * <p><b>Selection is weight and a rule, not a slab.</b> It used to fill the
 * selected segment with solid ink and invert the text. On a screen that is
 * otherwise hairlines and white — notices, billing — that made the switcher the
 * heaviest thing present, pulling the eye to a control rather than to the
 * content it filters. Now the selected segment takes a quiet raised fill, ink
 * text at bold weight, and a 2px rule along its bottom edge. The rule is what
 * makes the state unmistakable at a glance; the fill alone would be too subtle,
 * and the slab was too loud.
 */
export function TabSwitcher<T extends string>({
  active,
  onChange,
  options,
}: {
  active: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
}) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        // No padding, and clip the children: this is what lets the selected
        // segment reach the control's edge instead of sitting inset.
        overflow: "hidden",
      }}
    >
      {options.map((option) => {
        const selected = option.value === active;

        return (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.surfaceRaised : "transparent",
              flex: 1,
              justifyContent: "center",
              minHeight: 42,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: selected ? colors.ink : colors.muted,
                fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {option.label}
            </Text>

            {/* Inside the segment, flush to its bottom edge — an underline that
                sat outside would break the track's own hairline. */}
            <View
              style={{
                backgroundColor: selected ? colors.ink : "transparent",
                bottom: 0,
                height: 2,
                left: 0,
                position: "absolute",
                right: 0,
              }}
            />
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
