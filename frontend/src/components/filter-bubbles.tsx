import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Filter } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type FilterBubbleOption<T extends string> = {
  count?: number;
  label: string;
  value: T;
};

/**
 * The app's one filter row: a sideways-scrolling strip of pills, the selected
 * one filled in primary, counts in a badge of their own.
 *
 * <p>Lifted out of the action centre, which had the version everything else was
 * measured against. Notifications, latest events and the action centre had each
 * grown their own pill — soft-accent with an icon, ink-filled with an inline
 * "label · count", and this one — so the same control looked like three
 * different controls depending on which screen you were standing on.
 *
 * <p>The count is a separate badge rather than part of the label because it
 * changes on its own: a label that reads "Billing · 3" one moment and
 * "Billing · 12" the next re-flows the whole row, and the number is what the
 * reader is scanning for.
 */
export function FilterPillRow<T extends string>({
  inset,
  onChange,
  options,
  value,
}: {
  /**
   * Pads both ends of the strip by one screen gutter.
   *
   * <p>For a row inside an EDGE-TO-EDGE parent — a full-bleed sheet — which has
   * no margin of its own to align to. Leave it off inside a normally padded
   * screen, where the parent already supplies the gutter and adding another
   * would indent the first pill past the content margin.
   */
  inset?: boolean;
  onChange: (value: T) => void;
  options: FilterBubbleOption<T>[];
  value: T;
}) {
  return (
    <ScrollView
      contentContainerStyle={{
        alignItems: "center",
        gap: spacing.sm,
        paddingLeft: inset ? spacing.lg : 0,
        // Trailing room either way, so the last pill never sits flush against
        // the edge it scrolls under.
        paddingRight: inset ? spacing.lg : spacing.md,
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexShrink:0 as well as flexGrow:0 — grow alone stops it expanding but
      // leaves it shrinkable, and a column then compresses the strip and clips
      // the pills' descenders.
      style={{ flexGrow: 0, flexShrink: 0 }}
    >
      {options.map((option) => (
        <FilterPill
          active={option.value === value}
          count={option.count}
          key={option.value}
          label={option.label}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}

export function FilterPill({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  /** Omitted, or zero, renders no badge — the pill still shows. */
  count?: number;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={count == null ? label : `${label}, ${count}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm - 2,
      }}
      // No tap lock: switching filters in quick succession must not drop taps.
      tapLockMs={0}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
        {label}
      </Text>
      {count != null && count > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: active ? colors.onPrimary : colors.primary,
            borderRadius: 999,
            height: 18,
            justifyContent: "center",
            minWidth: 18,
            paddingHorizontal: 5,
          }}
        >
          <Text
            style={{
              color: active ? colors.primary : colors.onPrimary,
              fontFamily: fonts.sansBold,
              fontSize: 11,
              fontVariant: ["tabular-nums"],
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

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
 * <p>A funnel rather than a chevron: the chevron described the animation, which
 * nobody needs told, while the funnel says what the control is for. It turns
 * primary while open, so the pill states its own state without a second label.
 *
 * <p>The expanded pills SCROLL sideways rather than wrapping. Wrapping pushed a
 * fourth option onto a second line inside a heading row that has no room for
 * one, and the overflow was simply clipped.
 */
export function CollapsibleFilterBubbles<T extends string>({
  align = "end",
  onChange,
  options,
  value,
}: {
  /**
   * Where the row sits when closed. "end" pins the pill to the right, for use
   * beside a section heading; "start" left-aligns it, for a row standing on its
   * own above a search field.
   */
  align?: "end" | "start";
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
        // flex:1 ONLY when pinned beside a heading, where it has to claim the
        // width to the right of the title. Standing on its own it sits in a
        // COLUMN, and there flex:1 means grow DOWNWARD — a filter row stretched
        // to the height of whatever space was going spare.
        flex: align === "start" ? undefined : 1,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: open || align === "start" ? "flex-start" : "flex-end",
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
          // Never squeezed by the scroller beside it.
          flexShrink: 0,
          gap: 3,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
        }}
        tapLockMs={0}
      >
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>
          Filters
        </Text>
        <Filter color={open ? colors.primary : colors.ink} size={12} strokeWidth={2.4} />
      </AnimatedPressable>

      {open ? (
        <ScrollView
          contentContainerStyle={{ alignItems: "center", gap: spacing.xs, paddingRight: spacing.xs }}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          // Takes whatever width is left beside the Filters pill and scrolls
          // inside it, rather than wrapping onto a line the heading row lacks.
          style={{ flexGrow: 0, flexShrink: 1 }}
        >
          {options.map((option) => (
            <Bubble
              key={option.value}
              label={option.count == null ? option.label : `${option.label} · ${option.count}`}
              on={option.value === value}
              onPress={() => onChange(option.value)}
            />
          ))}
        </ScrollView>
      ) : null}
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
