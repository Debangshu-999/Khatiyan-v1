import { Text, View } from "react-native";

import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import {
  OwnerDigestCardSkeleton,
  OwnerMetricGridSkeleton,
} from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function OwnerPropertySelectorSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.kicker, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
        PROPERTY SELECTOR
      </Text>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderCurve: "continuous",
          borderRadius: 18,
          elevation: 2,
          flexDirection: "row",
          gap: spacing.md,
          minHeight: 72,
          padding: spacing.md,
          shadowColor: colors.shadow,
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: 1,
          shadowRadius: 6,
        }}
      >
        <Skeleton height={42} radius={12} width={42} />
        <View style={{ flex: 1, gap: 5 }}>
          <Skeleton height={9} width="34%" />
          <Skeleton height={18} width="62%" />
          <Skeleton height={9} width="88%" />
        </View>
      </View>
    </View>
  );
}

export function OwnerDashboardDataSkeleton() {
  const { colors, type } = useTheme();

  return (
    <Section title="Snapshots">
      <Text style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>
        Tap a snapshot to see its details
      </Text>
      <OwnerMetricGridSkeleton columns={3} count={5} square />
    </Section>
  );
}

export function OwnerLiveDigestSkeleton() {
  return (
    <Section title="Live digest">
      <OwnerMetricGridSkeleton count={4} />
      <OwnerDigestCardSkeleton />
      <OwnerDigestCardSkeleton />
      <OwnerDigestCardSkeleton />
    </Section>
  );
}
