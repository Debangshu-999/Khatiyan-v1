import { useState, type ReactNode } from "react";
import { LayoutAnimation, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The screen's side gutter: the row runs under it to the screen's edges (user, 2026-11-09). */
const BLEED = spacing.lg;

/** Between cards. Smaller than the gutter, so a sliver of each neighbour shows in it. */
const GAP = spacing.xs;

/**
 * Cards side by side, swiped one at a time, with dots under them (user,
 * 2026-11-09: Home's digest cards stacked made the screen too long).
 *
 * <p>Every card is the full width between the screen's gutters, and its
 * neighbours show as a sliver in the gutter: on the right of the first, on
 * both sides of a middle one, on the left of the last.
 */
export function CardCarousel({
  fitPage = false,
  pages,
}: {
  /**
   * Each card keeps its own height and the row takes the height of the one on
   * screen (user, 2026-11-10: a short card stretched to a tall neighbour's
   * height was a block of empty colour).
   */
  fitPage?: boolean;
  pages: { key: string; node: ReactNode }[];
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const currentHeight = fitPage ? heights[pages[index]?.key ?? ""] : undefined;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const next = Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / (width + GAP))));
    if (next !== index && fitPage) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIndex(next);
  };

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: spacing.sm }}>
      {width ? (
        <ScrollView
          contentContainerStyle={{ alignItems: fitPage ? "flex-start" : undefined, gap: GAP, paddingHorizontal: BLEED, paddingVertical: 6 }}
          decelerationRate="fast"
          horizontal
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={width + GAP}
          // Out to the screen's edges, and room above and below for the cards'
          // shadows, which a scroll view clips.
          style={{ height: currentHeight != null ? currentHeight + 12 : undefined, marginHorizontal: -BLEED, marginVertical: -6 }}
        >
          {pages.map((page) => (
            <View
              key={page.key}
              onLayout={fitPage ? (event) => {
                const measured = event.nativeEvent.layout.height;
                setHeights((known) => (known[page.key] === measured ? known : { ...known, [page.key]: measured }));
              } : undefined}
              style={{ width }}
            >
              {page.node}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {pages.length > 1 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" }}>
          {pages.map((page, dot) => (
            <View
              key={page.key}
              style={{
                backgroundColor: dot === index ? colors.primary : colors.borderStrong,
                borderRadius: 999,
                height: 6,
                width: dot === index ? 16 : 6,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
