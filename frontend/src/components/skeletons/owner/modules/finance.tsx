import { View } from "react-native";

import { Card } from "@/components/card";
import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner/shared";
import { OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function OwnerFinanceOverviewSkeleton({ metrics = 3 }: { metrics?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerSummaryCardSkeleton />
      <OwnerMetricGridSkeleton count={metrics} />
    </View>
  );
}

export function OwnerChartSkeleton() {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Skeleton height={12} width="38%" />
        <Skeleton height={172} radius={12} width="100%" />
        <Skeleton height={10} width="76%" />
      </View>
    </Card>
  );
}

export function OwnerBreakdownSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Skeleton height={11} width="34%" />
          <Skeleton height={16} width="28%" />
        </View>
        {Array.from({ length: rows }).map((_, index) => (
          <View key={index} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Skeleton height={10} width={index % 2 ? "42%" : "56%"} />
              <Skeleton height={10} width="24%" />
            </View>
            <Skeleton height={8} radius={999} width="100%" />
          </View>
        ))}
      </View>
    </Card>
  );
}

export function OwnerPnlHeroSkeleton() {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 104 }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={11} width="42%" />
            <Skeleton height={34} width="66%" />
            <Skeleton height={10} width="88%" />
          </View>
          <Skeleton height={92} radius={16} width={118} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={72} radius={12} width="100%" />
          <Skeleton height={72} radius={12} width="100%" />
          <Skeleton height={72} radius={12} width="100%" />
        </View>
        <Skeleton height={38} radius={12} width="100%" />
      </View>
    </Card>
  );
}

export function OwnerLedgerSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}

type FinanceAnalyticsCardKind = "tiles" | "fixed" | "hero-columns" | "hero-line" | "donut" | "budget" | "bars";

function FinanceHeroSkeleton() {
  return <Skeleton height={27} width="46%" />;
}

function FinanceTilesSkeleton({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={{ backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, gap: spacing.xs, padding: spacing.sm }}>
          <Skeleton height={11} width="40%" />
          <Skeleton height={20} width="34%" />
        </View>
      ))}
    </View>
  );
}

function FinanceColumnsSkeleton({ heights }: { heights: number[] }) {
  return (
    <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, height: 140, paddingHorizontal: spacing.md }}>
      {heights.map((height, index) => (
        <View key={index} style={{ alignItems: "center", flex: 1, gap: spacing.xs }}>
          <Skeleton height={height} radius={5} width="70%" />
          <Skeleton height={10} width="60%" />
        </View>
      ))}
    </View>
  );
}

function FinanceBarsSkeleton({ rows }: { rows: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={{ gap: spacing.xxs }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton height={10} width={`${48 - index * 6}%`} />
            <Skeleton height={10} width={52} />
          </View>
          <Skeleton height={8} width={`${100 - index * 20}%`} />
        </View>
      ))}
    </View>
  );
}

function FinanceAnalyticsCardSkeleton({ kind, line, tiles = 2 }: { kind: FinanceAnalyticsCardKind; line?: boolean; tiles?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ minHeight: 24, justifyContent: "center" }}>
        <Skeleton height={14} width="44%" />
      </View>
      {kind === "tiles" ? <FinanceTilesSkeleton count={tiles} /> : null}
      {line ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton height={12} width="30%" />
            <Skeleton height={26} radius={radii.sm} width={112} />
          </View>
          <Skeleton height={140} radius={radii.sm} />
        </View>
      ) : null}
      {kind === "fixed" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} radius={3} />
          <FinanceBarsSkeleton rows={3} />
        </View>
      ) : null}
      {kind === "hero-columns" ? (
        <View style={{ gap: spacing.sm }}>
          <FinanceHeroSkeleton />
          <FinanceColumnsSkeleton heights={[96, 70, 112, 84, 104, 76]} />
        </View>
      ) : null}
      {kind === "hero-line" ? (
        <View style={{ gap: spacing.sm }}>
          <FinanceHeroSkeleton />
          <Skeleton height={120} radius={radii.sm} />
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
      {kind === "budget" ? <FinanceColumnsSkeleton heights={[88, 104, 64]} /> : null}
      {kind === "bars" ? <FinanceBarsSkeleton rows={4} /> : null}
    </View>
  );
}

/** Mirrors Finance analytics' one live card and nine period cards without sample values. */
export function OwnerFinanceAnalyticsSkeleton({ periodTitle }: { periodTitle: string }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center" }}><Skeleton height={12} width="52%" /></View>
      <Section title="Right now">
        <FinanceAnalyticsCardSkeleton kind="tiles" />
      </Section>
      <Section title={periodTitle}>
        <FinanceAnalyticsCardSkeleton kind="hero-columns" />
        <FinanceAnalyticsCardSkeleton kind="hero-line" />
        <FinanceAnalyticsCardSkeleton kind="donut" />
        <FinanceAnalyticsCardSkeleton kind="tiles" line tiles={3} />
        <FinanceAnalyticsCardSkeleton kind="donut" />
        <FinanceAnalyticsCardSkeleton kind="fixed" />
        <FinanceAnalyticsCardSkeleton kind="budget" />
        <FinanceAnalyticsCardSkeleton kind="bars" />
        <FinanceAnalyticsCardSkeleton kind="bars" />
      </Section>
    </View>
  );
}
