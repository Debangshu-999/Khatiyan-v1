import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One option inside a picker modal — the app's selection style.
 *
 * <p>No radio ring (user, 2026-09-28). The chosen row is filled pale blue and
 * its label goes bold blue, so the choice reads from across the list rather
 * than from a small mark at its edge. Pale blue as a fill is otherwise banned
 * in this app; selected picker rows are the one standing exception.
 *
 * <p>An icon before the label is optional and only where the options have one
 * worth showing (food profile categories). Most pickers are words only.
 *
 * <p>`mode` changes only the accessibility role, so a screen reader still
 * announces a multi-select as a checkbox; nothing about it is visual.
 *
 * <h2>Where this does NOT apply</h2>
 *
 * <p>Pickers whose options can be CREATED and DELETED — the staff and expense
 * category lists — keep their own ink-filled row. Those rows carry a delete
 * control of their own.
 */
export function PickerOptionRow({
  content,
  first: _first,
  icon,
  label,
  mode = "single",
  onPress,
  selected,
  subtitle,
  trailing,
}: {
  /**
   * Drawn in place of the label text, such as the status chip a card shows
   * (2026-09-30). The label still names the row for screen readers.
   */
  content?: ReactNode;
  /** Kept for callers from the ruled-row days; rows no longer draw a rule. */
  first?: boolean;
  /** Drawn before the label. Leave it out for a words-only picker. */
  icon?: ReactNode;
  label: string;
  mode?: "multi" | "single";
  onPress: () => void;
  selected: boolean;
  /** A second line under the label — a price, a bed count, a description. */
  subtitle?: string;
  /** Drawn at the right of the row, such as a count. */
  trailing?: ReactNode;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={content ? label : undefined}
      accessibilityRole={mode === "multi" ? "checkbox" : "radio"}
      accessibilityState={mode === "multi" ? { checked: selected } : { selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primarySoft : "transparent",
        borderCurve: "continuous",
        borderRadius: 10,
        flexDirection: "row",
        gap: spacing.sm,
        marginVertical: 1,
        minHeight: 48,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      {icon}
      <View style={{ alignItems: content ? "flex-start" : undefined, flex: 1, gap: 2, minWidth: 0 }}>
        {content ?? <Text
          style={{
            color: selected ? colors.primaryDeep : colors.ink,
            fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
            fontSize: 15,
          }}
        >
          {label}
        </Text>}
        {subtitle ? (
          <Text numberOfLines={1} style={[type.description, { color: colors.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </AnimatedPressable>
  );
}
