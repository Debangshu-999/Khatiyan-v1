import { useState } from "react";
import { Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type FilterBubbleOption<T extends string> = {
  count?: number;
  label: string;
  value: T;
};

/**
 * A small pill row for filtering the list beneath it.
 *
 * <p>Sized to sit beside a heading rather than below it — the full
 * ChoiceButton is a body-text control and pushes the row onto its own line.
 * Lifted out of the notices screen, which had the only copy, once the request
 * lists needed the same thing; three hand-rolled copies would have drifted.
 *
 * <p>Counts are optional and render inline, because on a queue the number is
 * usually the reason someone taps the filter at all.
 */
export function FilterBubbles<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: FilterBubbleOption<T>[];
  value: T;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
      {options.map((option) => (
        <Bubble
          key={option.value}
          label={option.count == null ? option.label : `${option.label} · ${option.count}`}
          on={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

/**
 * The same bubbles, folded behind a "Filters" pill until asked for.
 *
 * <p>For headings where the filters are the less important half of the row. Three
 * pills beside a title compete with it for the eye every time the screen opens,
 * even though most visits do not change the filter; one pill states that
 * filtering exists and stays out of the way until it is wanted.
 *
 * <p>The chevron points the way the row will move: right to open outward, left
 * to fold back.
 */
export function CollapsibleFilterBubbles<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: FilterBubbleOption<T>[];
  value: T;
}) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        flexShrink: 1,
        flexWrap: "wrap",
        gap: spacing.xs,
        justifyContent: "flex-end",
      }}
    >
      <AnimatedPressable
        accessibilityLabel={open ? "Hide filters" : "Show filters"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 2,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
        }}
        tapLockMs={0}
      >
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>
          Filters
        </Text>
        {open ? (
          <ChevronLeft color={colors.muted} size={13} strokeWidth={2.4} />
        ) : (
          <ChevronRight color={colors.muted} size={13} strokeWidth={2.4} />
        )}
      </AnimatedPressable>

      {open
        ? options.map((option) => (
            <Bubble
              key={option.value}
              label={option.count == null ? option.label : `${option.label} · ${option.count}`}
              on={option.value === value}
              onPress={() => onChange(option.value)}
            />
          ))
        : null}
    </View>
  );
}

function Bubble({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        backgroundColor: on ? colors.primary : colors.surface,
        borderColor: on ? colors.primary : colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
      // No tap lock: switching filters in quick succession must not drop taps.
      tapLockMs={0}
    >
      <Text style={{ color: on ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
