import { View } from "react-native";

import { OwnerDataListSkeleton, OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerDepositOverviewSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerSummaryCardSkeleton />
      <OwnerMetricGridSkeleton count={2} />
      <OwnerDataListSkeleton bodyLines={1} rows={2} />
    </View>
  );
}

export function OwnerDepositListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}
