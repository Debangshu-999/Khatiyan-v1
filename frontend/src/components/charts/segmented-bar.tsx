import { useState } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { LegendRow } from "@/components/charts/legend";
import { segmentRects } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";

export type Segment = { key: string; label: string; value: number; color: string; valueText: string };

/** One bar split into ordered parts. Used instead of a pie when there are two to four parts, or when they have an order. */
export function SegmentedBar({ accessibilityLabel, legendColumns = 2, segments }: { accessibilityLabel: string; legendColumns?: 1 | 2; segments: Segment[] }) {
  const palette = useChartPalette();
  const [width, setWidth] = useState(0);
  const height = 14;
  const rects = width > 0 ? segmentRects(segments.map((segment) => segment.value), width) : [];

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        accessibilityLabel={accessibilityLabel}
        accessible
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}
        style={{ height }}
      >
        {width > 0 ? (
          <Svg height={height} width={width}>
            {rects.length === 0 ? (
              <Rect fill={palette.track} height={height} rx={3} width={width} x={0} y={0} />
            ) : (
              rects.map((rect) => (
                <Rect fill={segments[rect.index].color} height={height} key={segments[rect.index].key} rx={3} width={Math.max(rect.width, 1)} x={rect.x} y={0} />
              ))
            )}
          </Svg>
        ) : null}
      </View>
      <View style={{ columnGap: spacing.md, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
        {segments.map((segment) => (
          <View key={segment.key} style={{ width: legendColumns === 2 ? "46%" : "100%" }}>
            <LegendRow color={segment.color} label={segment.label} value={segment.valueText} />
          </View>
        ))}
      </View>
    </View>
  );
}
