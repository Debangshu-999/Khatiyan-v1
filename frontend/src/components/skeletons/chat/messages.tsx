import { View, type DimensionValue } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { SkeletonBoundary } from "../boundary";
import { Skeleton } from "../primitives";

/** Neutral, compact bubbles extending through the visible thread while it loads. */
export function ChatMessagesSkeleton() {
  return (
    <SkeletonBoundary>
      <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
        <GhostBubble width="34%" lines={["72%"]} />
        <GhostBubble width="44%" lines={["84%", "58%"]} />
        <GhostBubble mine width="36%" lines={["76%"]} />
        <GhostBubble mine width="42%" lines={["87%", "63%"]} />
        <GhostBubble width="31%" lines={["66%"]} />
        <GhostBubble mine width="38%" lines={["75%"]} />
        <GhostBubble width="40%" lines={["82%", "56%"]} />
        <GhostBubble width="33%" lines={["71%"]} />
        <GhostBubble mine width="45%" lines={["80%", "64%"]} />
        <GhostBubble width="36%" lines={["73%"]} />
        <GhostBubble mine width="32%" lines={["68%"]} />
        <GhostBubble width="41%" lines={["78%", "54%"]} />
      </View>
    </SkeletonBoundary>
  );
}

function GhostBubble({
  lines,
  mine = false,
  width,
}: {
  lines: DimensionValue[];
  mine?: boolean;
  width: DimensionValue;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        gap: spacing.xs,
        marginHorizontal: spacing.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        width,
      }}
    >
      {lines.map((lineWidth, index) => (
        <Skeleton height={10} key={index} radius={5} width={lineWidth} />
      ))}
      <View style={{ alignItems: "flex-end", paddingTop: 2 }}>
        <Skeleton height={7} radius={4} width={32} />
      </View>
    </View>
  );
}
