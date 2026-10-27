import { View } from "react-native";
import { Card } from "@/components/card";
import { Skeleton, SkeletonCard, SkeletonForm, SkeletonPills } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

export function BookingRequestSkeleton() {
  return <View accessibilityLabel="Loading booking form" style={{ gap: spacing.md }}><SkeletonCard /><SkeletonPills count={4} /><SkeletonForm fields={5} /></View>;
}

export function MyBookingsSkeleton() {
  return <View accessibilityLabel="Loading my bookings" style={{ gap: spacing.md }}>
    <Skeleton height={28} radius={12} width={140} />
    {Array.from({ length: 2 }, (_, index) => <Card key={index} style={{ gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={44} radius={999} width={44} />
        <View style={{ flex: 1, gap: 7 }}><Skeleton height={19} width="76%" /><Skeleton height={12} width="62%" /><Skeleton height={12} width="48%" /></View>
      </View>
      <Skeleton height={42} radius={10} />
      <Skeleton height={58} radius={10} />
      <Skeleton height={42} radius={10} />
      <Skeleton height={48} radius={12} />
    </Card>)}
  </View>;
}
