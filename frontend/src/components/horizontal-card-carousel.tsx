import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

const GAP = 8;
/** How much of the next card shows, so it reads as something to swipe. */
const PEEK = 20;

export type CarouselCard = {
  key: string;
  node: ReactNode;
  /** The card's own fill, so a short card is filled to the height of the tallest. */
  fill: string;
};

/**
 * Message cards swiped sideways, with a row of dots under them (user,
 * 2026-10-31). It replaced a vertical looping deck that made the End tenancy
 * screen vibrate on a device: a vertical scroller inside a vertical page, whose
 * heights were measured into state and whose scroll position was jumped from
 * code. Here the platform runs the swipe, nothing is measured but the width, and
 * a horizontal row already makes its cards as tall as the tallest.
 */
export function HorizontalCardCarousel({ cards }: { cards: CarouselCard[] }) {
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(0);

  if (cards.length === 0) {
    return null;
  }
  const many = cards.length > 1;
  const cardWidth = many ? Math.max(width - PEEK, 0) : width;
  const step = cardWidth + GAP;
  const shown = Math.min(current, cards.length - 1);

  return (
    <View style={{ gap: GAP }}>
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((known) => (known === next ? known : next));
        }}
      >
        {width > 0 ? (
          <ScrollView
            contentContainerStyle={{ gap: GAP }}
            decelerationRate="fast"
            disableIntervalMomentum
            horizontal
            onScroll={(event) => {
              if (step > 0) {
                const next = Math.round(event.nativeEvent.contentOffset.x / step);
                setCurrent((known) => (known === next ? known : next));
              }
            }}
            scrollEnabled={many}
            scrollEventThrottle={32}
            showsHorizontalScrollIndicator={false}
            snapToAlignment="start"
            snapToInterval={step}
          >
            {cards.map((card) => (
              <View
                key={card.key}
                style={{
                  backgroundColor: card.fill,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  overflow: "hidden",
                  width: cardWidth,
                }}
              >
                {card.node}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {many ? <PageDots count={cards.length} current={shown} /> : null}
    </View>
  );
}

/** Where the shown card sits in the set: its dot dark green and a touch larger. */
function PageDots({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`${current + 1} of ${count}`}
      style={{ alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center" }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
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
