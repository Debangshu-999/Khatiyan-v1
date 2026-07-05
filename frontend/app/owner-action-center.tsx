import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Animated, Easing, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, AlertTriangle, Banknote, Check, ChevronRight, DoorOpen, KeyRound, Repeat2, Wallet, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { LedgerRow } from "@/components/ledger-row";
import { Skeleton, SkeletonRow } from "@/components/skeleton";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { BackButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { type OwnerDashboard, useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import type { ThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionRoute =
  | "/owner-billing"
  | "/owner-concerns"
  | "/owner-exit-requests"
  | "/owner-expenses"
  | "/owner-room-change-requests"
  | "/owner-tenancy";
type ActionSource = "billing" | "concern" | "tenancy" | "budget";
type ActionFilter = ActionSource | "all";
type ActionTone = "primary" | "warning" | "danger";

type ActionItem = {
  badge: string;
  detail: string;
  emphasize: boolean;
  icon: ComponentType<LucideProps>;
  key: string;
  label: string;
  route: ActionRoute;
  source: ActionSource;
  tone: ActionTone;
};

const FILTERS: Array<{ key: ActionFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "budget", label: "Budget" },
  { key: "billing", label: "Billing" },
  { key: "concern", label: "Concerns" },
  { key: "tenancy", label: "Tenancy" },
];

const TONE_RANK: Record<ActionTone, number> = { danger: 0, warning: 1, primary: 2 };

export default function OwnerActionCenterScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const dashboardQuery = useGetOwnerDashboardQuery(selectedPropertyId ?? "", { skip: !selectedPropertyId });
  const dashboard = dashboardQuery.data;

  const actionItems = useMemo(() => (dashboard ? buildActionItems(dashboard) : []), [dashboard]);
  const [filter, setFilter] = useState<ActionFilter>("all");

  const filters = FILTERS.map((entry) => ({
    ...entry,
    count: entry.key === "all" ? actionItems.length : actionItems.filter((item) => item.source === entry.key).length,
  }));
  const visibleItems = filter === "all" ? actionItems : actionItems.filter((item) => item.source === filter);
  const activeLabel = FILTERS.find((entry) => entry.key === filter)?.label ?? "All";

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Owner tool"
        title="Action"
        italicTail="center."
        subtitle="Everything that needs your attention in one continuous list. Filter by topic or scan them all."
      />

      {!selectedPropertyId ? (
        <EmptyState
          icon={Check}
          eyebrow="Property required"
          title="No property selected"
          description="Choose an active property from Home before opening the action center."
        />
      ) : null}

      {selectedPropertyId && dashboardQuery.isFetching && !dashboard ? (
        <View style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Skeleton height={32} radius={999} width={64} />
            <Skeleton height={32} radius={999} width={88} />
            <Skeleton height={32} radius={999} width={82} />
          </View>
          <View style={{ gap: spacing.sm }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </View>
      ) : null}

      {selectedPropertyId && dashboard ? (
        <View style={{ gap: spacing.lg }}>
          <FilterBar activeKey={filter} filters={filters} onSelect={setFilter} />

          {visibleItems.length === 0 ? (
            <EmptyState
              icon={Check}
              eyebrow="All clear"
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
                <MovingBorder active={item.emphasize} fill={false} key={item.key}>
                  <ActionRow item={item} onPress={() => router.push(item.route)} />
                </MovingBorder>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

function buildActionItems(dashboard: OwnerDashboard): ActionItem[] {
  const attention = dashboard.attention;
  const items: ActionItem[] = [];

  if (attention.paymentsOverdue > 0) {
    items.push({ badge: String(attention.paymentsOverdue), detail: "Awaiting collection", emphasize: true, icon: Banknote, key: "overdue", label: "Overdue payments", route: "/owner-billing", source: "billing", tone: "danger" });
  }

  if (attention.escalatedConcerns > 0) {
    items.push({ badge: String(attention.escalatedConcerns), detail: "Needs owner attention", emphasize: true, icon: AlertTriangle, key: "escalated", label: "Escalated concerns", route: "/owner-concerns", source: "concern", tone: "danger" });
  }
  if (attention.concernsUnattended24h > 0) {
    items.push({ badge: String(attention.concernsUnattended24h), detail: "No action in over a day", emphasize: false, icon: AlertCircle, key: "unattended", label: "Concerns unattended 24h+", route: "/owner-concerns", source: "concern", tone: "warning" });
  }

  if (attention.exitsPastDue > 0) {
    items.push({ badge: String(attention.exitsPastDue), detail: "Checkout date has passed", emphasize: true, icon: DoorOpen, key: "past-due-exits", label: "Exits past due", route: "/owner-tenancy", source: "tenancy", tone: "danger" });
  }
  if (attention.pendingExitRequests > 0) {
    items.push({ badge: String(attention.pendingExitRequests), detail: "Awaiting your review", emphasize: false, icon: DoorOpen, key: "exits", label: "Pending exit requests", route: "/owner-exit-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.pendingRoomChangeRequests > 0) {
    items.push({ badge: String(attention.pendingRoomChangeRequests), detail: "Awaiting your review", emphasize: false, icon: Repeat2, key: "room-changes", label: "Pending room-change requests", route: "/owner-room-change-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.upcomingExits > 0) {
    items.push({ badge: String(attention.upcomingExits), detail: "Checkout coming up soon", emphasize: false, icon: DoorOpen, key: "upcoming", label: "Upcoming exits", route: "/owner-exit-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.tenantsOnNotice > 0) {
    items.push({ badge: String(attention.tenantsOnNotice), detail: "Serving notice period", emphasize: false, icon: KeyRound, key: "notice", label: "Tenants on notice", route: "/owner-tenancy", source: "tenancy", tone: "primary" });
  }

  // Optional-chained: a cached / pre-upgrade dashboard response has no budget.
  const budget = dashboard.budget;
  if (budget?.level === "EXCEEDED") {
    items.push({
      badge: `+${formatMoneyPaise(budget.overPaise)}`,
      detail: `${formatMoneyPaise(budget.spentPaise)} of ${formatMoneyPaise(budget.effectiveBudgetPaise)}`,
      emphasize: true,
      icon: AlertTriangle,
      key: "budget-exceeded",
      label: "Budget exceeded",
      route: "/owner-expenses",
      source: "budget",
      tone: "danger",
    });
  } else if (budget?.level === "APPROACHING") {
    items.push({
      badge: `${formatMoneyPaise(budget.remainingPaise)} left`,
      detail: `${formatMoneyPaise(budget.spentPaise)} of ${formatMoneyPaise(budget.effectiveBudgetPaise)}`,
      emphasize: false,
      icon: Wallet,
      key: "budget-approaching",
      label: "Budget nearing limit",
      route: "/owner-expenses",
      source: "budget",
      tone: "warning",
    });
  }

  return items.sort((first, second) => TONE_RANK[first.tone] - TONE_RANK[second.tone]);
}

function toneColors(colors: ThemeColors, tone: ActionTone) {
  if (tone === "danger") return { accent: colors.danger, soft: colors.dangerSoft };
  if (tone === "warning") return { accent: colors.warningText, soft: colors.warningSoft };
  return { accent: colors.primary, soft: colors.primarySoft };
}

function FilterBar({
  activeKey,
  filters,
  onSelect,
}: {
  activeKey: ActionFilter;
  filters: Array<{ count: number; key: ActionFilter; label: string }>;
  onSelect: (key: ActionFilter) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {filters.map((entry) => (
        <FilterPill active={entry.key === activeKey} count={entry.count} key={entry.key} label={entry.label} onPress={() => onSelect(entry.key)} />
      ))}
    </ScrollView>
  );
}

function FilterPill({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm - 2,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }} selectable>
        {label}
      </Text>
      {count > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: active ? colors.onPrimary : colors.primary,
            borderRadius: 999,
            height: 18,
            justifyContent: "center",
            minWidth: 18,
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ color: active ? colors.primary : colors.onPrimary, fontFamily: fonts.sans, fontSize: 11, fontVariant: ["tabular-nums"], fontWeight: "900" }} selectable>
            {count}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

function ActionRow({ item, onPress }: { item: ActionItem; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const palette = toneColors(colors, item.tone);

  return (
    <LedgerRow
      caption={item.detail}
      icon={item.icon}
      iconBackground={palette.soft}
      iconColor={palette.accent}
      onPress={onPress}
      title={item.label}
      trailing={
        <Text numberOfLines={1} style={{ color: palette.accent, fontFamily: fonts.display, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "700" }} selectable>
          {item.badge}
        </Text>
      }
    />
  );
}

function MovingBorder({
  active,
  children,
  fill = true,
  radius = 14,
}: {
  active: boolean;
  children: ReactNode;
  fill?: boolean;
  radius?: number;
}) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, spin]);

  if (!active) {
    return <>{children}</>;
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={{ borderRadius: radius, flex: fill ? 1 : undefined, overflow: "hidden", padding: 2 }}>
      <Animated.View
        style={{ bottom: -120, left: -120, position: "absolute", right: -120, top: -120, transform: [{ rotate }] }}
      >
        <LinearGradient
          colors={[colors.danger, "transparent", "transparent", colors.danger]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <View style={{ borderRadius: radius - 2, flex: fill ? 1 : undefined, overflow: "hidden" }}>{children}</View>
    </View>
  );
}
