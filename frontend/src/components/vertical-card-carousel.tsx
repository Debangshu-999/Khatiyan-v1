import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/** Space between pages. Never on screen at rest, only mid-swipe. */
const GAP = 8;
const RADIUS = 14;

export type CarouselCard = {
  key: string;
  node: ReactNode;
  /** The card's own fill, carried under its dots so card and dots read as one. */
  fill: string;
};

/**
 * Message cards one at a time, swiped up and down, each with a column of dots
 * on its right marking its own place in the set (user, 2026-09-28).
 *
 * <p>A native scroll view snapping a page at a time, not a hand-animated deck:
 * the platform runs the swipe, so it is as smooth as any list.
 *
 * <p>It loops both ways (user, 2026-09-28): up from the last card is the first,
 * down from the first is the last. The list is drawn with a copy of the last
 * card before the first and a copy of the first after the last; when a swipe
 * settles on a copy, the view jumps without animation to the real card, which
 * looks the same, so the seam never shows. The cost is that a swipe on the
 * carousel never runs on into the page, since it has no end to run off.
 *
 * <p>Every page is as tall as the tallest card, measured first, so the snap
 * points are even and no card shows part of the next. Hidden until measured.
 */
export function VerticalCardCarousel({ cards }: { cards: CarouselCard[] }) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageHeight = Math.max(0, ...cards.map((card) => heights[card.key] ?? 0));
  const measured = cards.length > 0 && cards.every((card) => heights[card.key] != null);
  const step = pageHeight + GAP;
  const loops = cards.length > 1;
  const keysSignature = cards.map((card) => card.key).join("|");

  // Onto the real first card, past the leading copy, once the pages have a
  // height, and again whenever the set of cards changes.
  useEffect(() => {
    if (loops && measured) {
      scrollRef.current?.scrollTo({ animated: false, y: step });
    }
  }, [keysSignature, loops, measured, step]);

  useEffect(
    () => () => {
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
      }
    },
    [],
  );

  if (cards.length === 0) {
    return null;
  }

  function page(card: CarouselCard, position: number, key: string, last: boolean) {
    return (
      <View
        key={key}
        style={{
          alignItems: "center",
          backgroundColor: card.fill,
          borderCurve: "continuous",
          borderRadius: RADIUS,
          flexDirection: "row",
          marginBottom: last ? 0 : GAP,
          minHeight: measured ? pageHeight : undefined,
          overflow: "hidden",
        }}
      >
        <View
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            setHeights((current) => (current[card.key] === height ? current : { ...current, [card.key]: height }));
          }}
          style={{ flex: 1 }}
        >
          {card.node}
        </View>
        {loops ? <PageDots count={cards.length} current={position} /> : null}
      </View>
    );
  }

  if (!loops) {
    return page(cards[0], 0, cards[0].key, true);
  }

  const lastIndex = cards.length - 1;
  // [copy of last, ...cards, copy of first]
  const pages = [
    page(cards[lastIndex], lastIndex, `${cards[lastIndex].key}~head`, false),
    ...cards.map((card, index) => page(card, index, card.key, false)),
    page(cards[0], 0, `${cards[0].key}~tail`, true),
  ];

  /**
   * Once scrolling has stopped: on a copy, jump to the real card it copies.
   * Timed off the last scroll event rather than momentum-end, which web never
   * sends and Android sends inconsistently.
   */
  function settle(offsetY: number) {
    const index = Math.round(offsetY / step);
    if (index <= 0) {
      scrollRef.current?.scrollTo({ animated: false, y: cards.length * step });
    } else if (index >= cards.length + 1) {
      scrollRef.current?.scrollTo({ animated: false, y: step });
    } else if (Math.abs(offsetY - index * step) > 1) {
      // Stopped between cards: web has no snapToInterval, so it snaps here.
      scrollRef.current?.scrollTo({ animated: true, y: index * step });
    }
  }

  return (
    <ScrollView
      decelerationRate="fast"
      disableIntervalMomentum
      nestedScrollEnabled
      onScroll={(event) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        if (settleTimer.current) {
          clearTimeout(settleTimer.current);
        }
        settleTimer.current = setTimeout(() => settle(offsetY), 120);
      }}
      ref={scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={step}
      style={{ height: measured ? pageHeight : 0, opacity: measured ? 1 : 0 }}
    >
      {pages}
    </ScrollView>
  );
}

/** A card's own position among the set: its dot dark green, the rest grey. */
function PageDots({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`${current + 1} of ${count}`}
      style={{ alignItems: "center", gap: 4, paddingRight: 12, paddingLeft: 4 }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          // A filled circle for every card, the card's own in dark green and a
          // touch larger (user, 2026-09-28).
          style={{
            backgroundColor: index === current ? colors.jade : colors.borderStrong,
            borderRadius: 999,
            height: index === current ? 8 : 6,
            width: index === current ? 8 : 6,
          }}
        />
      ))}
    </View>
  );
}
