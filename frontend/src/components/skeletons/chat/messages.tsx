import { View, type DimensionValue } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { SkeletonBoundary } from "../boundary";
import { Skeleton } from "../primitives";

/** A few incoming and outgoing bubbles in the same positions as a real thread. */
export function ChatMessagesSkeleton() {
  return (
    <SkeletonBoundary>
      <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
        <GhostBubble width="43%" lines={["72%"]} />
        <GhostBubble width="57%" lines={["84%", "58%"]} />
        <GhostBubble mine width="48%" lines={["76%"]} />
        <GhostBubble mine width="54%" lines={["87%", "63%"]} />
        <GhostBubble width="38%" lines={["66%"]} />
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
        backgroundColor: mine ? colors.jadeSoft : colors.surface,
        borderColor: mine ? "#CFEBD9" : colors.border,
        borderRadius: 16,
        borderWidth: 1,
        gap: spacing.xs,
        marginHorizontal: spacing.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        width,
      }}
    >
      {lines.map((lineWidth, index) => (
        <Skeleton height={13} key={index} radius={7} width={lineWidth} />
      ))}
      <View style={{ alignItems: "flex-end", paddingTop: 2 }}>
        <Skeleton height={8} radius={4} width={42} />
      </View>
    </View>
  );
}
