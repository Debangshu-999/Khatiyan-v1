import { useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { plotLayout } from "@/features/analytics/chart-math";

/** Room under the bucket labels for the scroll bar, so it does not sit on them. */
const SCROLLBAR_SPACE = 10;

export type PlotFrame = {
  /** The whole plot's width, which is wider than `viewport` once it scrolls. */
  contentWidth: number;
  /** One bucket's width. A mark sits at its slot's centre. */
  slot: number;
  /** The plot width that shows at once. */
  viewport: number;
};

/**
 * The frame every over-time chart shares: the value axis held on the left, and a
 * plot beside it that scrolls sideways.
 *
 * <p>Up to five buckets share the width. Past five, each keeps a fifth of it and
 * the plot grows to the right, so a year of months stays readable instead of
 * being squeezed into one screen. The axis is drawn outside the scroll, so the
 * values stay in view however far the plot has moved.
 *
 * <p>{@code renderOverlay} draws over the whole frame and is not clipped by the
 * scroll. A callout that may float past the chart's edge belongs there, and so
 * does a label that should stay at the right of what shows.
 */
export function PlotScroller({
  accessibilityLabel,
  axisWidth,
  bucketCount,
  height,
  onScroll,
  raised = false,
  renderAxis,
  renderOverlay,
  renderPlot,
}: {
  accessibilityLabel: string;
  axisWidth: number;
  bucketCount: number;
  height: number;
  /** Called as the plot moves. A chart uses it to drop a callout tied to a position. */
  onScroll?: () => void;
  /** Lifts the frame over its neighbours while a callout is showing. */
  raised?: boolean;
  renderAxis: () => ReactNode;
  renderOverlay?: (frame: PlotFrame & { scrollX: number }) => ReactNode;
  renderPlot: (frame: PlotFrame) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  // Read when an overlay is placed, never rendered from, so a moving plot does
  // not redraw the chart on every frame.
  const scrollX = useRef(0);
  const viewport = Math.max(0, width - axisWidth);
  const { contentWidth, slot } = plotLayout(viewport, bucketCount);
  const scrollable = contentWidth > viewport + 0.5;
  const frame: PlotFrame = { contentWidth, slot, viewport };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={{
        flexDirection: "row",
        height: height + (scrollable ? SCROLLBAR_SPACE : 0),
        overflow: "visible",
        zIndex: raised ? 2 : 0,
      }}
    >
      {width > 0 ? (
        <>
          <View style={{ height, width: axisWidth }}>{renderAxis()}</View>
          <ScrollView
            bounces={false}
            horizontal
            nestedScrollEnabled
            onScroll={(event) => {
              scrollX.current = event.nativeEvent.contentOffset.x;
              onScroll?.();
            }}
            overScrollMode="never"
            // Kept on screen on Android. A plot that fits five months exactly
            // shows no cut-off sixth, so the bar is the only sign there is more.
            persistentScrollbar={scrollable}
            scrollEnabled={scrollable}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={scrollable}
            style={{ flex: 1 }}
          >
            <View style={{ height, width: contentWidth }}>{renderPlot(frame)}</View>
          </ScrollView>
          {renderOverlay ? renderOverlay({ ...frame, scrollX: scrollX.current }) : null}
        </>
      ) : null}
    </View>
  );
}
