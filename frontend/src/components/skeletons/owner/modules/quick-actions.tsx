import { View } from "react-native";
import { Skeleton } from "@/components/skeleton";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The same three-column square grid as the quick-action catalogue. */
export function QuickActionCategorySkeleton() {
  const { colors } = useTheme();
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: spacing.md }}>
    <Skeleton height={18} width="38%" />
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {Array.from({ length: 3 }, (_, index) => <View key={index} style={{ flex: 1, minWidth: 0, aspectRatio: 1, alignItems: "center",
        justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSunken, borderRadius: 10 }}>
        <Skeleton height={27} width={27} />
        <Skeleton height={12} width="72%" />
      </View>)}
    </View>
  </View>;
}

/** The title/search stay usable while permissions or the catalogue are prepared. */
export function QuickActionsScreenSkeleton() {
  return <View accessibilityLabel="Loading quick actions" accessibilityState={{ busy: true }} style={{ gap: spacing.lg }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: spacing.sm, overflow: "hidden" }}>
      {[50, 92, 86, 84].map((width, index) => <Skeleton key={index} height={34} width={width} radius={999} />)}
    </View>
    <QuickActionCategorySkeleton />
    <QuickActionCategorySkeleton />
  </View>;
}
