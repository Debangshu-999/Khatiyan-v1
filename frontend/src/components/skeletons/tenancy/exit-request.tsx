import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton, SkeletonCard } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

/** Reserve the same stay, notice, checkout and reason sections as the exit form. */
export function TenantExitRequestSkeleton() {
  return (
    <View accessibilityLabel="Loading exit request" style={{ gap: spacing.lg }}>
      <SkeletonCard />
      <Card>
        <Skeleton height={18} width="42%" />
        <Skeleton height={24} width="58%" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.sm }}><Skeleton width="70%" /><Skeleton height={18} width="90%" /></View>
          <View style={{ flex: 1, gap: spacing.sm }}><Skeleton width="75%" /><Skeleton height={18} width="90%" /></View>
        </View>
      </Card>
      <Card>
        <Skeleton height={18} width="48%" />
        <Skeleton height={76} />
        <Skeleton height={26} radius={999} width={90} />
        <Skeleton width="90%" />
      </Card>
      <Card>
        <Skeleton height={18} width="52%" />
        <Skeleton width="85%" />
        <Skeleton height={130} />
      </Card>
    </View>
  );
}
