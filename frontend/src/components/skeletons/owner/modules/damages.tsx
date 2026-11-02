import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton, SkeletonHeader, SkeletonPills } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

export function DamageRecordCardSkeleton({ history = false }: { history?: boolean }) {
  return <Card>
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <Skeleton height={20} width={20} />
      <View style={{ flex: 1, gap: spacing.xs }}><Skeleton height={16} width="54%" /><Skeleton height={10} width="66%" /></View>
      <Skeleton height={20} width={34} radius={999} />
    </View>
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {[0, 1, 2].map((index) => <View key={index} style={{ flex: 1, gap: spacing.xs }}>
        <Skeleton height={10} width="50%" /><Skeleton height={14} width="80%" />
      </View>)}
    </View>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.lg }}>
      <View style={{ flex: 1, gap: spacing.xs }}><Skeleton height={10} width="32%" /><Skeleton height={24} width="54%" /></View>
      <Skeleton height={20} width={84} />
    </View>
    {history ? <>
      <View style={{ flexDirection: "row", gap: spacing.sm }}><Skeleton height={105} width={112} /><View style={{ flex: 1 }}><Skeleton height={105} /></View></View>
      <Skeleton height={50} /><Skeleton height={10} width="46%" />
    </> : <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1 }}><Skeleton height={42} /></View><View style={{ flex: 1 }}><Skeleton height={42} /></View>
    </View>}
  </Card>;
}

/** The entire initial screen, including the heading and tabs, not a blank list. */
export function OwnerDamagesScreenSkeleton({ history = false }: { history?: boolean }) {
  return <View accessibilityLabel="Loading damages and repairs" accessibilityState={{ busy: true }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: spacing.lg }}>
      <SkeletonHeader />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={38} /></View><View style={{ flex: 1 }}><Skeleton height={38} /></View>
      </View>
      {history ? null : <SkeletonPills count={2} />}
      <DamageRecordCardSkeleton history={history} /><DamageRecordCardSkeleton history={history} />
    </View>
  </View>;
}

/** Damage levels, catalogue groups and the save action in their real screen order. */
export function OwnerItemCatalogueScreenSkeleton() {
  return <View accessibilityLabel="Loading item catalogue and damages" accessibilityState={{ busy: true }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: spacing.lg }}>
      <SkeletonHeader />
      <Skeleton height={23} width="46%" />
      <Card>
        {[0, 1, 2, 3].map((index) => <Skeleton key={index} height={44} />)}
        <Skeleton height={12} width="90%" /><Skeleton height={12} width="58%" />
      </Card>
      <Skeleton height={23} width="78%" />
      <Skeleton height={12} width="94%" />
      {[0, 1].map((index) => <Card key={index}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: spacing.xs }}><Skeleton height={19} width="66%" /><Skeleton height={10} width="42%" /></View>
          <Skeleton height={32} width={58} /><Skeleton height={32} width={32} radius={999} />
        </View>
        <Skeleton height={48} /><Skeleton height={48} />
      </Card>)}
      <Skeleton height={46} />
    </View>
  </View>;
}
