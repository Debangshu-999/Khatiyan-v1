import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChartColumn } from "lucide-react-native";

import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { GhostText, SkeletonBoundary } from "@/components/skeleton-boundary";
import { OwnerBillingAnalyticsSkeleton, OwnerFinanceAnalyticsSkeleton, OwnerTenantsAnalyticsSkeleton } from "@/components/skeletons/owner";
import { useHardwareBack } from "@/components/use-hardware-back";
import { useAvailableAccounts } from "@/features/account/accounts";
import { DIVISIONS, divisionReady, isDivision, type DivisionConfig } from "@/features/analytics/divisions";
import { formatDateRange, formatMonthRange, PRESET_LABELS, periodLine, periodSectionTitle } from "@/features/analytics/period";
import { PeriodPickerSheet } from "@/features/analytics/period-picker-sheet";
import { PeriodPill } from "@/features/analytics/period-pill";
import { CARD_REGISTRY, COMPANION_KEYS } from "@/features/analytics/registry";
import type { AnalyticsResponse, MetricResult } from "@/features/analytics/types";
import { useAnalyticsPeriod } from "@/features/analytics/use-analytics-period";
import { useAppSelector } from "@/store/hooks";
import { useGetDivisionAnalyticsQuery } from "@/store/services/analytics-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One analytics division for the property selected on Home: a "Right now"
 * section, then the picked period's section. Opened from the Dashboard tab's
 * tiles.
 */
export default function OwnerAnalyticsDivisionScreen() {
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ division?: string }>();
  const division = isDivision(params.division) ? params.division : null;
  const config = division ? DIVISIONS[division] : null;
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const { period, setPeriod } = useAnalyticsPeriod();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ready = division ? divisionReady(division) : false;

  const query = useGetDivisionAnalyticsQuery(
    { division: division ?? "billing", from: period.from, period: period.preset, propertyId: property?.id ?? "", to: period.to },
    { skip: !property || !division || !ready || !period.hydrated },
  );
  const data = query.data;

  const back = useCallback(() => {
    router.back();
    return true;
  }, []);
  useHardwareBack(back);

  const pillLabel = period.preset === "CUSTOM" && period.from && period.to ? formatDateRange(period.from, period.to) : PRESET_LABELS[period.preset];

  return (
    <ScreenScrollView
      contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.xs }}
      onRefresh={
        ready
          ? async () => {
              await query.refetch();
            }
          : undefined
      }
      refreshable={ready}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      {/* Title only: no back row and no description, as the owner asked. The
          device back button still returns to the Dashboard tab. */}
      <ScreenHeader italicTail={config?.tail} title={config?.title ?? "Analytics"} />

      {!property || !config || !division ? (
        <EmptyState description="Open Home, pick a property, then choose a section on the Dashboard tab." icon={ChartColumn} title="Choose a property first" />
      ) : !ready ? (
        <EmptyState description="These analytics are coming in the next update." icon={ChartColumn} title={`${config.tileLabel} analytics are on the way`} />
      ) : (
        <>
          <View style={{ gap: spacing.xs }}>
            <PeriodPill label={pillLabel} onPress={() => setPickerOpen(true)} updating={query.isFetching && !query.isLoading} />
            {data ? <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>{periodLine(data.period)}</Text> : null}
          </View>

          {query.isLoading || !period.hydrated ? division === "billing" ? (
            <OwnerBillingAnalyticsSkeleton periodTitle={pillLabel} />
          ) : division === "finance" ? (
            <OwnerFinanceAnalyticsSkeleton periodTitle={pillLabel} />
          ) : division === "tenants" ? (
            <OwnerTenantsAnalyticsSkeleton />
          ) : (
            <SkeletonBoundary>
              <View style={{ gap: spacing.lg }}>
                <GhostText style={[type.caption, { textAlign: "center" }]}>Jul – Sep 2026 vs Apr – Jun 2026</GhostText>
                <Section title={config.now.length > 0 ? "Right now" : PRESET_LABELS[period.preset]}>
                  <ChartCard sampleSize={0} status="OK" title="Loading card">
                    <View />
                  </ChartCard>
                  <ChartCard sampleSize={0} status="OK" title="Loading card">
                    <View />
                  </ChartCard>
                </Section>
              </View>
            </SkeletonBoundary>
          ) : query.isError || !data ? (
            <EmptyState description="Pull down to try again." icon={ChartColumn} title="Couldn't load these analytics" />
          ) : (
            <DivisionSections config={config} data={data} onRetry={() => query.refetch()} />
          )}
        </>
      )}

      {pickerOpen ? (
        <PeriodPickerSheet
          current={{ from: period.from, preset: period.preset, to: period.to }}
          dataSince={data?.period.dataSince ?? null}
          onApply={(picked) => {
            setPeriod(picked);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function DivisionSections({ config, data, onRetry }: { config: DivisionConfig; data: AnalyticsResponse; onRetry: () => void }) {
  const metrics = useMemo(() => new Map<string, MetricResult>(data.metrics.map((metric) => [metric.key, metric])), [data.metrics]);
  const compareLabel = data.period.compareFrom && data.period.compareTo ? formatMonthRange(data.period.compareFrom, data.period.compareTo) : null;

  if (__DEV__) {
    for (const metric of data.metrics) {
      const companion = COMPANION_KEYS.has(metric.key);
      const placed =
        config.now.includes(metric.key) ||
        config.period.includes(metric.key) ||
        Boolean(config.groups?.some((group) => group.keys.includes(metric.key))) ||
        companion;
      if (!placed || (!companion && !CARD_REGISTRY[metric.key])) {
        console.warn(`[analytics] no card for metric "${metric.key}"`);
      }
    }
  }

  const render = (keys: string[]) =>
    keys
      .filter((key) => metrics.has(key) && CARD_REGISTRY[key])
      .map((key) => {
        const Card = CARD_REGISTRY[key];
        return <Card compareLabel={compareLabel} key={key} metric={metrics.get(key)!} metrics={metrics} onRetry={onRetry} period={data.period} />;
      });

  // A grouped division shows topic sections. A group left empty (a manager
  // without its permissions, food turned off) is not shown at all.
  if (config.groups) {
    const sections = config.groups.map((group) => ({ cards: render(group.keys), title: group.title })).filter((section) => section.cards.length > 0);
    if (sections.length === 0) {
      return <EmptyState description="Ask the property owner if you need these figures." icon={ChartColumn} title="Nothing here you can see" />;
    }
    return (
      <>
        {sections.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.cards}
          </Section>
        ))}
      </>
    );
  }

  const now = render(config.now);
  const period = render(config.period);

  if (now.length === 0 && period.length === 0) {
    return <EmptyState description="Ask the property owner if you need these figures." icon={ChartColumn} title="Nothing here you can see" />;
  }

  return (
    <>
      {now.length > 0 ? <Section title="Right now">{now}</Section> : null}
      {period.length > 0 ? <Section title={periodSectionTitle(data.period)}>{period}</Section> : null}
    </>
  );
}
