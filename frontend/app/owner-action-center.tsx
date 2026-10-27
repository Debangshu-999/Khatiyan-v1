import { useCallback, useMemo, useState } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useRouteGate } from "@/features/owner/route-gates";
import { Text, View } from "react-native";
import { AlertCircle, Check } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { FilterPillRow } from "@/components/filter-bubbles";
import { LedgerRow } from "@/components/ledger-row";
import { OwnerActionCenterSkeleton } from "@/components/skeletons/owner";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ActionButton } from "@/features/owner/owner-ui";
import { useFocusEffect } from "expo-router";
import { useAppSelector } from "@/store/hooks";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import type { ThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const ALL_CAUGHT_UP_ILLUSTRATION = require("../assets/empty-states/All-Caught-Up_512x512.png");

import { ACTION_FILTERS as FILTERS, buildActionItems, countActionItems, type ActionFilter, type ActionItem, type ActionTone } from "@/features/owner/action-center";
import { FitText } from "@/components/fit-text";

export default function OwnerActionCenterScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { dialog: routeGateDialog, gate: routeGate } = useRouteGate(selectedPropertyId);
  const dashboardQuery = useGetOwnerDashboardQuery(selectedPropertyId ?? "", {
    skip: !selectedPropertyId, refetchOnMountOrArgChange: true, refetchOnFocus: true,
    refetchOnReconnect: true, pollingInterval: 60_000, skipPollingIfUnfocused: true,
  });
  const dashboard = dashboardQuery.currentData;
  useFocusEffect(useCallback(() => {
    if (selectedPropertyId && !dashboardQuery.isUninitialized) void dashboardQuery.refetch();
  }, [selectedPropertyId, dashboardQuery.isUninitialized, dashboardQuery.refetch]));

  const actionItems = useMemo(() => (dashboard ? buildActionItems(dashboard) : []), [dashboard]);
  const [filter, setFilter] = useState<ActionFilter>("all");

  const filters = FILTERS.map((entry) => ({
    count: dashboard
      ? entry.key === "all"
        ? countActionItems(actionItems)
        : countActionItems(actionItems.filter((item) => item.source === entry.key))
      : undefined,
    label: entry.label,
    value: entry.key,
  }));
  const visibleItems = filter === "all" ? actionItems : actionItems.filter((item) => item.source === filter);
  const activeLabel = FILTERS.find((entry) => entry.key === filter)?.label ?? "All";

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} onRefresh={async () => { await dashboardQuery.refetch(); }}>
      <ScreenHeader
        title="Action"
        italicTail="center."
        subtitle="Everything that needs your attention in one continuous list. Filter by topic or scan them all."
      />

      {!selectedPropertyId ? (
        <EmptyState
          icon={Check}

          title="No property selected"
          description="Choose an active property from Home before opening the action center."
        />
      ) : null}

      {selectedPropertyId && dashboardQuery.isFetching && !dashboard ? (
        <View style={{ gap: spacing.lg }}>
          <FilterPillRow onChange={setFilter} options={filters} value={filter} />
          <OwnerActionCenterSkeleton />
        </View>
      ) : null}

      {selectedPropertyId && dashboard ? (
        <View style={{ gap: spacing.lg }}>
          <FilterPillRow onChange={setFilter} options={filters} value={filter} />

          {visibleItems.length === 0 ? (
            <EmptyState
              artwork={ALL_CAUGHT_UP_ILLUSTRATION}
              title={filter === "all" ? "You're all caught up" : `No ${activeLabel.toLowerCase()} actions`}
              description={
                filter === "all"
                  ? "Nothing pending across billing, concerns, tenancy or budget right now."
                  : `Nothing in ${activeLabel} needs attention at the moment.`
              }
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {visibleItems.map((item) => (
                // No moving red glow any more (user, 2026-10-27): the card's fill says how urgent it is.
                <ActionRow item={item} key={item.key} onPress={() => routeGate(item.route, () => router.push(item.route))} />
              ))}
            </View>
          )}
        </View>
      ) : null}
      {selectedPropertyId && dashboardQuery.isError ? (
        <EmptyState icon={AlertCircle} title="Could not refresh actions" action={
          <ActionButton label="Try again" onPress={() => void dashboardQuery.refetch()} />
        } />
      ) : null}
      {routeGateDialog}
    </ScreenScrollView>
  );
}

/**
 * The card's pale fill and its count's colour, by how urgent the item is (user, 2026-10-27). The
 * ordinary ones are pale grey, not pale blue: pale blue fills are kept off cards app-wide.
 */
function toneColors(colors: ThemeColors, tone: ActionTone) {
  if (tone === "danger") return { accent: colors.danger, soft: colors.dangerSoft };
  if (tone === "warning") return { accent: colors.warningText, soft: colors.warningSoft };
  return { accent: colors.primary, soft: colors.neutralSoft };
}


function ActionRow({ item, onPress }: { item: ActionItem; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const palette = toneColors(colors, item.tone);

  return (
    <LedgerRow
      caption={item.detail}
      fill={palette.soft}
      icon={item.icon}
      onPress={onPress}
      title={item.label}
      trailing={
        <FitText numberOfLines={1} style={{ color: palette.accent, fontFamily: fonts.display, fontSize: 16, fontVariant: ["tabular-nums"], }}>
          {item.badge}
        </FitText>
      }
    />
  );
}
