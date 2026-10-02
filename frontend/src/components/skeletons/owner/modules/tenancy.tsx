import { View } from "react-native";

import { OwnerDataListSkeleton, OwnerFormSkeleton, OwnerMetricGridSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";
import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import { useTheme } from "@/theme/use-theme";

export function OwnerTenancySnapshotSkeleton() {
  return <OwnerMetricGridSkeleton count={4} />;
}

export function OwnerTenancyListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerDataListSkeleton actions={1} bodyLines={1} rows={rows} />;
}

export function OwnerTenancyInitialSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <OwnerTenancyOverviewSkeleton />
      <Section title="Property stays"><Skeleton height={46} /><OwnerTenancyListSkeleton /></Section>
    </View>
  );
}

/** Four summary tiles, both tool rows, then the two tenancy-rule cards. */
export function OwnerTenancyOverviewSkeleton() {
  const { colors } = useTheme();
  return <View style={{ gap: spacing.lg }}>
    <OwnerTenancySnapshotSkeleton />
    <Section title="Tenancy tools">
      {[3, 2].map((count, index) => <View key={index} style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingVertical: 16 }}>
        {Array.from({ length: count }, (_, key) => <View key={key} style={{ flex: 1, alignItems: "center", gap: 10 }}><Skeleton height={32} width={32} /><Skeleton height={12} width="68%" /></View>)}
      </View>)}
    </Section>
    <Section title="Tenancy rules">
      {[0, 1].map((key) => <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}><Skeleton width={36} height={36} /><View style={{ flex: 1, gap: 10 }}><Skeleton width="65%" height={17} /><Skeleton width="92%" height={12} /><Skeleton width="74%" height={12} /></View></View>)}
    </Section>
  </View>;
}

export function OwnerEndTenancySkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <OwnerDataListSkeleton bodyLines={1} rows={1} />
      <OwnerFormSkeleton fields={5} />
    </View>
  );
}
