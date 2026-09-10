import { View } from "react-native";

import { OwnerDataListSkeleton, OwnerFormSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerTenancySnapshotSkeleton() {
  return <OwnerMetricGridSkeleton count={4} />;
}

export function OwnerTenancyListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerDataListSkeleton actions={1} bodyLines={1} rows={rows} />;
}

export function OwnerTenancyInitialSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <OwnerTenancySnapshotSkeleton />
      <OwnerTenancyListSkeleton />
    </View>
  );
}

export function OwnerEndTenancySkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <OwnerDataListSkeleton bodyLines={1} rows={1} />
      <OwnerFormSkeleton fields={5} />
    </View>
  );
}
