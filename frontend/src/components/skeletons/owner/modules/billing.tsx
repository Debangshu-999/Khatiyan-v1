import { View } from "react-native";

import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerInsetListSkeleton, OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function OwnerBillingOverviewSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerSummaryCardSkeleton />
      <OwnerMetricGridSkeleton count={6} />
    </View>
  );
}

export function OwnerBillingCycleListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerInsetListSkeleton header={false} rows={rows} />;
}

type AnalyticsCardKind = "dues" | "ageing" | "claims" | "collections" | "donut" | "segmented" | "timeliness" | "fees";

function AnalyticsLegendSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={12} width="46%" />
          <Skeleton height={12} width="38%" />
        </View>
      ))}
    </View>
  );
}

function AnalyticsCardSkeleton({ kind }: { kind: AnalyticsCardKind }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 24 }}>
        <Skeleton height={14} width={kind === "fees" ? "55%" : "43%"} />
        {kind === "ageing" ? <Skeleton height={24} radius={radii.sm} width={96} /> : null}
      </View>
      {kind === "dues" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={27} width="48%" />
          <Skeleton height={14} radius={3} />
          <AnalyticsLegendSkeleton />
        </View>
      ) : null}
      {kind === "ageing" ? (
        <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, height: 150, paddingHorizontal: spacing.md }}>
          {[48, 74, 112, 86, 58].map((height, index) => (
            <View key={index} style={{ alignItems: "center", flex: 1, gap: spacing.xs }}>
              <Skeleton height={height} radius={5} width="70%" />
              <Skeleton height={10} width="80%" />
            </View>
          ))}
        </View>
      ) : null}
      {kind === "claims" ? <Skeleton height={16} width="74%" /> : null}
      {kind === "collections" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={27} width="50%" />
          <View style={{ gap: spacing.xs }}>
            <Skeleton height={11} width="42%" />
            <Skeleton height={9} radius={999} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Skeleton height={10} width="48%" />
              <Skeleton height={10} width="22%" />
            </View>
          </View>
        </View>
      ) : null}
      {kind === "donut" ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ height: 104, justifyContent: "center", width: 104 }}>
            <Skeleton height={104} radius={52} width={104} />
            <View style={{ backgroundColor: colors.surface, borderRadius: 38, height: 76, left: 14, position: "absolute", top: 14, width: 76 }} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            {Array.from({ length: 5 }).map((_, index) => <Skeleton height={10} key={index} width={index % 2 ? "72%" : "90%"} />)}
          </View>
        </View>
      ) : null}
      {kind === "segmented" || kind === "timeliness" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} radius={3} />
          <AnalyticsLegendSkeleton rows={2} />
        </View>
      ) : null}
      {kind === "fees" ? (
        <View style={{ gap: spacing.sm }}>
          {[0, 1].map((index) => (
            <View key={index} style={{ backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, gap: spacing.xs, padding: spacing.sm }}>
              <Skeleton height={11} width="46%" />
              <Skeleton height={20} width="34%" />
              <Skeleton height={10} width="26%" />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Mirrors Billing analytics' three live cards and six period cards without sample values. */
export function OwnerBillingAnalyticsSkeleton({ periodTitle }: { periodTitle: string }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center" }}><Skeleton height={12} width="72%" /></View>
      <Section title="Right now">
        <AnalyticsCardSkeleton kind="dues" />
        <AnalyticsCardSkeleton kind="ageing" />
        <AnalyticsCardSkeleton kind="claims" />
      </Section>
      <Section title={periodTitle}>
        <AnalyticsCardSkeleton kind="collections" />
        <AnalyticsCardSkeleton kind="donut" />
        <AnalyticsCardSkeleton kind="donut" />
        <AnalyticsCardSkeleton kind="segmented" />
        <AnalyticsCardSkeleton kind="timeliness" />
        <AnalyticsCardSkeleton kind="fees" />
      </Section>
    </View>
  );
}
