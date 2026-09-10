import { View } from "react-native";

import { OwnerInsetListSkeleton, OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerBillingOverviewSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerSummaryCardSkeleton />
      <OwnerMetricGridSkeleton count={6} />
    </View>
  );
}

export function OwnerBillingCycleListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerInsetListSkeleton header={false} rows={rows} />;
}
