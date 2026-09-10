import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, type DimensionValue } from "react-native";

import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Shared loading primitives for the app.
 *
 * <p>
 * <b>Three shapes, arranged to match the screen.</b> Almost every screen is
 * built from the same three things — a wide card, a row of small metric tiles,
 * and a list — so the placeholders are those three and nothing else. A screen's
 * skeleton is written by composing them in the order and the COUNT its real
 * content has: four tiles means four ghost tiles.
 *
 * <p>
 * The individual cards are deliberately generic. What a reader takes in while a
 * page loads is its shape — how many blocks, how big, in what order — not
 * whether a particular card had a chip in its corner. Drawing each card exactly
 * cost a per-component conversion and leaked sample values whenever a leaf was
 * missed; matching the layout costs a few lines per screen and cannot leak
 * anything, because there is no data in it.
 */

// Calm loading placeholder: a sunken block that breathes (opacity pulse, native
// driver). Compose blocks to sketch the layout that is about to appear — a far
// better wait state than a lone spinner.
export function Skeleton({ height = 14, radius = 8, width = "100%" }: { height?: number; radius?: number; width?: DimensionValue }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 720, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 720, easing: Easing.inOut(Easing.quad), toValue: 0.55, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radius, height, opacity: pulse, width }} />;
}

/** The card every ghost is drawn inside — the app's real card, in one place. */
function SkeletonSurface({ children, padding = spacing.md }: { children: ReactNode; padding?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        padding,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {children}
    </View>
  );
}

/**
 * A full-width card: glyph, a heading line and a supporting line.
 *
 * <p>Stands in for the wide cards — a collection rate, an occupancy
 * percentage, a summary panel, a tool row.
 */
export function SkeletonCard() {
  return (
    <SkeletonSurface padding={spacing.lg}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <Skeleton height={38} radius={10} width={38} />
        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <Skeleton height={13} width="46%" />
          <Skeleton height={20} width="70%" />
        </View>
      </View>
    </SkeletonSurface>
  );
}

/**
 * One small metric tile: glyph and a single line.
 *
 * <p>Half the height of a wide card, because the tiles it stands for hold a
 * label and a number and nothing else.
 */
function SkeletonTile() {
  return (
    <SkeletonSurface>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Skeleton height={30} radius={9} width={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Skeleton height={16} width="72%" />
        </View>
      </View>
    </SkeletonSurface>
  );
}

/**
 * Metric tiles in the app's two-per-row grid.
 *
 * <p><b>Pass the real count.</b> Six tiles must be six ghosts in three rows —
 * the number and the arrangement are the whole point of a skeleton, and a
 * two-tile stand-in for a six-tile grid makes the page jump when it lands.
 */
export function SkeletonTiles({ count = 2, perRow = 2 }: { count?: number; perRow?: number }) {
  const rows = Array.from({ length: Math.ceil(count / perRow) });

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((_, rowIndex) => {
        const inRow = Math.min(perRow, count - rowIndex * perRow);
        return (
          <View key={rowIndex} style={{ flexDirection: "row", gap: spacing.sm }}>
            {Array.from({ length: inRow }).map((__, index) => (
              <SkeletonTile key={index} />
            ))}
            {/* Keeps a trailing odd tile at one column's width instead of
                letting it stretch across the row. */}
            {Array.from({ length: perRow - inRow }).map((__, index) => (
              <View key={`spacer-${index}`} style={{ flex: 1 }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * One list row: glyph, a title line and a detail line.
 *
 * <p>Two options for the taller cards. {@code body} adds paragraph lines, for
 * a card carrying a message or a note; {@code action} adds the button bar a
 * card ends with. Both off by default — a plain row is still the common case,
 * and a ghost that reserves height the card does not have is as wrong as one
 * that reserves too little.
 */
export function SkeletonRow({ action = false, body = 0 }: { action?: boolean; body?: number }) {
  const bodyWidths: DimensionValue[] = ["96%", "88%", "62%"];

  return (
    <SkeletonSurface>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <Skeleton height={40} radius={10} width={40} />
          <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
            <Skeleton height={16} width="58%" />
            <Skeleton height={12} width="80%" />
          </View>
        </View>

        {body > 0 ? (
          <View style={{ gap: 6 }}>
            {Array.from({ length: body }).map((_, index) => (
              <Skeleton height={12} key={index} width={bodyWidths[index % bodyWidths.length]} />
            ))}
          </View>
        ) : null}

        {action ? (
          <View style={{ alignItems: "flex-end" }}>
            <Skeleton height={44} radius={12} width="42%" />
          </View>
        ) : null}
      </View>
    </SkeletonSurface>
  );
}

/** A list, at the length and the card height the screen will actually show. */
export function SkeletonList({
  action = false,
  body = 0,
  rows = 3,
}: {
  action?: boolean;
  body?: number;
  rows?: number;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow action={action} body={body} key={index} />
      ))}
    </View>
  );
}

/**
 * A form card: an intro note and a stack of labelled fields.
 *
 * <p>
 * The fourth shape, because a form is not a list. Payment details, property
 * settings and the onboarding steps are one tall card of label-and-input pairs,
 * and standing rows of icon-plus-two-lines in for them drew a page nothing like
 * the one that arrived.
 *
 * @param media a large block above the fields — a QR code, a photo picker.
 */
export function SkeletonForm({ fields = 3, media = false, note = true }: { fields?: number; media?: boolean; note?: boolean }) {
  return (
    <SkeletonSurface>
      <View style={{ gap: spacing.md }}>
        {note ? (
          <View style={{ gap: 6 }}>
            <Skeleton height={12} width="94%" />
            <Skeleton height={12} width="72%" />
          </View>
        ) : null}

        {media ? <Skeleton height={168} radius={12} width="100%" /> : null}

        {Array.from({ length: fields }).map((_, index) => (
          <View key={index} style={{ gap: spacing.xs }}>
            <Skeleton height={12} width="38%" />
            <Skeleton height={46} radius={12} width="100%" />
          </View>
        ))}
      </View>
    </SkeletonSurface>
  );
}

/** The screen heading: a title and its two-line note. */
export function SkeletonHeader() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Skeleton height={30} width="62%" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ backgroundColor: colors.accent, borderRadius: 2, opacity: 0.6, width: 3 }} />
        <View style={{ flex: 1, gap: 6, paddingVertical: 2 }}>
          <Skeleton height={12} width="90%" />
          <Skeleton height={12} width="55%" />
        </View>
      </View>
    </View>
  );
}

/** A strip of filter pills, as they sit above most lists. */
export function SkeletonPills({ count = 3 }: { count?: number }) {
  const widths = [92, 74, 108, 66, 84];
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton height={42} key={index} radius={999} width={widths[index % widths.length]} />
      ))}
    </View>
  );
}

/**
 * A whole screen, composed to match the one that is loading.
 *
 * <p>Pass what the screen actually has — {@code tiles={6}} for a six-tile grid,
 * {@code cards={2}} for two wide cards, {@code rows} for the list — and pass 0
 * for the parts it does not have. The order is the app's usual one: heading,
 * wide cards, tiles, filters, list.
 */
export function SkeletonScreen({
  cards = 0,
  header = true,
  pills = 0,
  rows = 3,
  tiles = 2,
}: {
  cards?: number;
  header?: boolean;
  pills?: number;
  rows?: number;
  tiles?: number;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      {header ? <SkeletonHeader /> : null}
      {Array.from({ length: cards }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
      {tiles > 0 ? <SkeletonTiles count={tiles} /> : null}
      {pills > 0 ? <SkeletonPills count={pills} /> : null}
      {rows > 0 ? <SkeletonList rows={rows} /> : null}
    </View>
  );
}
