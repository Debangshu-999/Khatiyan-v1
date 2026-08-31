import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { CircleCheck } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type UnderlineTabOption<T extends string> = {
  /** Marks the tab finished with a small jade check after its label. */
  done?: boolean;
  /**
   * Drawn above the label in a fixed-height slot.
   *
   * <p>Fixed so that tabs with an icon and tabs without still line up, and so a
   * tab drawing one glyph is the same height as one drawing four.
   */
  icon?: ReactNode;
  label: string;
  value: T;
};

/**
 * Tabs with no track: labels on the page, a rule beneath them, and a jade
 * underline marking the one you are on.
 *
 * <p>Distinct from `TabSwitcher`, which is a bordered segmented control. That
 * one reads as a filter you set; this reads as sections of a page you move
 * between — the difference between "show me only X" and "take me to X". A
 * bordered box around five sections of one form made the form look like five
 * separate things.
 *
 * <p>The selected tab's rule sits ON the row's hairline rather than above it, so
 * it reads as a continuation of that line instead of a second line under it.
 */
export function UnderlineTabs<T extends string>({
  active,
  bleed = 0,
  onChange,
  options,
  tone = "soft",
}: {
  active: T;
  /**
   * The horizontal gutter to cancel, so the rule runs the full screen width.
   *
   * <p>Pass the padding of the container this sits in — `spacing.lg` on every
   * screen in the app. A rule that stops short of both edges reads as the
   * underline of a box; one that reaches them reads as the division between the
   * tabs and the page, which is what it is.
   */
  bleed?: number;
  onChange: (value: T) => void;
  options: UnderlineTabOption<T>[];
  /**
   * How loudly the chosen tab is marked.
   *
   * <p>`soft` is the default: a jade wash under ink, for tabs sitting inside a
   * form among other content. `strong` fills the tab with sap green and inverts
   * its label — for a strip that IS the screen's navigation, where the chosen
   * section has to be obvious from across the room rather than merely findable.
   */
  tone?: "soft" | "strong";
}) {
  const { colors, fonts } = useTheme();
  const strong = tone === "strong";

  return (
    <View
      style={{
        // The strong tone's rule is the division between a screen's navigation
        // and its content, so it is drawn as one: a hairline in the lightest
        // grey disappeared under the filled tab sitting on it. The soft tone
        // stays a hairline — there it separates a control from a form, not one
        // half of the screen from the other.
        borderBottomColor: strong ? colors.borderStrong : colors.border,
        borderBottomWidth: strong ? 2 : 1,
        flexDirection: "row",
        // Owned here rather than left to each caller. This control ends in a
        // hairline flush against its own bottom edge, so whatever follows sits
        // directly on that line and reads as part of the tab rather than as the
        // section it opened. Every caller wanted the same gap.
        marginBottom: spacing.sm,
        marginHorizontal: -bleed,
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
              // The chosen tab is a tinted body sitting ON the rule, not just a
              // bolder word above it. Square, and filling its column corner to
              // corner: rounded shoulders left slivers of page colour where the
              // tab met the header's rule above and its own rule below, so the
              // selection read as a pill dropped between two lines rather than
              // as the span between them.
              backgroundColor: selected ? (strong ? colors.tabSelected : colors.jadeSoft) : "transparent",
              flex: 1,
              gap: 5,
              // Taller on the strong tone. There the strip IS the screen's
              // navigation and sits alone between two rules, so it has to hold
              // that band; on the soft tone it is one control among the fields
              // of a form and a bigger target would shout over them.
              paddingBottom: strong ? spacing.md : spacing.sm,
              // Matches the bottom, so the tinted body is evenly weighted top
              // and bottom and fills the strip rather than sitting low in it.
              paddingTop: strong ? spacing.md : spacing.sm,
            }}
          >
            {option.icon ? (
              <View style={{ alignItems: "center", height: 34, justifyContent: "center", width: 36 }}>
                {option.icon}
              </View>
            ) : null}

            <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: selected ? (strong ? colors.onTabSelected : colors.ink) : colors.muted,
                  fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
                  fontSize: strong ? 14 : 12,
                }}
              >
                {option.label}
              </Text>
              {option.done ? (
                <CircleCheck
                  color={selected && strong ? colors.onTabSelected : colors.jade}
                  size={12}
                  strokeWidth={2.6}
                />
              ) : null}
            </View>

            <View
              style={{
                backgroundColor: selected ? (strong ? colors.tabSelectedDeep : colors.jade) : "transparent",
                // Sits ON the rule and covers it, so the chosen tab breaks the
                // line rather than perching above it.
                bottom: strong ? -2 : -1,
                height: strong ? 3 : 2,
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

/**
 * Keeps a tab selection valid while the option list changes underneath it.
 *
 * <p>Occupancies are ticked and unticked on the form above the tabs, so the tab
 * somebody is standing on can stop existing. Falling back to the first option
 * rather than rendering nothing is what stops that looking like a crash.
 */
export function useTabSelection<T extends string>(values: T[]): [T | null, (next: T) => void] {
  const [chosen, setChosen] = useState<T | null>(null);
  const active = chosen && values.includes(chosen) ? chosen : values[0] ?? null;
  return [active, setChosen];
}
