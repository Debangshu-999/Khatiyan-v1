import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Animated, Easing, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, AlertTriangle, Banknote, Check, ChevronRight, DoorOpen, KeyRound, Repeat2, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { BackButton } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { type AttentionSummary, useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionRoute = "/owner-billing" | "/owner-concerns" | "/owner-exit-requests" | "/owner-room-change-requests" | "/owner-tenancy";
type ActionSource = "billing" | "concern" | "tenancy";

type ActionItem = {
  count: number;
  icon: ComponentType<LucideProps>;
  key: string;
  label: string;
  route: ActionRoute;
  source: ActionSource;
  urgent: boolean;
};

const ACTION_CENTER_SECTIONS: Array<{
  empty: string;
  key: ActionSource;
  title: string;
}> = [
  { empty: "No billing actions pending.", key: "billing", title: "Billing" },
  { empty: "No concern actions pending.", key: "concern", title: "Concerns" },
  { empty: "No tenancy actions pending.", key: "tenancy", title: "Tenancy" },
];

export default function OwnerActionCenterScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const dashboardQuery = useGetOwnerDashboardQuery(selectedPropertyId ?? "", { skip: !selectedPropertyId });
  const dashboard = dashboardQuery.data;
  const actionItems = dashboard ? buildActionItems(dashboard.attention) : [];

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
        eyebrow="Owner tool"
        title="Action"
        italicTail="center."
        subtitle="Pending operational work grouped by source. Each row opens the screen where the action is handled."
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
        <Card>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
            Loading actions
          </Text>
        </Card>
      ) : null}

      {selectedPropertyId && dashboard ? (
        <View style={{ gap: spacing.lg }}>
          {ACTION_CENTER_SECTIONS.map((section) => (
            <ActionCenterSourceSection
              empty={section.empty}
              items={actionItemsForSource(actionItems, section.key)}
              key={section.key}
              onNavigate={(route) => router.push(route)}
              title={section.title}
              total={actionCountForSource(actionItems, section.key)}
            />
          ))}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

function buildActionItems(attention: AttentionSummary): ActionItem[] {
  return [
    { count: attention.paymentsOverdue, icon: Banknote, key: "overdue", label: "Overdue payments", route: "/owner-billing", source: "billing", urgent: true },
    { count: attention.escalatedConcerns, icon: AlertTriangle, key: "escalated", label: "Escalated concerns", route: "/owner-concerns", source: "concern", urgent: true },
    { count: attention.concernsUnattended24h, icon: AlertCircle, key: "unattended", label: "Concerns unattended 24h+", route: "/owner-concerns", source: "concern", urgent: false },
    { count: attention.pendingExitRequests, icon: DoorOpen, key: "exits", label: "Pending exit requests", route: "/owner-exit-requests", source: "tenancy", urgent: false },
    { count: attention.pendingRoomChangeRequests, icon: Repeat2, key: "room-changes", label: "Pending room-change requests", route: "/owner-room-change-requests", source: "tenancy", urgent: false },
    { count: attention.upcomingExits, icon: DoorOpen, key: "upcoming", label: "Upcoming exits", route: "/owner-exit-requests", source: "tenancy", urgent: false },
    { count: attention.tenantsOnNotice, icon: KeyRound, key: "notice", label: "Tenants on notice", route: "/owner-tenancy", source: "tenancy", urgent: false },
  ];
}

function actionItemsForSource(items: ActionItem[], source: ActionSource) {
  return items.filter((item) => item.source === source && item.count > 0);
}

function actionCountForSource(items: ActionItem[], source: ActionSource) {
  return actionItemsForSource(items, source).reduce((total, item) => total + item.count, 0);
}

function ActionCenterSourceSection({
  empty,
  items,
  onNavigate,
  title,
  total,
}: {
  empty: string;
  items: ActionItem[];
  onNavigate: (route: ActionRoute) => void;
  title: string;
  total: number;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Section eyebrow={`${total} pending`} title={title}>
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.md,
        }}
      >
        {items.length === 0 ? (
          <Card tone="sunken">
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Check color={colors.successText} size={18} strokeWidth={2.4} />
              <Text style={[type.body, { color: colors.muted }]} selectable>
                {empty}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((item) => (
              <MovingBorder key={item.key} active={item.key === "escalated" && item.count > 0} fill={false}>
                <ActionRow
                  count={item.count}
                  icon={item.icon}
                  label={item.label}
                  onPress={() => onNavigate(item.route)}
                  urgent={item.urgent}
                />
              </MovingBorder>
            ))}
          </View>
        )}

        <Text
          style={{
            color: total > 0 ? colors.primary : colors.muted,
            fontFamily: fonts.sans,
            fontSize: 12,
            fontVariant: ["tabular-nums"],
            fontWeight: "900",
            textAlign: "right",
          }}
          selectable
        >
          {total} total
        </Text>
      </View>
    </Section>
  );
}

function ActionRow({
  count,
  icon: Icon,
  label,
  onPress,
  urgent,
}: {
  count: number;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  urgent: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = urgent ? colors.danger : colors.primary;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: urgent ? colors.dangerSoft : colors.primarySoft,
          borderRadius: 12,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Icon color={accent} size={19} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
          {label}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          Tap to open action screen
        </Text>
      </View>
      <Text style={{ color: accent, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" }} selectable>
        {count}
      </Text>
      <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
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
