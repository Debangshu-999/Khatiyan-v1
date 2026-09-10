import { View } from "react-native";

import { OwnerInsetListSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerBoardCategoriesSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerInsetListSkeleton rows={2} />
      <OwnerInsetListSkeleton rows={3} />
    </View>
  );
}
