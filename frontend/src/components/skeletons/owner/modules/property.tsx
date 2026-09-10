import { View } from "react-native";

import { OwnerDataCardSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerPropertyOverviewSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerDataCardSkeleton actions={2} bodyLines={1} />
      <OwnerMetricGridSkeleton count={6} />
    </View>
  );
}
