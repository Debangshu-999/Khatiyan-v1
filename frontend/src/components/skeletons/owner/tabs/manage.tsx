import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataCardSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerManagePropertySkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerDataCardSkeleton bodyLines={1} />
      <OwnerMetricGridSkeleton count={4} />
    </View>
  );
}

export function OwnerManageMetricsSkeleton() {
  return <OwnerMetricGridSkeleton count={4} />;
}

export function OwnerPropertyNameSkeleton() {
  return <Skeleton height={18} width="58%" />;
}
