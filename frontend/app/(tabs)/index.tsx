import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Compass,
  DoorOpen,
  FileText,
  Home,
  KeyRound,
  LocateFixed,
  MapPin,
  Megaphone,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  UserPlus,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { NotificationBell } from "@/components/notification-bell";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { getGreeting } from "@/features/greeting/get-greeting";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import type { ConcernSummary } from "@/store/services/concern-api";
import { useListMyCurrentConcernsQuery } from "@/store/services/concern-api";
import { useSearchDiscoveryPropertiesQuery } from "@/store/services/discovery-api";
import type { NoticeSummary, PropertyBoardItem } from "@/store/services/notice-api";
import { useListMyPropertyBoardItemsQuery, useListMyVisibleNoticesQuery } from "@/store/services/notice-api";
import {
  useGetOwnerDashboardQuery,
  type AttentionSummary,
  type OwnerDashboard,
  type RecentActivityItem,
} from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { fetchCurrentLocation, type DeviceLocationState } from "@/store/slices/location-slice";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function HomeScreen() {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });
  const user = profileQuery.data ?? auth.user;
  const location = useAppSelector((state) => state.location);
  const isOwner = user?.role === "OWNER";
  const isActiveTenant = Boolean(user?.activeTenant);
  const manageablePropertiesQuery = useListMyPropertiesQuery(undefined, { skip: !auth.accessToken });
  const managesAny = (manageablePropertiesQuery.data ?? []).length > 0;
  const showWorkspace = isOwner || managesAny;
  const workspaceRole: "Owner" | "Manager" = isOwner ? "Owner" : "Manager";

  useEffect(() => {
    if (location.status === "idle") {
      void dispatch(fetchCurrentLocation());
    }
  }, [dispatch, location.status]);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = getDisplayFirstName(user?.fullName);
  const workspaceLabel = showWorkspace
    ? `${workspaceRole} workspace`
    : isActiveTenant
      ? "Tenant workspace"
      : "Welcome to Khatiyan";
  const subtitle = showWorkspace
    ? `Manage rooms, tenancies, billing, concerns and the property board for the properties you ${isOwner ? "own" : "manage"}.`
    : isActiveTenant
      ? "Your current property, tenancy status, board updates and notices in one quiet snapshot."
      : "Find listed PG and hostel properties near you, then move into a full tenancy workspace when your stay begins.";

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {workspaceLabel}
        </Text>
        <NotificationBell />
      </View>

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 30,
              fontWeight: "500",
              letterSpacing: -0.4,
              lineHeight: 36,
            }}
            selectable
          >
            {greeting},{" "}
            <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }} selectable>
              {firstName}.
            </Text>
          </Text>
          <Text style={[type.body, { color: colors.muted, maxWidth: 520 }]} selectable>
            {subtitle}
          </Text>
        </View>
        {user ? <WorkspaceMarker label={showWorkspace ? workspaceRole : Boolean(user.activeTenant) ? "Active tenant" : humanizeToken(user.role)} /> : null}
      </View>

      {showWorkspace ? (
        <OwnerHome onNavigate={router.push} workspaceRole={workspaceRole} />
      ) : isActiveTenant ? (
        <TenantHome onNavigate={router.push} />
      ) : (
        <NonTenantHome onNavigate={router.push} />
      )}
    </ScreenScrollView>
  );
}

function WorkspaceMarker({ label }: { label: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "flex-end",
        borderLeftColor: colors.border,
        borderLeftWidth: 1,
        gap: 2,
        paddingLeft: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]} selectable>
        Access
      </Text>
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: "800",
          textAlign: "right",
        }}
        selectable
      >
        {label}
      </Text>
    </View>
  );
}

function TenantHome({
  onNavigate,
}: {
  onNavigate: (href: "/tenancy" | "/property-board" | "/property-notices" | "/discovery" | "/concerns") => void;
}) {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const location = useAppSelector((state) => state.location);
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const activeTenancy = activeTenancyQuery.data;
  const boardQuery = useListMyPropertyBoardItemsQuery();
  const noticesQuery = useListMyVisibleNoticesQuery();
  const concernsQuery = useListMyCurrentConcernsQuery();
  const boardItemCount = boardQuery.data?.length ?? 0;
  const boardItems = (boardQuery.data ?? []).slice(0, 3);
  const noticeCount = noticesQuery.data?.length ?? 0;
  const notices = [...(noticesQuery.data ?? [])].sort(compareNoticePriority).slice(0, 3);
  const concerns = (concernsQuery.data ?? []).filter(isOpenConcern);
  const latestConcern = concerns[0];

  if (activeTenancyQuery.isFetching && !activeTenancy) {
    return (
      <Card>
        <ActivityIndicator color={colors.primary} />
        <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
          Loading your active stay
        </Text>
      </Card>
    );
  }

  if (!activeTenancy) {
    return (
      <EmptyState
        icon={Home}
        eyebrow="Tenant workspace"
        title="No active stay loaded"
        description="Your tenant dashboard appears once your active tenancy profile is available."
      />
    );
  }

  const property = activeTenancy.property;
  const room = activeTenancy.room;
  const tenancy = activeTenancy.tenancy;
  const propertyAddress = [property.address, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Card>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <IconBadge icon={Building2} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Current property
              </Text>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 24,
                  fontWeight: "500",
                  lineHeight: 29,
                }}
                selectable
              >
                {property.name}
              </Text>
            </View>
            <InfoLine icon={KeyRound} text={`Room ${room.roomNumber}${room.floor ? ` · ${formatFloor(room.floor)}` : ""}`} />
            <AddressInfoLine address={propertyAddress} />
          </View>
        </View>
      </Card>

      <CurrentLocationCard
        label="Current location"
        location={location}
        onRefresh={() => {
          void dispatch(fetchCurrentLocation());
        }}
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <MetricTile label="Stay type" value={humanizeToken(tenancy.billingType)} hint="Current tenancy" tone="primary" />
        <MetricTile label="Status" value={tenancyStatusLabel(tenancy.status)} hint={noticeHint(tenancy)} />
      </View>

      <Section eyebrow="Always-on info" title="Property board">
        {boardQuery.isFetching ? (
          <Card>
            <ActivityIndicator color={colors.primary} />
          </Card>
        ) : boardItems.length > 0 ? (
          <BoardPreviewCard
            itemCount={boardItemCount}
            items={boardItems}
            onPress={() => onNavigate("/property-board")}
          />
        ) : (
          <BoardPreviewCard itemCount={0} items={[]} />
        )}
      </Section>

      <Section eyebrow="Latest announcements" title="Notice board">
        {noticesQuery.isFetching ? (
          <Card>
            <ActivityIndicator color={colors.primary} />
          </Card>
        ) : notices.length > 0 ? (
          <NoticePreviewCard
            noticeCount={noticeCount}
            notices={notices}
            onPress={() => onNavigate("/property-notices")}
          />
        ) : (
          <NoticePreviewCard noticeCount={0} notices={[]} />
        )}
      </Section>

      <Section eyebrow="Current summary" title="Concerns">
        <Card>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              label="Open"
              value={String(concerns.length)}
              hint={concerns.length === 1 ? "Current concern" : "Current concerns"}
              tone={concerns.length > 0 ? "primary" : "default"}
            />
            <MetricTile
              label="Latest"
              value={latestConcern ? humanizeToken(latestConcern.status) : "None"}
              hint={latestConcern?.title ?? "No active concern"}
            />
          </View>
        </Card>
        {latestConcern ? (
          <SummaryRow
            icon={AlertCircle}
            kicker={`${humanizeToken(latestConcern.category)} · ${humanizeToken(latestConcern.priority)}`}
            title={latestConcern.title}
            body={latestConcern.description}
          />
        ) : null}
        <ActionCard
          meta="Concerns"
          title="Open concerns"
          description="View current concerns, history, and raise a new concern from the concerns screen."
          onPress={() => onNavigate("/concerns")}
          tone="primary"
        />
      </Section>

      <Section eyebrow="Quick actions" title="Go to">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ModuleChip icon={KeyRound} label="Tenancy" onPress={() => onNavigate("/tenancy")} />
          <ModuleChip icon={FileText} label="Notices" onPress={() => onNavigate("/property-notices")} />
          <ModuleChip icon={AlertCircle} label="Concerns" onPress={() => onNavigate("/concerns")} />
          <ModuleChip icon={Compass} label="Local places" onPress={() => onNavigate("/discovery")} />
        </View>
      </Section>
    </>
  );
}

type OwnerRoute =
  | "/owner"
  | "/owner-tenancy"
  | "/owner-billing"
  | "/owner-onboard-tenant"
  | "/owner-exit-requests"
  | "/owner-room-change-requests"
  | "/owner-property"
  | "/owner-rooms"
  | { pathname: "/owner-service-placeholder"; params: { service: string; title: string } };

// Owner/manager-side concerns are not built yet — they route to the placeholder
// screen, not the tenant-facing /concerns screen.
const OWNER_CONCERNS_ROUTE: OwnerRoute = {
  params: { service: "concerns", title: "Concern" },
  pathname: "/owner-service-placeholder",
};

function OwnerHome({ onNavigate, workspaceRole }: { onNavigate: (href: OwnerRoute) => void; workspaceRole: "Owner" | "Manager" }) {
  const { colors, type } = useTheme();
  const dispatch = useAppDispatch();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const dashboard = dashboardQuery.data;

  useEffect(() => {
    if (properties.length === 1 && selectedPropertyId !== properties[0].id) {
      dispatch(setSelectedOwnerPropertyId(properties[0].id));
      setSelectorOpen(false);
      return;
    }

    if (selectedPropertyId && !properties.some((property) => property.id === selectedPropertyId)) {
      dispatch(setSelectedOwnerPropertyId(null));
      setSelectorOpen(properties.length > 1);
      return;
    }

    if (properties.length > 1 && !selectedPropertyId) {
      setSelectorOpen(true);
    }
  }, [dispatch, properties, selectedPropertyId]);

  if (propertiesQuery.isFetching && properties.length === 0) {
    return (
      <Card>
        <ActivityIndicator color={colors.primary} />
        <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
          Loading owner workspace
        </Text>
      </Card>
    );
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        eyebrow="Owner workspace"
        title="No property yet"
        description="Create your first property from the owner workspace to unlock rooms, tenancies, billing, notices and discovery."
      />
    );
  }

  return (
    <>
      <Section eyebrow="Workspace scope" title="Property selector">
        <OwnerPropertyPicker
          open={selectorOpen}
          properties={properties}
          selectedProperty={selectedProperty}
          onSelect={(propertyId) => {
            dispatch(setSelectedOwnerPropertyId(propertyId));
            setSelectorOpen(false);
          }}
          onToggle={() => setSelectorOpen((currentValue) => !currentValue)}
        />
      </Section>

      {!selectedProperty ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Properties" value={String(properties.length)} hint="In your portfolio" tone="primary" />
          <MetricTile label="Selected" value="None" hint="Choose one above" />
        </View>
      ) : null}

      {selectedProperty && dashboardQuery.isFetching && !dashboard ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
            Loading dashboard
          </Text>
        </Card>
      ) : null}

      {dashboard ? <OwnerDashboardSections dashboard={dashboard} onNavigate={onNavigate} /> : null}

      <Section eyebrow={`${workspaceRole} actions`} title="Workspace">
        <ActionCard
          meta="Overview"
          title={`Open ${workspaceRole.toLowerCase()} workspace`}
          description="Manage tenant onboarding, active tenancies, billing, notices, concerns and discovery."
          onPress={() => onNavigate("/owner")}
          tone="primary"
        />
        <ActionCard
          meta="Tenancy"
          title="Tenancy"
          description="Create tenancies, view active stays, exit requests and room-change requests."
          onPress={() => onNavigate("/owner-tenancy")}
        />
      </Section>
    </>
  );
}

function OwnerDashboardSections({ dashboard, onNavigate }: { dashboard: OwnerDashboard; onNavigate: (href: OwnerRoute) => void }) {
  const { colors, type } = useTheme();
  const { attention, concerns, money, occupancy, today } = dashboard;
  const attentionItems = buildAttentionItems(attention);

  return (
    <>
      <Section eyebrow="Money this month" title="Collection snapshot">
        <View style={{ gap: spacing.sm }}>
          <BillingSnapshotCard money={money} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Billed" value={formatMoneyPaise(money.billedThisMonthPaise)} hint="This month" tone="primary" />
            <MetricTile label="Collected" value={formatMoneyPaise(money.collectedThisMonthPaise)} hint="Received" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Pending" value={formatMoneyPaise(money.pendingPaise)} hint="Awaiting" />
            <MetricTile
              label="Overdue"
              value={formatMoneyPaise(money.overduePaise)}
              hint={`${money.overdueCount} cycle${money.overdueCount === 1 ? "" : "s"}`}
              tone={money.overdueCount > 0 ? "danger" : "default"}
            />
          </View>
          <ActionCard
            meta="Billing"
            title="Open billing collection"
            description="Cycle list, mark paid, discounts, receipts and the monthly report."
            onPress={() => onNavigate("/owner-billing")}
          />
        </View>
      </Section>

      <Section eyebrow="Portfolio" title="Property snapshot">
        <PropertySnapshotCard occupancy={occupancy} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Active tenants" value={String(occupancy.activeTenants)} hint="Current stays" tone="primary" />
          <MetricTile label="Vacant beds" value={String(occupancy.vacantBeds)} hint={`of ${occupancy.totalBeds} beds`} tone={occupancy.vacantBeds > 0 ? "primary" : "default"} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Occupied beds" value={String(occupancy.occupiedBeds)} hint="In use" />
          <MetricTile label="Rooms" value={String(occupancy.roomCount)} hint={`${occupancy.totalBeds} beds total`} />
        </View>
        <ActionCard
          meta="Rooms"
          title="Room management"
          description="Floors, rooms, beds, rent and occupancy. Create single or in bulk."
          onPress={() => onNavigate("/owner-rooms")}
        />
      </Section>

      <Section eyebrow="Needs attention" title="Pending actions">
        {attentionItems.length === 0 ? (
          <Card tone="sunken">
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Check color={colors.successText} size={18} strokeWidth={2.4} />
              <Text style={[type.body, { color: colors.muted }]} selectable>
                All clear. Nothing needs attention right now.
              </Text>
            </View>
          </Card>
        ) : (
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 300 }}>
            <View style={{ gap: spacing.sm }}>
              {attentionItems.map((item) => (
                <AttentionRow
                  key={item.key}
                  count={item.count}
                  icon={item.icon}
                  label={item.label}
                  onPress={() => onNavigate(item.route)}
                  urgent={item.urgent}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </Section>

      <Section eyebrow="Concerns" title="Concern queue">
        <Card>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Open" value={String(concerns.open)} hint="Unresolved" tone={concerns.open > 0 ? "primary" : "default"} />
            <MetricTile label="In progress" value={String(concerns.inProgress)} hint="Being handled" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Escalated" value={String(concerns.escalated)} hint="Needs owner" tone={concerns.escalated > 0 ? "danger" : "default"} />
            <MetricTile label="Resolved" value={String(concerns.resolvedThisWeek)} hint="This week" />
          </View>
        </Card>
      </Section>

      <Section eyebrow="Today" title="Live digest">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DigestTile icon={Banknote} label="Payments" value={String(today.paymentsMadeToday)} hint={formatMoneyPaise(today.paymentsMadeTodayPaise)} highlight={today.paymentsMadeToday > 0} />
          <DigestTile icon={AlertCircle} label="Concerns" value={String(today.concernsRaisedToday)} hint="Raised today" highlight={today.concernsRaisedToday > 0} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DigestTile icon={UserPlus} label="Move-ins" value={String(today.tenanciesStartedToday)} hint="Started today" highlight={today.tenanciesStartedToday > 0} />
          <DigestTile icon={DoorOpen} label="Move-outs" value={String(today.tenanciesEndingToday)} hint="Ending today" highlight={today.tenanciesEndingToday > 0} />
        </View>
      </Section>

      <Section eyebrow="Recent activity" title="Latest events">
        {dashboard.recentActivity.length === 0 ? (
          <Card tone="sunken">
            <Text style={[type.body, { color: colors.muted }]} selectable>
              No recent activity yet. New tenancies, payments, resolved concerns and published notices will appear here.
            </Text>
          </Card>
        ) : (
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 320 }}>
            <View style={{ gap: spacing.sm }}>
              {dashboard.recentActivity.map((item, index) => (
                <ActivityRow item={item} key={`${item.type}-${item.occurredAt}-${index}`} />
              ))}
            </View>
          </ScrollView>
        )}
      </Section>

      <Section eyebrow="Quick actions" title="Do next">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ModuleChip icon={UserPlus} label="Provision tenant" onPress={() => onNavigate("/owner-onboard-tenant")} />
          <ModuleChip icon={Banknote} label="Billing" onPress={() => onNavigate("/owner-billing")} />
          <ModuleChip icon={DoorOpen} label="Exit requests" onPress={() => onNavigate("/owner-exit-requests")} />
          <ModuleChip icon={Repeat2} label="Room changes" onPress={() => onNavigate("/owner-room-change-requests")} />
          <ModuleChip icon={AlertCircle} label="Concerns" onPress={() => onNavigate(OWNER_CONCERNS_ROUTE)} />
        </View>
      </Section>
    </>
  );
}

function ActivityRow({ item }: { item: RecentActivityItem }) {
  const { colors, type } = useTheme();
  const Icon =
    item.type === "PAYMENT_RECORDED"
      ? Banknote
      : item.type === "CONCERN_RESOLVED"
        ? Check
        : item.type === "CONCERN_ESCALATED"
          ? AlertTriangle
          : item.type === "CONCERN_RAISED"
            ? AlertCircle
            : item.type === "NOTICE_PUBLISHED"
              ? Megaphone
              : KeyRound;

  return (
    <View
      style={{
        alignItems: "flex-start",
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
          backgroundColor: colors.primarySoft,
          borderRadius: 12,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        <Icon color={colors.primary} size={18} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>
          {item.title}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
          {item.subtitle}
        </Text>
      </View>
      <Text style={[type.caption, { color: colors.kicker }]} selectable>
        {formatRelativeTime(item.occurredAt)}
      </Text>
    </View>
  );
}

function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return formatDate(value);
}

type AttentionItem = {
  key: string;
  label: string;
  count: number;
  route: OwnerRoute;
  icon: ComponentType<LucideProps>;
  urgent: boolean;
};

function buildAttentionItems(attention: AttentionSummary): AttentionItem[] {
  const items: AttentionItem[] = [
    { count: attention.paymentsOverdue, icon: Banknote, key: "overdue", label: "Overdue payments", route: "/owner-billing", urgent: true },
    { count: attention.escalatedConcerns, icon: AlertTriangle, key: "escalated", label: "Escalated concerns", route: OWNER_CONCERNS_ROUTE, urgent: true },
    { count: attention.concernsUnattended24h, icon: AlertCircle, key: "unattended", label: "Concerns unattended 24h+", route: OWNER_CONCERNS_ROUTE, urgent: false },
    { count: attention.pendingExitRequests, icon: DoorOpen, key: "exits", label: "Pending exit requests", route: "/owner-exit-requests", urgent: false },
    { count: attention.pendingRoomChangeRequests, icon: Repeat2, key: "room-changes", label: "Pending room-change requests", route: "/owner-room-change-requests", urgent: false },
    { count: attention.upcomingExits, icon: DoorOpen, key: "upcoming", label: "Upcoming exits", route: "/owner-exit-requests", urgent: false },
    { count: attention.tenantsOnNotice, icon: KeyRound, key: "notice", label: "Tenants on notice", route: "/owner-tenancy", urgent: false },
  ];

  return items.filter((item) => item.count > 0);
}

function AttentionRow({
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
          backgroundColor: urgent ? "#FCE9E9" : colors.primarySoft,
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
          Tap to open
        </Text>
      </View>
      <Text style={{ color: accent, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" }} selectable>
        {count}
      </Text>
      <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function DigestTile({
  hint,
  highlight,
  icon: Icon,
  label,
  value,
}: {
  hint: string;
  highlight: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = highlight ? colors.primary : colors.muted;

  return (
    <View
      style={{
        backgroundColor: highlight ? colors.primarySoft : colors.surface,
        borderColor: highlight ? colors.primarySoft : colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Icon color={accent} size={15} strokeWidth={2.3} />
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {label}
        </Text>
      </View>
      <Text style={{ color: highlight ? colors.primary : colors.ink, fontFamily: fonts.display, fontSize: 26, fontWeight: "600", lineHeight: 30 }} selectable>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
        {hint}
      </Text>
    </View>
  );
}

function PropertySnapshotCard({ occupancy }: { occupancy: OwnerDashboard["occupancy"] }) {
  const { colors, fonts, type } = useTheme();
  const rate = occupancy.totalBeds > 0 ? Math.round((occupancy.occupiedBeds / occupancy.totalBeds) * 100) : 0;
  const tone = rate >= 90 ? colors.successText : rate >= 60 ? colors.primary : colors.danger;
  const label = rate >= 90 ? "Near full" : rate >= 60 ? "Healthy" : occupancy.totalBeds === 0 ? "No beds set up" : "Low occupancy";

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Occupancy rate
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, fontWeight: "600", letterSpacing: -0.5, lineHeight: 38 }} selectable>
            {rate}%
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} selectable>
            {occupancy.occupiedBeds} of {occupancy.totalBeds} beds occupied
          </Text>
        </View>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <Text style={[type.eyebrow, { color: tone }]} selectable>
            {label}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 10, marginTop: spacing.sm, overflow: "hidden" }}>
        <View style={{ backgroundColor: tone, borderRadius: 999, height: 10, width: `${Math.min(100, Math.max(0, rate))}%` }} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
        <SnapshotStat label="Occupied" value={String(occupancy.occupiedBeds)} />
        <SnapshotStat label="Vacant" value={String(occupancy.vacantBeds)} />
        <SnapshotStat label="Rooms" value={String(occupancy.roomCount)} />
        <SnapshotStat label="Tenants" value={String(occupancy.activeTenants)} />
      </View>
    </Card>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600" }} selectable>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
    </View>
  );
}

function BillingSnapshotCard({ money }: { money: OwnerDashboard["money"] }) {
  const { colors, fonts, type } = useTheme();
  const rate = money.billedThisMonthPaise > 0 ? Math.round((money.collectedThisMonthPaise / money.billedThisMonthPaise) * 100) : 0;
  const tone = rate >= 90 ? colors.successText : rate >= 60 ? colors.primary : colors.danger;
  const label =
    money.billedThisMonthPaise === 0 ? "Nothing billed" : rate >= 90 ? "On track" : rate >= 60 ? "Collecting" : "Behind";

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Collection rate
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, fontWeight: "600", letterSpacing: -0.5, lineHeight: 38 }} selectable>
            {rate}%
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} selectable>
            {formatMoneyPaise(money.collectedThisMonthPaise)} of {formatMoneyPaise(money.billedThisMonthPaise)} collected
          </Text>
        </View>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <Text style={[type.eyebrow, { color: tone }]} selectable>
            {label}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 10, marginTop: spacing.sm, overflow: "hidden" }}>
        <View style={{ backgroundColor: tone, borderRadius: 999, height: 10, width: `${Math.min(100, Math.max(0, rate))}%` }} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
        <SnapshotStat label="Pending" value={formatMoneyPaise(money.pendingPaise)} />
        <SnapshotStat label="Overdue" value={formatMoneyPaise(money.overduePaise)} />
        <SnapshotStat label="Overdue cycles" value={String(money.overdueCount)} />
      </View>
    </Card>
  );
}

function NonTenantHome({ onNavigate }: { onNavigate: (href: "/discovery" | "/account" | "/notifications") => void }) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const location = useAppSelector((state) => state.location);
  const propertyQuery = useSearchDiscoveryPropertiesQuery(
    {
      countryCode: location.countryCode,
      latitude: location.latitude,
      locality: location.searchHint,
      longitude: location.longitude,
      radiusKm: location.latitude && location.longitude ? 15 : null,
      size: 3,
    },
    { skip: location.status !== "ready" },
  );
  const listings = propertyQuery.data?.items ?? [];

  return (
    <>
      <CurrentLocationCard
        label="Current location"
        location={location}
        onRefresh={() => {
          void dispatch(fetchCurrentLocation());
        }}
      />

      <Section eyebrow="Discovery" title="Find your next stay">
        <ActionCard
          meta="Search"
          title="Browse properties"
          description="Search PG and hostel listings around your current or selected location."
          onPress={() => onNavigate("/discovery")}
          tone="primary"
        />
        {propertyQuery.isFetching ? (
          <Card>
            <ActivityIndicator color={colors.primary} />
          </Card>
        ) : listings.length > 0 ? (
          listings.map((property) => (
            <SummaryRow
              key={property.propertyId}
              icon={Building2}
              kicker={property.city}
              title={property.name}
              body={`${property.address} · ${property.startingRoomRentPaise ? formatMoneyPaise(property.startingRoomRentPaise) : "Rent on profile"}`}
            />
          ))
        ) : (
          <EmptyState
            icon={Search}
            eyebrow="No active stay"
            title="Start with discovery"
            description="Listed properties near your location will appear here. If nothing is nearby, open discovery and choose a city or area."
          />
        )}
      </Section>

      <Section eyebrow="Account" title="Before move-in">
        <ActionCard
          meta="Profile"
          title="Keep your account ready"
          description="When an owner provisions your tenancy, your property, notices, billing and concerns will unlock here."
          onPress={() => onNavigate("/account")}
        />
        <ActionCard
          meta="Alerts"
          title="Check notifications"
          description="Rent reminders, notices and tenancy updates start appearing once your stay begins."
          onPress={() => onNavigate("/notifications")}
        />
      </Section>

      <Section eyebrow="Workspace" title="What unlocks after tenancy">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ModuleChip icon={Building2} label="Property" />
          <ModuleChip icon={KeyRound} label="Tenancy" />
          <ModuleChip icon={FileText} label="Notices" />
          <ModuleChip icon={AlertCircle} label="Concerns" />
          <ModuleChip icon={ShieldCheck} label="Property board" />
        </View>
      </Section>
    </>
  );
}

function OwnerPropertyPicker({
  onSelect,
  onToggle,
  open,
  properties,
  selectedProperty,
}: {
  onSelect: (propertyId: string) => void;
  onToggle: () => void;
  open: boolean;
  properties: OwnerProperty[];
  selectedProperty: OwnerProperty | null;
}) {
  const { colors, fonts, type } = useTheme();
  const hasMultipleProperties = properties.length > 1;
  const selectorTitle = selectedProperty?.name ?? "Select property";
  const selectorSubtitle = selectedProperty
    ? [selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")
    : hasMultipleProperties
      ? "Choose which property this owner workspace should control."
      : "Property will be selected automatically when available.";

  return (
    <Card>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={hasMultipleProperties ? onToggle : undefined}
        style={{
          alignItems: "center",
          backgroundColor: selectedProperty ? colors.surfaceRaised : colors.primarySoft,
          borderColor: selectedProperty ? colors.border : colors.primary,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.md,
          minHeight: 72,
          padding: spacing.md,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: selectedProperty ? colors.primarySoft : colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Building2 color={colors.primary} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: selectedProperty ? colors.kicker : colors.primary }]} selectable>
            Active property
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: "500",
              lineHeight: 25,
            }}
            selectable
          >
            {selectorTitle}
          </Text>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted }]} selectable>
            {selectorSubtitle}
          </Text>
        </View>
        {hasMultipleProperties ? (
          <ChevronDown
            color={colors.primary}
            size={20}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          />
        ) : null}
      </AnimatedPressable>

      {open && hasMultipleProperties ? (
        <View style={{ gap: spacing.sm }}>
          {properties.map((property) => {
            const selected = property.id === selectedProperty?.id;

            return (
              <AnimatedPressable
                key={property.id}
                accessibilityRole="button"
                onPress={() => onSelect(property.id)}
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
                    {property.name}
                  </Text>
                  <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]} selectable>
                    {[property.city, property.state, property.pincode].filter(Boolean).join(", ")}
                  </Text>
                </View>
                {selected ? <Check color={colors.primary} size={18} strokeWidth={2.4} /> : null}
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }

  return properties.length === 1 ? properties[0] : null;
}

function CurrentLocationCard({
  label,
  location,
  onRefresh,
}: {
  label: string;
  location: DeviceLocationState;
  onRefresh: () => void;
}) {
  const { colors, type } = useTheme();
  const isLoading = location.status === "loading";
  const locationText = isLoading
    ? "Fetching location..."
    : location.displayAddress ?? location.error ?? "Location unavailable";
  const detailParts = [location.locality, location.city ?? location.district, location.country]
    .filter((part): part is string => Boolean(part && part.trim()))
    .filter((part, index, parts) => parts.indexOf(part) === index);

  return (
    <Card tone="sunken">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          <LocateFixed color={isLoading ? colors.kicker : colors.primary} size={20} strokeWidth={2.3} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            {label}
          </Text>
          <Text numberOfLines={2} style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
            {locationText}
          </Text>
          {detailParts.length > 0 && locationText !== detailParts.join(", ") ? (
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]} selectable>
              {detailParts.join(", ")}
            </Text>
          ) : null}
        </View>
        <AnimatedPressable
          accessibilityLabel="Refresh current location"
          onPress={onRefresh}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 40,
            justifyContent: "center",
            opacity: isLoading ? 0.65 : 1,
            width: 40,
          }}
        >
          <RefreshCw color={colors.primary} size={17} strokeWidth={2.3} />
        </AnimatedPressable>
      </View>
    </Card>
  );
}

function IconBadge({ icon: Icon }: { icon: ComponentType<LucideProps> }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.primarySoft,
        borderRadius: 14,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <Icon color={colors.primary} size={21} strokeWidth={2.4} />
    </View>
  );
}

function InfoLine({ icon: Icon, text }: { icon: ComponentType<LucideProps>; text: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={15} strokeWidth={2.2} />
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {text}
      </Text>
    </View>
  );
}

function AddressInfoLine({ address }: { address: string }) {
  const { colors, type } = useTheme();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const copyAddress = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);

    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }

    copiedTimer.current = setTimeout(() => {
      setCopied(false);
      copiedTimer.current = null;
    }, 3000);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <MapPin color={colors.kicker} size={15} strokeWidth={2.2} />
        <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
          {address}
        </Text>
        <AnimatedPressable
          accessibilityLabel="Copy property address"
          onPress={copyAddress}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 10,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Copy color={colors.primary} size={16} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>
      {copied ? (
        <View
          style={{
            alignSelf: "flex-end",
            backgroundColor: "#E5F5EA",
            borderColor: "#A9D7B7",
            borderRadius: 999,
            borderWidth: 1,
            paddingHorizontal: spacing.sm,
            paddingVertical: 5,
          }}
        >
          <Text style={[type.eyebrow, { color: "#1F7A3A", fontSize: 10 }]} selectable>
            Copied to clipboard
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function BoardPreviewCard({
  itemCount,
  items,
  onPress,
}: {
  itemCount: number;
  items: PropertyBoardItem[];
  onPress?: () => void;
}) {
  const { colors, type } = useTheme();
  const hasItems = items.length > 0;
  const Wrapper = hasItems && onPress ? AnimatedPressable : View;

  return (
    <Wrapper accessibilityRole={hasItems ? "button" : undefined} onPress={hasItems ? onPress : undefined}>
      <Card tone={hasItems ? "default" : "sunken"}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: hasItems ? colors.primarySoft : colors.surface,
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <ClipboardList color={hasItems ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: hasItems ? colors.primary : colors.kicker }]} selectable>
              {hasItems ? `${itemCount} board item${itemCount === 1 ? "" : "s"}` : "Property board"}
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]} selectable>
              Property board
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
              {hasItems
                ? "A quick preview of property rules, timings and shared information."
                : "Rules, timings and property information will appear here after the property team publishes them."}
            </Text>
          </View>
        </View>

        {hasItems ? (
          <View style={{ gap: spacing.sm }}>
            {items.map((item) => (
              <View
                key={item.id}
                style={{
                  borderColor: colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  gap: spacing.xs,
                  padding: spacing.md,
                }}
              >
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  {item.categoryName}
                </Text>
                <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]} selectable>
                  {item.title}
                </Text>
                <Text numberOfLines={2} style={[type.body, { color: colors.muted }]} selectable>
                  {item.body}
                </Text>
              </View>
            ))}

            <Text style={[type.eyebrow, { color: colors.primary, textAlign: "center" }]} selectable>
              Tap to expand
            </Text>
          </View>
        ) : null}
      </Card>
    </Wrapper>
  );
}

function NoticePreviewCard({
  noticeCount,
  notices,
  onPress,
}: {
  noticeCount: number;
  notices: NoticeSummary[];
  onPress?: () => void;
}) {
  const { colors, type } = useTheme();
  const hasNotices = notices.length > 0;
  const Wrapper = hasNotices && onPress ? AnimatedPressable : View;

  return (
    <Wrapper accessibilityRole={hasNotices ? "button" : undefined} onPress={hasNotices ? onPress : undefined}>
      <Card tone={hasNotices ? "default" : "sunken"}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: hasNotices ? colors.primarySoft : colors.surface,
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Megaphone color={hasNotices ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: hasNotices ? colors.primary : colors.kicker }]} selectable>
              {hasNotices ? `${noticeCount} notice${noticeCount === 1 ? "" : "s"}` : "Notice board"}
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]} selectable>
              Notice board
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
              {hasNotices
                ? "A quick preview of property announcements visible right now."
                : "Published notices for your property will appear here when they are visible to tenants."}
            </Text>
          </View>
        </View>

        {hasNotices ? (
          <View style={{ gap: spacing.sm }}>
            {notices.map((notice) => {
              const urgent = notice.priority === "URGENT" || notice.priority === "EMERGENCY";

              return (
                <View
                  key={notice.id}
                  style={{
                    borderColor: urgent ? colors.primary : colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    gap: spacing.xs,
                    padding: spacing.md,
                  }}
                >
                  <Text style={[type.eyebrow, { color: urgent ? colors.primary : colors.kicker }]} selectable>
                    {humanizeToken(notice.priority)}
                  </Text>
                  <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]} selectable>
                    {notice.title}
                  </Text>
                  <Text numberOfLines={2} style={[type.body, { color: colors.muted }]} selectable>
                    {notice.body}
                  </Text>
                </View>
              );
            })}

            <Text style={[type.eyebrow, { color: colors.primary, textAlign: "center" }]} selectable>
              Tap to expand
            </Text>
          </View>
        ) : null}
      </Card>
    </Wrapper>
  );
}

function SummaryRow({
  body,
  icon: Icon,
  kicker,
  onPress,
  title,
  urgent = false,
}: {
  body: string;
  icon: ComponentType<LucideProps>;
  kicker: string;
  onPress?: () => void;
  title: string;
  urgent?: boolean;
}) {
  const { colors, type } = useTheme();
  const Wrapper = onPress ? AnimatedPressable : View;

  return (
    <Wrapper onPress={onPress}>
      <Card tone={urgent ? "default" : "sunken"}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: urgent ? colors.primarySoft : colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Icon color={urgent ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: urgent ? colors.primary : colors.kicker }]} selectable>
            {kicker}
          </Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]} selectable>
            {title}
          </Text>
          <Text numberOfLines={2} style={[type.body, { color: colors.muted }]} selectable>
            {body}
          </Text>
        </View>
      </View>
      </Card>
    </Wrapper>
  );
}

function ModuleChip({ icon: Icon, label, onPress }: { icon: ComponentType<LucideProps>; label: string; onPress?: () => void }) {
  const { colors, type } = useTheme();
  const Wrapper = onPress ? AnimatedPressable : View;

  return (
    <Wrapper
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Icon color={colors.primary} size={14} strokeWidth={2.2} />
      <Text style={[type.eyebrow, { color: colors.inkSoft, fontSize: 10.5 }]} selectable>
        {label}
      </Text>
    </Wrapper>
  );
}

function compareNoticePriority(left: { priority: string; publishedAt: string }, right: { priority: string; publishedAt: string }) {
  const rank: Record<string, number> = {
    EMERGENCY: 4,
    URGENT: 3,
    IMPORTANT: 2,
    NORMAL: 1,
  };
  const priorityDiff = (rank[right.priority] ?? 0) - (rank[left.priority] ?? 0);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
}

function tenancyStatusLabel(status: string) {
  if (status === "ON_NOTICE") {
    return "Notice";
  }
  if (status === "ON_PREMATURE_NOTICE") {
    return "Premature";
  }

  return humanizeToken(status);
}

function noticeHint(tenancy: { plannedEndDate: string | null; status: string }) {
  if (tenancy.status === "ON_NOTICE") {
    return tenancy.plannedEndDate ? `Normal notice · ends ${formatDate(tenancy.plannedEndDate)}` : "Normal notice";
  }
  if (tenancy.status === "ON_PREMATURE_NOTICE") {
    return tenancy.plannedEndDate
      ? `Premature notice · ends ${formatDate(tenancy.plannedEndDate)}`
      : "Premature notice";
  }

  return "Normal stay";
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatMoneyPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function isOpenConcern(concern: ConcernSummary) {
  return concern.status !== "RESOLVED" && concern.status !== "CLOSED";
}

function getDisplayFirstName(fullName?: string | null) {
  const firstName = fullName?.trim().split(/\s+/)[0];
  const placeholderNames = new Set(["owner", "tenant", "user"]);

  if (!firstName || placeholderNames.has(firstName.toLowerCase())) {
    return "there";
  }

  return firstName;
}

function formatFloor(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase().startsWith("floor") ? trimmed : `Floor ${trimmed}`;
}
