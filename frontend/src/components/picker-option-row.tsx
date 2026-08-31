import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One option inside a picker modal — the app's selection style.
 *
 * <p>A ruled row with a mark on the right, not a filled card. The pale-green
 * fill it replaced coloured the whole row, which made a chosen option the
 * heaviest thing on a sheet of hairlines and turned a list of them into a wall
 * of green. The mark now sits in one place the eye can scan down, and the row
 * stays white whether or not it is chosen.
 *
 * <p>Rows are separated by a hairline rather than spaced apart, so a long list
 * reads as one table rather than a stack of cards — which is what let a picker
 * of ten options run off the screen.
 *
 * <p>The mark is the SAME in every picker — a ring with a padded fill inside —
 * whether the list takes one answer or several. `mode` changes only the
 * accessibility role, so a screen reader still announces a multi-select as a
 * checkbox; nothing about it is visual.
 *
 * <h2>Where this does NOT apply</h2>
 *
 * <p>Pickers whose options can be CREATED and DELETED — the staff and expense
 * category lists — keep their own ink-filled row. Those rows carry a delete
 * control of their own, and a ruled row with two marks on the right reads as two
 * competing controls rather than one choice.
 */
export function PickerOptionRow({
  first,
  label,
  mode = "single",
  onPress,
  selected,
  subtitle,
}: {
  /** Suppresses the top hairline, for a row that follows a heading. */
  first?: boolean;
  label: string;
  mode?: "multi" | "single";
  onPress: () => void;
  selected: boolean;
  /** A second line under the label — a price, a bed count, a description. */
  subtitle?: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole={mode === "multi" ? "checkbox" : "radio"}
      accessibilityState={mode === "multi" ? { checked: selected } : { selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderTopColor: colors.border,
        borderTopWidth: first ? 0 : 1,
        flexDirection: "row",
        gap: spacing.md,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        {/* Weight, not colour, marks the chosen row. Recolouring the text made
            unselected options look disabled. */}
        <Text
          style={{
            color: colors.ink,
            fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
            fontSize: 15,
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* A ring with a padded fill inside it. The gap between the two is the
          point — a solid disc reads as a dot, and the ring around it is what
          makes the mark legible at a glance down a list. */}
      <View
        style={{
          alignItems: "center",
          borderColor: selected ? colors.primary : colors.borderStrong,
          borderRadius: 999,
          borderWidth: 2,
          height: 22,
          justifyContent: "center",
          width: 22,
        }}
      >
        {selected ? (
          <View style={{ backgroundColor: colors.primary, borderRadius: 999, height: 11, width: 11 }} />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}
