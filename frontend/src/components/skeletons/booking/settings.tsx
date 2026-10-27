import { View } from "react-native";

import { SkeletonCard, SkeletonForm, SkeletonList } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

export function BookingSettingsSkeleton() {
  return (
    <View accessibilityLabel="Loading booking settings" style={{ gap: spacing.md }}>
      <SkeletonCard />
      <SkeletonForm fields={2} />
      <SkeletonForm fields={1} />
      <SkeletonCard />
    </View>
  );
}

export function BookingAccessSkeleton() {
  return <SkeletonList rows={3} />;
}
