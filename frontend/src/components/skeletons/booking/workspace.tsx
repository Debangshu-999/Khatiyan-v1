import { View } from "react-native";
import { SkeletonCard, SkeletonForm, SkeletonList, SkeletonPills, SkeletonTiles } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

export function BookingWorkspaceSkeleton() {
  return <View accessibilityLabel="Loading bookings" style={{ gap: spacing.md }}><SkeletonTiles count={2} /><SkeletonTiles count={2} /><SkeletonPills count={2} /><SkeletonList rows={3} body={2} action /></View>;
}

export function BookingDetailSkeleton() {
  return <View accessibilityLabel="Loading booking details" style={{ gap: spacing.md }}><SkeletonCard /><SkeletonForm fields={3} /><SkeletonTiles count={2} /><SkeletonList rows={2} body={2} /></View>;
}
