import { View } from "react-native";

import { SkeletonRow } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

/** Only the API result rows; the action filters remain usable and labelled. */
export function OwnerActionCenterSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}
