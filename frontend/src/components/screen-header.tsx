import type { ReactNode } from "react";
import { Image, Text, View, type ImageSourcePropType, type TextStyle, type ViewStyle } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HeaderNote } from "@/components/header-note";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Reserved beside the subtitle, so the note never runs under the artwork. */
/**
 * The one header-artwork preset, taken from the billing screen.
 *
 * <p>Every screen that grew its own header picked its own numbers — 96, 100 and
 * 112 tall, 112 to 150 wide, lifted anywhere between 4 and 26 points — so the
 * same kind of illustration was a different size on each. These are billing's,
 * and they are now the only ones.
 */
const ARTWORK_WIDTH = 150;
const ARTWORK_HEIGHT = 100;
/**
 * How far the image is lifted out of the NOTE's row.
 *
 * <p>
 * Billing anchors its artwork to the whole header and lifts it 4pt above the
 * title. Here the image lives in the note's row, which starts below the title,
 * so the same position needs everything between the two rows added back:
 *
 * <pre>
 *   title line height   35  (ARTWORK_TITLE_SIZE + 6)
 *   row gap            +10  (spacing.sm)
 *   the note row's lift -6  (marginTop: -spacing.xs)
 *   billing's own lift  +4
 *                      ===
 *                        43
 * </pre>
 *
 * <p>
 * It read -38 until 2026-09-06, which was this sum estimated rather than taken
 * — the artwork sat 5pt lower here than on the screen it was copied from, which
 * is exactly the drift these constants exist to stop.
 */
const ARTWORK_TOP = -43;
/** Billing's title size. The artwork variant shrinks rather than wrapping. */
const ARTWORK_TITLE_SIZE = 29;

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  titleAdjustsFontSizeToFit?: boolean;
  titleMinimumFontScale?: number;
  titleNumberOfLines?: number;
  titleStyle?: TextStyle;
  italicTail?: string;
  subtitle?: string;
  /**
   * A screen illustration, set beside the SUBTITLE rather than the title.
   *
   * <p>Not {@code trailing}. That slot shares the title's row, so an image there
   * takes width from the title and pushes it onto a second line — a two-word
   * screen name wrapping mid-phrase. Sitting lower, against the description, the
   * title gets the full width and the artwork gets room to be seen.
   */
  artwork?: ImageSourcePropType;
  trailing?: ReactNode;
  // A status that qualifies the whole screen — "View only" is the case. Sits on
  // the TITLE row, right of the title, because that is the screen's name and the
  // badge is a fact about it. Sharing the row with `trailing` is fine: they
  // render side by side.
  badge?: ReactNode;
  // Renders a compact back chip inline on the eyebrow row (left of the kicker)
  // so navigation doesn't cost the screen its own row of white space.
  onBack?: () => void;
  style?: ViewStyle;
};

// Editorial page header: a small uppercase kicker, a serif title with an
// optional italic tail for an editorial flourish, and a muted subtitle.
// A thin rule runs along the kicker row — a letterhead detail that ties
// screens together. The back affordance shares that row instead of sitting
// above the header on its own line.
export function ScreenHeader({ artwork, badge, eyebrow, italicTail, onBack, style, subtitle, title, titleAdjustsFontSizeToFit, titleMinimumFontScale, titleNumberOfLines, titleStyle, trailing }: ScreenHeaderProps) {
  const { colors, type } = useTheme();
  const titleSize = artwork ? ARTWORK_TITLE_SIZE : 30;

  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {onBack || eyebrow ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          {onBack ? (
            <AnimatedPressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onBack}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
                borderRadius: 999,
                borderWidth: 1,
                height: 32,
                justifyContent: "center",
                width: 32,
              }}
            >
              <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
            </AnimatedPressable>
          ) : null}
          {eyebrow ? (
            <Text style={[type.eyebrow, { color: colors.accent }]}>
              {eyebrow}
            </Text>
          ) : null}
          <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.55 }} />
        </View>
      ) : null}

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        {/* With artwork the title reserves its width and SHRINKS to fit rather
            than wrapping — billing's arrangement. Reserving the width without
            the shrink is what put every heading on two lines. */}
        <View style={{ flex: 1, gap: spacing.xs, paddingRight: artwork ? ARTWORK_WIDTH : 0 }}>
          <Text
            adjustsFontSizeToFit={titleAdjustsFontSizeToFit ?? Boolean(artwork)}
            minimumFontScale={titleMinimumFontScale ?? 0.72}
            numberOfLines={titleNumberOfLines ?? (artwork ? 1 : undefined)}
            style={[type.brand, { color: colors.ink, fontSize: titleSize, lineHeight: titleSize + 6 }, titleStyle]}>
            {title}
            {italicTail ? (
              <Text style={[type.brandItalic, { color: colors.accent, fontSize: titleSize, lineHeight: titleSize + 6 }, titleStyle]}>
                {" "}
                {italicTail}
              </Text>
            ) : null}
          </Text>
          {/* With artwork the note shares its row with the image; without it the
              note simply follows the title as before. */}
          {subtitle && !artwork ? <HeaderNote>{subtitle}</HeaderNote> : null}
        </View>

        {badge || trailing ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {badge}
            {trailing}
          </View>
        ) : null}
      </View>

      {artwork ? (
        // The note sets this row's height; the image floats beside it.
        //
        // In flow, the image WAS the height — 82pt of it against a two-line note
        // of 36 — so the row carried 46pt of blank below the text that read as a
        // gap before whatever came next. Taking it out of the flow means the
        // header ends where the words end, whatever the artwork's size, and the
        // reserved padding is what keeps the text from running under it.
        <View style={{ marginTop: -spacing.xs, minHeight: ARTWORK_HEIGHT - 40, position: "relative" }}>
          <View style={{ paddingRight: ARTWORK_WIDTH }}>
            {subtitle ? <HeaderNote>{subtitle}</HeaderNote> : null}
          </View>
          <Image
            // Decorative. It repeats the title it sits beside, so a screen
            // reader announcing it says the screen's name twice.
            accessible={false}
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={artwork}
            // Lifted so it straddles the title and the note rather than sitting
            // under both — it belongs to the header as a whole. Only partly,
            // though: pulled level with the title it read as a second title.
            style={{ height: ARTWORK_HEIGHT, position: "absolute", right: 0, top: ARTWORK_TOP, width: ARTWORK_WIDTH }}
          />
        </View>
      ) : null}
    </View>
  );
}
