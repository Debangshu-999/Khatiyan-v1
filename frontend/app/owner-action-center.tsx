import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useRouteGate } from "@/features/owner/route-gates";
import { Animated, Easing, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, Banknote, CalendarClock, CalendarX2, Check, ChevronRight, DoorOpen, FileSignature, Gauge, HandCoins, KeyRound, MessageSquare, Repeat2, ShieldAlert, TrendingUp, Wallet, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { FilterPillRow } from "@/components/filter-bubbles";
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
  | "/owner-deposit-history"
  | "/owner-enquiries"
  | "/owner-exit-requests"
  | "/owner-expenses"
  | "/owner-room-change-requests"
  | "/owner-staff"
  | "/owner-tenancy"
  // Opens the tenancy screen with its Upcoming exits sheet already up. The
  // route gate matches on the path alone, so the param does not ungate it.
  | "/owner-tenancy?open=upcoming-exits";
type ActionSource = "billing" | "concern" | "tenancy" | "budget" | "enquiry" | "staff";
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
  { key: "enquiry", label: "Enquiries" },
  { key: "staff", label: "Staff" },
];

const TONE_RANK: Record<ActionTone, number> = { danger: 0, warning: 1, primary: 2 };

export default function OwnerActionCenterScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { dialog: routeGateDialog, gate: routeGate } = useRouteGate(selectedPropertyId);
  const dashboardQuery = useGetOwnerDashboardQuery(selectedPropertyId ?? "", { skip: !selectedPropertyId });
  const dashboard = dashboardQuery.data;

  const actionItems = useMemo(() => (dashboard ? buildActionItems(dashboard) : []), [dashboard]);
  const [filter, setFilter] = useState<ActionFilter>("all");

  const filters = FILTERS.map((entry) => ({
    count: entry.key === "all" ? actionItems.length : actionItems.filter((item) => item.source === entry.key).length,
    label: entry.label,
    value: entry.key,
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
          <FilterPillRow onChange={setFilter} options={filters} value={filter} />

          {visibleItems.length === 0 ? (
            <EmptyState
              icon={Check}
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
                  <ActionRow item={item} onPress={() => routeGate(item.route, () => router.push(item.route))} />
                </MovingBorder>
              ))}
            </View>
          )}
        </View>
      ) : null}
      {routeGateDialog}
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
    items.push({ badge: String(attention.escalatedConcerns), detail: "Needs owner attention", emphasize: true, icon: ShieldAlert, key: "escalated", label: "Escalated concerns", route: "/owner-concerns", source: "concern", tone: "danger" });
  }
  if (attention.concernsUnattended24h > 0) {
    items.push({ badge: String(attention.concernsUnattended24h), detail: "No action in over a day", emphasize: false, icon: AlertCircle, key: "unattended", label: "Concerns unattended 24h+", route: "/owner-concerns", source: "concern", tone: "warning" });
  }

  if (attention.exitsPastDue > 0) {
    items.push({ badge: String(attention.exitsPastDue), detail: "Checkout date has passed", emphasize: true, icon: CalendarX2, key: "past-due-exits", label: "Exits past due", route: "/owner-tenancy", source: "tenancy", tone: "danger" });
  }
  if (attention.pendingExitRequests > 0) {
    items.push({ badge: String(attention.pendingExitRequests), detail: "Awaiting your review", emphasize: false, icon: DoorOpen, key: "exits", label: "Pending exit requests", route: "/owner-exit-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.pendingRoomChangeRequests > 0) {
    items.push({ badge: String(attention.pendingRoomChangeRequests), detail: "Awaiting your review", emphasize: false, icon: Repeat2, key: "room-changes", label: "Pending room-change requests", route: "/owner-room-change-requests", source: "tenancy", tone: "primary" });
  }
  if (attention.upcomingExits > 0) {
    items.push({ badge: String(attention.upcomingExits), detail: "Checkout coming up soon", emphasize: false, icon: CalendarClock, key: "upcoming", label: "Upcoming exits", route: "/owner-tenancy?open=upcoming-exits", source: "tenancy", tone: "primary" });
  }
  if (attention.tenantsOnNotice > 0) {
    items.push({ badge: String(attention.tenantsOnNotice), detail: "Serving notice period", emphasize: false, icon: KeyRound, key: "notice", label: "Tenants on notice", route: "/owner-tenancy", source: "tenancy", tone: "primary" });
  }
  // A stranger asking about the property, with nobody having answered. Ranked
  // primary rather than danger: nothing is broken, but every hour it sits there
  // is a prospective tenant deciding the place is unresponsive.
  if (attention.newEnquiries > 0) {
    items.push({ badge: String(attention.newEnquiries), detail: "Awaiting your response", emphasize: false, icon: MessageSquare, key: "enquiries", label: "New enquiries", route: "/owner-enquiries", source: "enquiry", tone: "primary" });
  }

  if (attention.pendingDepositSettlements > 0) {
    items.push({ badge: String(attention.pendingDepositSettlements), detail: "Deposit awaiting settlement", emphasize: false, icon: Wallet, key: "deposit-settlements", label: "Deposits to settle", route: "/owner-deposit-history", source: "tenancy", tone: "primary" });
  }

  if (attention.salaryPaymentsDue > 0) {
    items.push({ badge: String(attention.salaryPaymentsDue), detail: "Unpaid for this month", emphasize: false, icon: HandCoins, key: "salary-due", label: "Salaries to record", route: "/owner-staff", source: "staff", tone: "warning" });
  }

  if (attention.agreementsPendingAcceptance > 0) {
    items.push({ badge: String(attention.agreementsPendingAcceptance), detail: "Waiting on the tenant", emphasize: false, icon: FileSignature, key: "agreements-pending", label: "Agreements unsigned", route: "/owner-tenancy", source: "tenancy", tone: "primary" });
  }

  // Optional-chained: a cached / pre-upgrade dashboard response has no budget.
  const budget = dashboard.budget;
  if (budget?.level === "EXCEEDED") {
    items.push({
      badge: `+${formatMoneyPaise(budget.overPaise)}`,
      detail: `${formatMoneyPaise(budget.spentPaise)} of ${formatMoneyPaise(budget.effectiveBudgetPaise)}`,
      emphasize: true,
      icon: TrendingUp,
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
      icon: Gauge,
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
        <Text numberOfLines={1} style={{ color: palette.accent, fontFamily: fonts.display, fontSize: 16, fontVariant: ["tabular-nums"], }}>
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
