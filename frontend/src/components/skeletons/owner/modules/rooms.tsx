import { ScrollView, View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataListSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerRoomMetricsSkeleton() {
  return <OwnerMetricGridSkeleton count={4} />;
}

export function OwnerRoomInventorySkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={40} radius={999} width={84} />
          <Skeleton height={40} radius={999} width={76} />
          <Skeleton height={40} radius={999} width={92} />
        </View>
      </ScrollView>
      <OwnerDataListSkeleton bodyLines={1} rows={2} />
    </View>
  );
}
