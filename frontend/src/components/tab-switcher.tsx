import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The pill's inset from the track, used as both the padding and the gap. */
const TRACK_PADDING = 4;

export type TabOption<T extends string> = {
  /**
   * A glyph above the label.
   *
   * <p>Optional, but a switcher should either give every tab one or give none
   * of them one — a row where only some tabs carry a mark reads as the others
   * having failed to load.
   */
  icon?: ComponentType<LucideProps>;
  label: string;
  value: T;
};

/**
 * The app's one tab switcher.
 *
 * <p>A pill inside a rounded groove. The selected segment is rounded on ALL
 * four corners — including the edge facing its neighbour — and sits inset from
 * the track by a few pixels, so it reads as a token that slides along a channel
 * rather than as one half of a divided box.
 *
 * <p>This replaces a corner-to-corner segment in a square-ish track. Filling the
 * control edge to edge meant the selected half squared off where it met the
 * other tab, which made the two look like panels butted together and left no
 * ground for the selection to sit ON — so the state had to be underlined to be
 * legible.
 *
 * <p><b>Selection is the pill itself now.</b> The sunken track gives the fill
 * something to contrast against, which is what the 2px bottom rule used to do.
 * A rule inside a fully rounded pill would clip against the curve at both ends,
 * and it is not needed once the shape carries the state.
 *
 * <p><b>Icons sit above their labels, not beside them.</b> Beside, the pair
 * competes for a width that two or three tabs have to share, and the longest
 * label decides how much room the glyph gets. Stacked, every tab is the same
 * height whatever it is called, and the row can be read by shape before it is
 * read by word.
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
        // Sunken, not surface. The pill needs a ground to be a pill ON — against
        // white it read as a shape floating in a box rather than as a selection
        // sitting in a channel.
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: TRACK_PADDING,
        // The inset that lets the pill be rounded on every side. Without it the
        // segment's curve would be cut off by the track's own edge.
        padding: TRACK_PADDING,
      }}
    >
      {options.map((option) => {
        const selected = option.value === active;
        const Icon = option.icon;

        return (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              // The same fill the underline tabs use, so the app has one answer
              // to "this one is selected" rather than two.
              backgroundColor: selected ? colors.tabSelected : "transparent",
              borderCurve: "continuous",
              // Rounded on all four corners, the neighbour-facing edge included.
              borderRadius: 999,
              flex: 1,
              // Icon beside the label, not above it. Stacked, each tab was a
              // two-line block and the switcher stood 58pt tall — taller than
              // the cards under it and the loudest thing on the screen. On one
              // line the glyph reads as part of the label rather than a second
              // element to take in.
              flexDirection: "row",
              gap: spacing.xs,
              justifyContent: "center",
              // The height is the same whether or not a tab has an icon, so a
              // switcher does not change size between screens.
              minHeight: 44,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            }}
          >
            {Icon ? (
              <Icon
                color={selected ? colors.onTabSelected : colors.muted}
                size={18}
                strokeWidth={selected ? 2.3 : 2}
              />
            ) : null}

            <Text
              numberOfLines={1}
              style={{
                color: selected ? colors.onTabSelected : colors.muted,
                fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
                fontSize: 12.5,
                // No flex and no centring: the pair is centred by the row, and
                // a flexing label pushed the glyph off the label it belongs to
                // whenever one tab's text was longer than another's.
              }}
            >
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
