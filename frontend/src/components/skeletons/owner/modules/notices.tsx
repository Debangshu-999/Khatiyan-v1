import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataListSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function OwnerNoticeTotalsSkeleton() {
  return <OwnerMetricGridSkeleton columns={3} count={3} square />;
}

export function OwnerNoticeListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <OwnerDataListSkeleton actions={1} bodyLines={2} rows={rows} />
    </View>
  );
}

export function OwnerNoticeDetailSkeleton() {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Skeleton height={44} radius={14} width={44} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={18} width="90%" />
            <Skeleton height={18} width="55%" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={13} width={130} />
          <Skeleton height={13} radius={999} width={70} />
        </View>
        <View style={{ backgroundColor: colors.border, height: 1 }} />
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="97%" />
          <Skeleton height={14} width="92%" />
          <Skeleton height={14} width="60%" />
        </View>
      </View>
    </Card>
  );
}
