import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataListSkeleton, OwnerFormSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerPaymentListSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}

export function OwnerPaymentDetailsSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={22} width="26%" />
        <OwnerFormSkeleton fields={3} media />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={22} width="42%" />
        <OwnerFormSkeleton fields={3} />
      </View>
    </View>
  );
}
