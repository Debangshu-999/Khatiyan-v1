import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

function PropertyBoardCategorySkeleton({ rows }: { rows: number }) {
  const { colors } = useTheme();
  const titleWidths = ["38%", "48%", "32%"] as const;
  const bodyWidths = ["68%", "76%", "58%"] as const;

  return (
    <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={40} radius={999} width={40} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Skeleton height={17} width={rows === 1 ? "46%" : "40%"} />
          <Skeleton height={11} width="18%" />
        </View>
      </View>

      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 12,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 60,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton height={14} width={titleWidths[index % titleWidths.length]} />
              <Skeleton height={11} width={bodyWidths[index % bodyWidths.length]} />
            </View>
            <Skeleton height={18} radius={9} width={18} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Loading geometry for the API-driven category section of the board screen. */
export function PropertyBoardScreenSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <PropertyBoardCategorySkeleton rows={1} />
      <PropertyBoardCategorySkeleton rows={3} />
    </View>
  );
}
