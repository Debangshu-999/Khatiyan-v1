import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { MarqueeText } from "@/components/marquee-text";
import { metricFontSize } from "@/theme/metric-size";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type MetricTileProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ComponentType<LucideProps>;
  iconTone?: "primary" | "success" | "violet" | "warning" | "danger";
  /**
   * Where the glyph sits.
   *
   * <p>"top" stacks it above the label, which suits a tile read as a column of
   * numbers. "side" puts it in a left rail like the billing card's, which is
   * what a grid of status counts wants: the glyph is the thing being counted,
   * and reading it beside its own label is faster than reading down to find
   * which label it belongs to.
   */
  iconPlacement?: "top" | "side";
  tone?: "default" | "primary" | "danger";
  // Money values shown three-across can be long; dense uses a smaller base size
  // so the amount fits on one line without shrinking as aggressively.
  dense?: boolean;
};

export function MetricTile({ dense = false, hint, icon: Icon, iconPlacement = "top", iconTone = "primary", label, tone = "default", value }: MetricTileProps) {
  const { colors, type } = useTheme();
  const accentColor = tone === "danger" ? colors.danger : tone === "primary" ? colors.jade : colors.ink;
  // Every tile is a white card; the tone lives in the number alone. A filled
  // green tile beside a white one read as two different KINDS of statistic
  // rather than the same statistic with a good value, and a row of them turned
  // the summary into the loudest thing on a screen that is mostly a list.
  const backgroundColor = colors.surface;
  const borderColor = colors.borderStrong;
  // The side rail is the billing tile's layout, so it takes its type scale
  // too: a 23pt number beside a 38pt glyph. At 28 the number was the loudest
  // thing in a six-tile grid and the same figure looked bigger here than on the
  // billing screen it was copied from.
  //
  // Then shrunk by length: a long money figure gets a smaller size rather than
  // an ellipsis. adjustsFontSizeToFit cannot do this on web.
  const fontSize = metricFontSize(value, dense ? 19 : iconPlacement === "side" ? 23 : 28);
  // The glyph carries the meaning of the row it heads — amber for waiting, red
  // for needing the owner — so a six-tile summary can be read by colour before
  // it is read by word.
  const iconColor =
    iconTone === "success"
      ? colors.jade
      : iconTone === "violet"
        ? "#6D4BD2"
        : iconTone === "warning"
          ? colors.warningText
          : iconTone === "danger"
            ? colors.danger
            : colors.primary;

  return (
    <View
      style={{
        backgroundColor,
        borderColor,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {/* Bare, on the tile's own white — the billing card's treatment. A tinted
          square behind it would put a second surface inside a card that is
          already a surface. Larger in the side rail than stacked above the
          label, where it has a column of its own to fill. */}
      {Icon && iconPlacement === "top" ? <Icon color={iconColor} size={22} strokeWidth={1.9} /> : null}

      <View
        style={
          iconPlacement === "side" && Icon
            ? { alignItems: "center", flexDirection: "row", gap: spacing.xs }
            : undefined
        }
      >
        {Icon && iconPlacement === "side" ? (
          <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
            {/* Ink, not the tone colour. In the rail the glyph sits directly
                beside the label it names, and a coloured mark there competed
                with the number for the eye — the tone still carries in the
                value, which is where the reading actually happens. */}
            <Icon color={colors.ink} size={38} strokeWidth={1.75} />
          </View>
        ) : null}

        <View
          style={{
            flex: iconPlacement === "side" && Icon ? 1 : undefined,
            gap: iconPlacement === "side" ? 2 : spacing.xs,
            minWidth: 0,
          }}
        >
          {/* Sentence case at caption size in the rail, tracked-out caps when
              stacked. Caps are a heading treatment: above the number they title
              the tile, but beside a 38pt glyph they read as a third graphic
              element competing with it, and they wrap badly in half a tile.
              This is the billing tile's label exactly.

              A long stacked label scrolls rather than ellipsising, per the
              app-wide overflow-label rule; in the rail it wraps to two lines
              instead, which is what the billing tile does. */}
          {iconPlacement === "side" ? (
            <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
              {label}
            </Text>
          ) : (
            <MarqueeText style={[type.eyebrow, { color: colors.kicker }]}>{label}</MarqueeText>
          )}
          {/* The family carries the weight — no fontWeight here, or Android
              synthesises a second bolding pass on top of ExtraBold. */}
          <Text
            numberOfLines={1}
            style={[
              type.metric,
              {
                color: accentColor,
                fontSize,
                lineHeight: fontSize + 4,
              },
            ]}
          >
            {value}
          </Text>

          {/* Inside the column, beside the glyph — the billing tile's stacking.
              Left outside the row the hint became a fourth line under the whole
              tile, which pushed the number to the top of the icon instead of
              sitting level with it. */}
          {hint && iconPlacement === "side" ? (
            <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 15 }]}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>

      {hint && iconPlacement !== "side" ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
