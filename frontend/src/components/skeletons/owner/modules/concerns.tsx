import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataCardSkeleton, OwnerDataListSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerConcernMetricsSkeleton() {
  return <OwnerMetricGridSkeleton count={6} />;
}

export function OwnerConcernQueueSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerDataListSkeleton actions={1} bodyLines={2} rows={rows} />;
}

export function OwnerConcernDetailSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={184} radius={16} width="100%" />
      <OwnerDataCardSkeleton bodyLines={3} />
      <OwnerDataCardSkeleton bodyLines={2} />
    </View>
  );
}
