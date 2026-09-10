import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner/shared";
import { OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerFinanceOverviewSkeleton({ metrics = 3 }: { metrics?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerSummaryCardSkeleton />
      <OwnerMetricGridSkeleton count={metrics} />
    </View>
  );
}

export function OwnerChartSkeleton() {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Skeleton height={12} width="38%" />
        <Skeleton height={172} radius={12} width="100%" />
        <Skeleton height={10} width="76%" />
      </View>
    </Card>
  );
}

export function OwnerBreakdownSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Skeleton height={11} width="34%" />
          <Skeleton height={16} width="28%" />
        </View>
        {Array.from({ length: rows }).map((_, index) => (
          <View key={index} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Skeleton height={10} width={index % 2 ? "42%" : "56%"} />
              <Skeleton height={10} width="24%" />
            </View>
            <Skeleton height={8} radius={999} width="100%" />
          </View>
        ))}
      </View>
    </Card>
  );
}

export function OwnerPnlHeroSkeleton() {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 104 }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={11} width="42%" />
            <Skeleton height={34} width="66%" />
            <Skeleton height={10} width="88%" />
          </View>
          <Skeleton height={92} radius={16} width={118} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={72} radius={12} width="100%" />
          <Skeleton height={72} radius={12} width="100%" />
          <Skeleton height={72} radius={12} width="100%" />
        </View>
        <Skeleton height={38} radius={12} width="100%" />
      </View>
    </Card>
  );
}

export function OwnerLedgerSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}
