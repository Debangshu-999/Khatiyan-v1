import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  BedDouble,
  BedSingle,
  Bell,
  Ban,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Compass,
  DoorClosed,
  DoorOpen,
  FileText,
  Home,
  KeyRound,
  Landmark,
  LocateFixed,
  LogOut,
  MapPin,
  Megaphone,
  Navigation,
  Pin,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  Activity,
  MessageSquare,
  Radar,
  Waves,
  Wrench,
  X,
  type LucideProps,
} from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { HeaderNote } from "@/components/header-note";
import { MarqueeText } from "@/components/marquee-text";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { TabSwitcher } from "@/components/tab-switcher";
import { Section } from "@/components/section";
import { SnapshotTile } from "@/components/snapshot-tile";
import { TrendBarChart } from "@/components/trend-bar-chart";
import { SkeletonCard, SkeletonScreen } from "@/components/skeleton";
import { api } from "@/store/api";
import { getGreeting } from "@/features/greeting/get-greeting";
import { saveActiveAccount, savePinnedOwnerModulesForUser } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import type { ConcernSummary } from "@/store/services/concern-api";
import { useListMyCurrentConcernsQuery } from "@/store/services/concern-api";
import { useSearchDiscoveryPropertiesQuery } from "@/store/services/discovery-api";
import { useGetOpenEnquiryCountQuery } from "@/store/services/enquiry-api";
import type { NoticeSummary, PropertyBoardItem } from "@/store/services/notice-api";
import {
  useListMyPropertyBoardItemsQuery,
  useListMyVisibleNoticesQuery,
  useListUpcomingNoticesQuery,
} from "@/store/services/notice-api";
import { useGetPropertyMonthSummaryQuery, type BillingMonthSummary } from "@/store/services/billing-api";
import { useGetBudgetOverviewQuery } from "@/store/services/expense-api";
import {
  useGetOwnerDashboardQuery,
  type OwnerDashboard,
  type ActivityDayBucket,
  type RecentActivityType,
  type RecentActivityItem,
} from "@/store/services/dashboard-api";
import { PnlTrendChart } from "@/features/owner/pnl-trend-chart";
import { useGetPnlStatementQuery, useGetPnlTrendQuery, type PnlStatement } from "@/store/services/pnl-api";
import { findOwnerModule } from "@/features/owner/owner-modules";
import { useScopedUnreadCount } from "@/features/notifications/alert-filters";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useRouteGate } from "@/features/owner/route-gates";
import { workingDaysInCurrentMonth } from "@/features/owner/working-days";
import { type OwnerProperty } from "@/store/services/property-api";
import { useListManagerEmploymentQuery, useListStaffCategoriesQuery, useListStaffMembersQuery } from "@/store/services/staff-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { accountLabel, useAvailableAccounts } from "@/features/account/accounts";
import { fetchCurrentLocation, type DeviceLocationState } from "@/store/slices/location-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { clearSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function HomeScreen() {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const router = useGuardedRouter();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });
  const user = profileQuery.data ?? auth.user;
  const location = useAppSelector((state) => state.location);

  const { loading: accountsLoading, managedProperties, ownedProperties } = useAvailableAccounts();
  const activeAccount = useAppSelector((state) => state.account.activeAccount);

  useEffect(() => {
    if (location.status === "idle") {
      void dispatch(fetchCurrentLocation());
    }
  }, [dispatch, location.status]);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = getDisplayFirstName(user?.fullName);

  const isManagerAccount = activeAccount === "manager";
  const isWorkspace = activeAccount === "owner" || isManagerAccount;

  // Recent activity for the header's latest-events button (deduped with the
  // dashboard query rendered inside the workspace view).
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const workspaceProperties = isManagerAccount ? managedProperties : ownedProperties;
  const selectedWorkspaceProperty = resolveSelectedProperty(workspaceProperties, selectedPropertyId);
  const headerDashboardQuery = useGetOwnerDashboardQuery(selectedWorkspaceProperty?.id ?? "", {
    skip: !isWorkspace || !selectedWorkspaceProperty,
  });
  const headerRecentActivity = headerDashboardQuery.data?.recentActivity ?? [];
  const headerAttentionCount = attentionCount(headerDashboardQuery.data);
  const awaitingPropertyChoice = isWorkspace && !selectedWorkspaceProperty;

  const subtitle = isWorkspace
    ? `Manage rooms, tenancies, billing, concerns and the property board for the properties you ${isManagerAccount ? "manage" : "own"}.`
    : activeAccount === "tenant"
      ? "Your current property, tenancy status, board updates and notices in one quiet snapshot."
      : "Find listed PG and hostel properties near you, then move into a full tenancy workspace when your stay begins.";

  const markerLabel = activeAccount
    ? activeAccount === "tenant"
      ? "Active tenant"
      : accountLabel(activeAccount)
    : accountsLoading
      ? "Checking access"
      : user
        ? humanizeToken(user.role)
        : "";

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      {/* Left column stacks the location bar and the greeting so the greeting
          hugs the location; the profile + live-events stay pinned top-right. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <HomeLocationBar location={location} onRefresh={() => void dispatch(fetchCurrentLocation())} />
          <View style={{ gap: spacing.xs }}>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 30,
                letterSpacing: -0.4,
                lineHeight: 36,
              }}
            >
              {greeting},{" "}
              <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }}>
                {firstName}.
              </Text>
            </Text>
            <HeaderNote>{subtitle}</HeaderNote>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
          {/* The profile chip that used to sit here opened a dropdown of
              Profile / Settings / Logout — all of which the Profile tab now
              holds, so the menu was a second route to one screen. The bell takes
              the slot because an alert is a glance, not a destination. */}
          {/* All three are per-property in workspace mode, so until one is
              chosen they have nothing to show and are inert. Greyed rather than
              hidden: three icons appearing the moment a property is picked reads
              as the UI changing shape, where a dimmed icon reads as "not yet". A
              tenant has no property selector, so their bell is never blocked. */}
          <HomeAlertsButton
            disabled={awaitingPropertyChoice}
            onPress={() => router.push("/notifications")}
          />
          {isWorkspace ? (
            <>
              <LatestEventsButton
                activity={headerRecentActivity}
                disabled={awaitingPropertyChoice}
                propertyName={selectedWorkspaceProperty?.name ?? null}
              />
              <HomeAttentionButton
                count={headerAttentionCount}
                disabled={awaitingPropertyChoice}
                onPress={() => router.push("/owner-action-center")}
              />
            </>
          ) : null}
        </View>
      </View>

      {accountsLoading ? (
        <SkeletonScreen />
      ) : isWorkspace ? (
        <OwnerHome
          account={isManagerAccount ? "manager" : "owner"}
          onNavigate={router.push}
          properties={isManagerAccount ? managedProperties : ownedProperties}
        />
      ) : activeAccount === "tenant" ? (
        <TenantHome onNavigate={router.push} />
      ) : (
        <NonTenantHome onNavigate={router.push} />
      )}
    </ScreenScrollView>
  );
}

// Device-location bar pinned to the top-left of every home view: a navigation
// glyph, a short place label with a chevron affordance, and the full address
// below. Tapping it re-fetches the current location.
function HomeLocationBar({ location, onRefresh }: { location: DeviceLocationState; onRefresh: () => void }) {
  const { colors, fonts, type } = useTheme();
  const busy = location.status === "loading" || location.status === "idle";

  return (
    <AnimatedPressable
      accessibilityHint="Refresh your current location"
      accessibilityLabel={`Current location: ${locationTitle(location)}`}
      accessibilityRole="button"
      onPress={onRefresh}
      style={{ alignSelf: "stretch", gap: 2 }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Navigation color={colors.primary} fill={colors.primary} size={16} strokeWidth={2} />
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 20, letterSpacing: 0 }}
        >
          {locationTitle(location)}
        </Text>
        {busy ? <ActivityIndicator color={colors.muted} size="small" /> : <RefreshCw color={colors.muted} size={14} strokeWidth={2.4} />}
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
        {locationAddress(location)}
      </Text>
    </AnimatedPressable>
  );
}

function locationTitle(location: DeviceLocationState) {
  if (location.status === "error") {
    return "Location unavailable";
  }
  const label = location.city ?? location.locality ?? location.district ?? location.state;
  if (label) {
    return label;
  }
  return location.status === "ready" ? "Current location" : "Locating...";
}

function locationAddress(location: DeviceLocationState) {
  if (location.status === "loading" || location.status === "idle") {
    return "Finding your current location...";
  }
  if (location.status === "error") {
    return location.error ?? "Tap to retry location access";
  }
  return location.displayAddress ?? "Tap to refresh your location";
}

function WorkspaceMarker({ label }: { label: string }) {
  const { colors, type } = useTheme();

  return (
    <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]}>
      {label}
    </Text>
  );
}

/**
 * Total open items the action centre groups — the badge on the header icon.
 *
 * <p>
 * Shared so the icon and the action centre itself cannot disagree: they were
 * two copies of the same sum, and a new attention type added to one would have
 * silently skipped the other. A budget at or over its limit counts as one item.
 */
function attentionCount(dashboard: OwnerDashboard | undefined): number {
  if (!dashboard) {
    return 0;
  }
  const { attention, budget } = dashboard;
  return (
    attention.paymentsOverdue +
    attention.concernsUnattended24h +
    attention.escalatedConcerns +
    attention.pendingExitRequests +
    attention.pendingRoomChangeRequests +
    attention.upcomingExits +
    attention.exitsPastDue +
    attention.tenantsOnNotice +
    // Nullish-guarded: a cached / pre-upgrade dashboard response lacks these.
    (attention.pendingDepositSettlements ?? 0) +
    (budget?.level === "APPROACHING" || budget?.level === "EXCEEDED" ? 1 : 0)
  );
}

function HomeAttentionButton({
  count,
  disabled,
  onPress,
}: {
  count: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={count > 0 ? `Action centre, ${count} pending` : "Action centre"}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={10}
      style={{ alignItems: "center", height: 32, justifyContent: "center", opacity: disabled ? 0.4 : 1, width: 32 }}
      onPress={disabled ? undefined : onPress}
    >
      <ClipboardList color={disabled ? colors.muted : colors.ink} size={23} strokeWidth={2.1} />
      {count > 0 && !disabled ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderColor: colors.surface,
            borderRadius: 999,
            borderWidth: 1.5,
            height: 16,
            justifyContent: "center",
            minWidth: 16,
            paddingHorizontal: 3,
            position: "absolute",
            right: -2,
            top: -1,
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontFamily: fonts.sansBold,
              fontSize: 10,
              fontVariant: ["tabular-nums"],
              lineHeight: 13,
            }}
          >
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

function HomeAlertsButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const auth = useAppSelector((state) => state.auth);
  const unreadCount = useScopedUnreadCount({ enabled: Boolean(auth.accessToken) });

  return (
    <AnimatedPressable
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={10}
      // No chip around it: the bordered circle sat proud of the icon and clipped
      // into the status-bar inset. The icon carries its own badge instead, with
      // hitSlop keeping the tap target honest.
      style={{
        alignItems: "center",
        height: 32,
        justifyContent: "center",
        marginTop: 6,
        opacity: disabled ? 0.4 : 1,
        width: 32,
      }}
    >
      <Bell color={disabled ? colors.muted : colors.ink} size={23} strokeWidth={2.1} />
      {/* The count, not a dot: a bare dot says "something, sometime" and cannot
          be told apart from one you already read. */}
      {unreadCount > 0 && !disabled ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderColor: colors.surface,
            borderRadius: 999,
            borderWidth: 1.5,
            height: 16,
            justifyContent: "center",
            minWidth: 16,
            paddingHorizontal: 3,
            position: "absolute",
            right: -2,
            top: -1,
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontFamily: fonts.sansBold,
              fontSize: 10,
              fontVariant: ["tabular-nums"],
              lineHeight: 13,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

// Subtle mount entrance - a soft fade + upward drift - used to give the home
// content a little life as it appears.
function FadeInUp({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { duration: 420, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// The primary "open workspace" call-to-action - a gradient hero so it reads as
// the headline action rather than just another card in the stack.
// Gradient hero CTA used for the workspace card and each dashboard snapshot's
// "open this area" link, so navigation affordances share one bold look.
function GradientCtaCard({
  description,
  icon: Icon,
  kicker,
  onPress,
  title,
}: {
  description: string;
  icon: ComponentType<LucideProps>;
  kicker: string;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDeep] as const}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          borderCurve: "continuous",
          borderRadius: 20,
          gap: spacing.sm,
          overflow: "hidden",
          padding: spacing.lg,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.18)", borderCurve: "continuous", borderRadius: 14, height: 48, justifyContent: "center", width: 48 }}>
            <Icon color={colors.onPrimary} size={24} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, opacity: 0.82, textTransform: "uppercase" }}>
              {kicker}
            </Text>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3 }}>
              {title}
            </Text>
          </View>
          <View style={{ alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.18)", borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
            <ChevronRight color={colors.onPrimary} size={19} strokeWidth={2.6} />
          </View>
        </View>
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, opacity: 0.85 }}>
          {description}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

function WorkspaceHeroCard({ onPress, role }: { onPress: () => void; role: "Owner" | "Manager" }) {
  return (
    <GradientCtaCard
      description="Onboard tenants, manage tenancies, billing, notices, concerns and discovery."
      icon={Building2}
      kicker={`${role} workspace`}
      onPress={onPress}
      title="Open workspace"
    />
  );
}

// Header button for the dashboard's latest events. Opens a modal that closes on
// an outside tap, and shows a blinking dot when a new event arrives.
function LatestEventsButton({
  activity,
  disabled,
  propertyName,
}: {
  activity: RecentActivityItem[];
  disabled?: boolean;
  // Null until a property is chosen. The feed is per-property, so without one
  // there is nothing to show — and an empty feed would wrongly read as
  // "nothing has happened" rather than "nothing is selected".
  propertyName: string | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const latestKey = activity.length ? `${activity[0].type}-${activity[0].occurredAt}` : "";
  const seenKeyRef = useRef<string | null>(null);
  const seenPropertyRef = useRef<string | null>(null);

  useEffect(() => {
    // Switching property swaps the whole feed, which looks exactly like a new
    // event arriving. Treat the incoming property's events as already seen so
    // the dot means "something happened", never "you changed property".
    if (seenPropertyRef.current !== propertyName) {
      seenPropertyRef.current = propertyName;
      seenKeyRef.current = latestKey;
      setHasNew(false);
      return;
    }

    if (seenKeyRef.current === null) {
      // First load - treat existing events as already seen so it doesn't blink.
      seenKeyRef.current = latestKey;
      return;
    }
    if (latestKey && latestKey !== seenKeyRef.current) {
      setHasNew(true);
    }
  }, [latestKey, propertyName]);

  function openModal() {
    seenKeyRef.current = latestKey;
    setHasNew(false);
    setOpen(true);
  }

  return (
    <>
      <AnimatedPressable
        accessibilityLabel="Latest events"
        accessibilityRole="button"
        onPress={disabled ? undefined : openModal}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        hitSlop={10}
        style={{
          alignItems: "center",
          height: 32,
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
          width: 32,
        }}
      >
        <Radar color={disabled ? colors.muted : colors.ink} size={23} strokeWidth={2.1} />
        {hasNew && !disabled ? <BlinkingDot /> : null}
      </AnimatedPressable>
      {open ? (
        <LatestEventsModal activity={activity} onClose={() => setOpen(false)} propertyName={propertyName} />
      ) : null}
    </>
  );
}

function BlinkingDot() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        backgroundColor: colors.danger,
        borderColor: colors.surface,
        borderRadius: 999,
        borderWidth: 1.5,
        height: 11,
        opacity: pulse,
        position: "absolute",
        right: 5,
        top: 5,
        width: 11,
      }}
    />
  );
}

const ACTIVITY_BUCKET_LABEL: Record<ActivityDayBucket, string> = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  EARLIER_THIS_WEEK: "Earlier this week",
};

// The feed is a rolling 7-day window, so these three cover everything that can
// arrive. All three always render — an empty day is information too.
const ACTIVITY_BUCKET_ORDER: ActivityDayBucket[] = ["TODAY", "YESTERDAY", "EARLIER_THIS_WEEK"];

/** Shared floor for an open-but-empty day, so every one is the same size. */
const EMPTY_DAY_MIN_HEIGHT = 140;

const ACTIVITY_BUCKET_EMPTY: Record<ActivityDayBucket, string> = {
  TODAY: "Nothing so far today.",
  YESTERDAY: "Nothing happened yesterday.",
  EARLIER_THIS_WEEK: "Nothing earlier this week.",
};

// Filter categories. Grouped by the part of the business an owner thinks in,
// not by the enum's spelling — "did something happen with my tenants" rather
// than "was it TENANCY_STARTED or TENANCY_ROOM_CHANGED".
type ActivityCategory = "all" | "tenancy" | "billing" | "concern" | "notice" | "room" | "staff";

const ACTIVITY_CATEGORY: Record<RecentActivityType, Exclude<ActivityCategory, "all">> = {
  TENANCY_STARTED: "tenancy",
  TENANCY_ENDED: "tenancy",
  TENANCY_ROOM_CHANGED: "tenancy",
  TENANCY_EXIT_REQUESTED: "tenancy",
  PAYMENT_RECORDED: "billing",
  CONCERN_RAISED: "concern",
  CONCERN_ASSIGNED: "concern",
  CONCERN_TAKEN_UP: "concern",
  CONCERN_ESCALATED: "concern",
  CONCERN_RESOLVED: "concern",
  NOTICE_PUBLISHED: "notice",
  ROOM_MAINTENANCE_STARTED: "room",
  ROOM_MAINTENANCE_ENDED: "room",
  ROOM_DEACTIVATED: "room",
  ROOM_REACTIVATED: "room",
  STAFF_ADDED: "staff",
  STAFF_REMOVED: "staff",
  MANAGER_ADDED: "staff",
  MANAGER_REMOVED: "staff",
};

const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  all: "All",
  tenancy: "Tenancy",
  billing: "Billing",
  concern: "Concerns",
  notice: "Notices",
  room: "Rooms",
  staff: "Staff",
};

const ACTIVITY_CATEGORY_ORDER: ActivityCategory[] = ["all", "tenancy", "billing", "concern", "notice", "room", "staff"];

function activityCategoryOf(item: RecentActivityItem): Exclude<ActivityCategory, "all"> {
  // Falls back rather than crashing if the server adds a type this build has
  // never heard of.
  return ACTIVITY_CATEGORY[item.type] ?? "tenancy";
}

// Every bucket, always, empty or not — the sections are the structure of the
// screen rather than a consequence of the data.
function groupActivityByDay(activity: RecentActivityItem[]): { bucket: ActivityDayBucket; items: RecentActivityItem[] }[] {
  return ACTIVITY_BUCKET_ORDER.map((bucket) => ({
    bucket,
    // Falls back rather than dropping a row if an older server build omits the
    // bucket entirely.
    items: activity.filter((item) => (item.dayBucket ?? "EARLIER_THIS_WEEK") === bucket),
  }));
}

function LatestEventsModal({
  activity,
  onClose,
  propertyName,
}: {
  activity: RecentActivityItem[];
  onClose: () => void;
  propertyName: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<ActivityCategory>("all");
  // Today opens, the rest stay shut. Three expanded headings with two of them
  // empty was most of what the sheet showed; the counts alone answer "did
  // anything happen yesterday" without spending the space.
  const [openBuckets, setOpenBuckets] = useState<ActivityDayBucket[]>(["TODAY"]);


  function toggleBucket(bucket: ActivityDayBucket) {
    setOpenBuckets((current) =>
      current.includes(bucket) ? current.filter((entry) => entry !== bucket) : [...current, bucket],
    );
  }

  const visible = useMemo(
    () => (category === "all" ? activity : activity.filter((item) => activityCategoryOf(item) === category)),
    [activity, category],
  );
  const groups = useMemo(() => groupActivityByDay(visible), [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        {/* Full screen width, edge to edge: this is a feed, and side gutters
            cost it room without making it easier to read. */}
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            // Fixed, not min/max: a sheet that grows as sections expand jumps
            // under the thumb. It holds its size and the list scrolls instead.
            height: "85%",
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          {/* Grab handle so the sheet reads as something you pull, not a dialog. */}
          <View style={{ alignItems: "center", paddingBottom: spacing.xs, paddingTop: spacing.sm }}>
            <View style={{ backgroundColor: colors.borderStrong, borderRadius: 999, height: 4, width: 38 }} />
          </View>

          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "space-between",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              {/* Names the property, because the feed only ever covers one and a
                  reader with several needs to know which they are looking at.
                  Allowed to wrap rather than truncate — a half-shown property
                  name is worse than a two-line eyebrow. */}
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {propertyName ? `Activity in ${propertyName}` : "Activity"}
              </Text>
              <Text
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, lineHeight: 29 }}
              >
                Latest events
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close latest events"
              accessibilityRole="button"
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 999,
                borderWidth: 1,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <X color={colors.ink} size={18} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>

          {!propertyName ? (
            <ActivityNoPropertyState />
          ) : (
          <>
          {/* Always present, including on an empty feed: the chips tell the owner
              what this screen will eventually carry. */}
          {/* flexShrink:0 is the fix — flexGrow:0 alone stopped it expanding but
              left it shrinkable, so the column compressed the strip and clipped
              the chips' descenders. */}
          <ScrollView
            contentContainerStyle={{ alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
          >
            {ACTIVITY_CATEGORY_ORDER.map((item) => (
              <ActivityFilterChip
                active={category === item}
                count={item === "all" ? activity.length : activity.filter((row) => activityCategoryOf(row) === item).length}
                key={item}
                label={ACTIVITY_CATEGORY_LABEL[item]}
                onPress={() => setCategory(item)}
              />
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={{
              // flexGrow lets the spacer below actually push: without it the
              // container hugs its content and there is nothing to push into.
              flexGrow: 1,
              paddingBottom: spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* One flat stack, no wrapper. The leftover height belongs to
                whichever section is OPEN and EMPTY — that section's placeholder
                flexes and everything after it lands at the foot. When nothing is
                open, nothing flexes and all three sit flush together, which is
                what a wrapper keyed on "does Today have items" got wrong: it
                opened a gap under a collapsed Today. */}
            {groups.map((group, index) => (
              <ActivityDaySection
                bucket={group.bucket}
                first={index === 0}
                items={group.items}
                key={group.bucket}
                onToggle={() => toggleBucket(group.bucket)}
                open={openBuckets.includes(group.bucket)}
              />
            ))}

          </ScrollView>

          <ActivityEmptyHint />
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * One day, collapsed to a header until asked for.
 *
 * <p>The count sits on the right and is the whole answer most of the time —
 * there is no dashed "nothing happened" box any more, because a box saying
 * nothing happened takes as much room as something happening.
 */
function ActivityDaySection({
  bucket,
  first,
  items,
  onToggle,
  open,
}: {
  bucket: ActivityDayBucket;
  /** Only the first box draws a top border, so stacked edges stay 1px. */
  first: boolean;
  items: RecentActivityItem[];
  onToggle: () => void;
  open: boolean;
}) {
  const { colors, type } = useTheme();

  return (
    // Every OPEN section grows; collapsed ones keep their header height and get
    // pushed down. flexGrow rather than flex: `flex: 1` sets flexBasis to 0,
    // which discards content height and would squeeze a long section into the
    // same share as a short one. flexGrow keeps each section's natural height
    // and splits only the SURPLUS, equally — the same rule whether a section is
    // empty or holding rows.
    <View style={open ? { flexGrow: 1 } : undefined}>
      {/* A box, not a rule-and-label. The left edge carries the signal: a bold
          ink rail when the day has something in it, a hairline when it does not,
          so a glance down the sheet shows which days are worth opening. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderLeftColor: items.length ? colors.ink : colors.border,
          borderLeftWidth: items.length ? 4 : 1,
          borderTopWidth: first ? 1 : 0,
          borderBottomWidth: 1,
          borderRightWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          // Clipped so the wash below stays inside the header's edges.
          overflow: "hidden",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        {/* The item cards below are flat white. A surfaceSunken-to-surface ramp
            was invisible against them, so this starts at borderStrong — a real
            grey — and lightens across. The header reads as the seam between
            days rather than as one more row in the list. */}
        <LinearGradient
          colors={[colors.borderStrong, colors.surfaceSunken]}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
        <Text style={[type.eyebrow, { color: items.length ? colors.ink : colors.kicker, flex: 1 }]}>
          {ACTIVITY_BUCKET_LABEL[bucket]}
        </Text>
        <Text style={[type.caption, { color: items.length ? colors.ink : colors.kicker, fontWeight: "700" }]}>
          {items.length}
        </Text>
        {open ? (
          <ChevronDown color={colors.muted} size={17} strokeWidth={2.4} />
        ) : (
          <ChevronRight color={colors.muted} size={17} strokeWidth={2.4} />
        )}
      </Pressable>

      {open ? (
        items.length ? (
          // Padding on BOTH sides: with every section open, the last card of one
          // day sat flush against the next day's header, so the two read as one
          // block. The gap is what separates a section's contents from the seam
          // that follows it.
          <View style={{ gap: spacing.sm, paddingBottom: spacing.md, paddingTop: spacing.sm }}>
            {items.map((item, index) => (
              <ActivityRow item={item} key={`${item.type}-${item.occurredAt}-${index}`} />
            ))}
          </View>
        ) : (
          // Centred in the space the list would have filled, so an open-but-empty
          // day reads as calm rather than broken.
          // Every empty day gets the same floor, so Today and Yesterday do not
          // read as different-sized holes when both are empty. Today additionally
          // flexes, which only widens the gap it already owns — the text stays
          // centred in whatever that gap turns out to be.
          <View style={{ flexGrow: 1, justifyContent: "center", minHeight: EMPTY_DAY_MIN_HEIGHT }}>
            <View style={{ alignItems: "center" }}>
              <Text style={[type.body, { color: colors.muted }]}>Nothing so far</Text>
            </View>
          </View>
        )
      ) : null}
    </View>
  );
}

function ActivityFilterChip({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      tapLockMs={0}
      style={{
        backgroundColor: active ? colors.ink : "transparent",
        borderColor: active ? colors.ink : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {/* Explicit lineHeight and no font padding: Inter sits taller than the
          system face this chip was measured against, and without both the
          descenders clip against the 7px vertical padding. The Bold FILE gives
          the weight — fontWeight on the Regular file makes Android synthesise
          its own bold on top. */}
      <Text
        style={{
          color: active ? colors.surface : count === 0 ? colors.kicker : colors.inkSoft,
          fontFamily: fonts.sansBold,
          fontSize: 12.5,
          includeFontPadding: false,
          lineHeight: 17,
        }}
      >
        {count > 0 ? `${label} · ${count}` : label}
      </Text>
    </AnimatedPressable>
  );
}

// Distinct from an empty feed on purpose. "No property selected" and "nothing
// has happened at this property" look identical if both render an empty list,
// and only one of them is the owner's problem to fix.
function ActivityNoPropertyState() {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 62,
          justifyContent: "center",
          width: 62,
        }}
      >
        <Building2 color={colors.kicker} size={26} strokeWidth={2} />
      </View>
      <Text
        style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
      >
        Choose a property first
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 19, textAlign: "center" }]}>
        Activity is tracked per property. Pick the active property on Home and its last 7 days of events will appear
        here.
      </Text>
    </View>
  );
}

// Shown under the (empty) day sections rather than replacing them, so the shape
// of the screen stays the same whether or not anything has happened. Not
// apologetic: starting empty is the design, so it says what will arrive.
function ActivityEmptyHint() {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
      <Waves color={colors.kicker} size={22} strokeWidth={2} />
      <Text style={[type.caption, { color: colors.muted, lineHeight: 19, textAlign: "center" }]}>
        Property events for last 7 days will appear here
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
      <SkeletonScreen />
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
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Current property
              </Text>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 24,
                  lineHeight: 29,
                }}
              >
                {property.name}
              </Text>
            </View>
            <InfoLine icon={KeyRound} text={`Room ${room.roomNumber}${room.floor ? `  /  ${formatFloor(room.floor)}` : ""}`} />
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
          <SkeletonCard />
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
          <SkeletonCard />
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
            kicker={humanizeToken(latestConcern.category)}
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
  | "/owner-action-center"
  | "/owner-billing"
  | "/owner-deposit-manager"
  | "/owner-onboard-tenant"
  | "/owner-exit-requests"
  | "/owner-room-change-requests"
  | "/owner-property"
  | "/owner-rooms"
  | "/owner-notices"
  | "/owner-upcoming-notices"
  | "/owner-concerns"
  | "/owner-vacancy-finder"
  | "/owner-staff"
  | "/owner-expenses"
  | "/owner-enquiries"
  | "/owner-pnl";

/**
 * The Enquiries tool, split out only so it can carry its own unanswered count.
 *
 * <p>Every other badge on this screen rides in on the dashboard's `attention`
 * payload. Enquiries do not, and adding them there would mean a dashboard
 * change for one number — so it asks for its own, which is a cached call the
 * enquiries screen shares.
 */
function EnquiriesToolBox({
  onNavigate,
  propertyId,
}: {
  onNavigate: (route: OwnerRoute) => void;
  propertyId: string | null;
}) {
  const openCountQuery = useGetOpenEnquiryCountQuery(propertyId ?? "", { skip: !propertyId });

  return (
    <HomeToolBox
      badge={openCountQuery.data ?? 0}
      icon={MessageSquare}
      label="Enquiries"
      onPress={() => onNavigate("/owner-enquiries")}
    />
  );
}

const OWNER_CONCERNS_ROUTE: OwnerRoute = "/owner-concerns";


type OwnerTab = "workspace" | "dashboard";

/**
 * Faded ground for the property selector card.
 *
 * <p>Bundled rather than hotlinked: the home screen should not need a
 * third-party host to finish drawing itself, and a bundled file cannot be
 * pulled, rate-limited or blocked for hotlinking later.
 *
 * <p>A photograph rather than line work, chosen for legibility. Drawn art at
 * this scale puts strokes and window grids at roughly x-height, which fights
 * the address line sitting on top of it; a photograph reads as a soft tone.
 *
 * <p>An aerial of a neighbourhood rather than a facade, chosen for the crop.
 * The card is about 4:1, so it can only ever show a 4:1 strip — and a strip
 * that wide cut from a portrait facade shot is roughly one balcony, which
 * reads as an unrecognisable smear however it is positioned. Here the
 * buildings are small in frame and the source is already 16:9, so the same
 * strip holds dozens of whole roofs and still looks like housing.
 *
 * <p>Pexels licence — free for commercial use, no attribution required.
 * https://www.pexels.com/photo/aerial-view-of-urban-residential-complex-30353894/
 */
const PROPERTY_CARD_ART = require("../../assets/workspace/property-card.jpg");

function OwnerHome({
  account,
  onNavigate,
  properties,
}: {
  account: "owner" | "manager";
  onNavigate: (href: OwnerRoute) => void;
  properties: OwnerProperty[];
}) {
  const { colors, type } = useTheme();
  const dispatch = useAppDispatch();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const pinnedKeys = useAppSelector((state) => state.ownerPins.pinnedKeys);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tab, setTab] = useState<OwnerTab>("workspace");
  const workspaceRole: "Owner" | "Manager" = account === "manager" ? "Manager" : "Owner";
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const routeGate = useRouteGate(selectedProperty?.id);
  const navigate = useCallback(
    (href: OwnerRoute) => {
      if (typeof href !== "string") {
        onNavigate(href);
        return;
      }
      routeGate(href, () => onNavigate(href));
    },
    [onNavigate, routeGate],
  );
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !selectedProperty,
  });
  const dashboard = dashboardQuery.data;
  const monthSummaryQuery = useGetPropertyMonthSummaryQuery(
    { propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

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

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        eyebrow={`${workspaceRole} workspace`}
        title={account === "manager" ? "No assigned properties" : "No property yet"}
        description={
          account === "manager"
            ? "Properties appear here once an owner assigns you as a manager."
            : "Create your first property from the owner workspace to unlock rooms, tenancies, billing, notices and discovery."
        }
      />
    );
  }

  return (
    <FadeInUp style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {account === "manager" ? (properties.length > 1 ? "Managed properties" : "Managed property") : "Property selector"}
        </Text>
        <OwnerPropertyPicker
          open={selectorOpen}
          properties={properties}
          selectedProperty={selectedProperty}
          workspaceRole={workspaceRole}
          onSelect={(propertyId) => {
            dispatch(setSelectedOwnerPropertyId(propertyId));
            setSelectorOpen(false);
          }}
          onToggle={() => setSelectorOpen((currentValue) => !currentValue)}
        />
      </View>

      {!selectedProperty ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Properties" value={String(properties.length)} hint="In your portfolio" tone="primary" />
          <MetricTile label="Selected" value="None" hint="Choose one above" />
        </View>
      ) : null}

      {/* Opening the selector puts the screen back into the state it loads in
          with nothing chosen: the picker and nothing under it. The workspace
          below belongs to the property being replaced, so leaving it on screen
          while the list is open means scrolling past a whole dashboard for the
          property you are in the middle of switching away from. */}
      {selectedProperty && !selectorOpen && dashboardQuery.isFetching && !dashboard ? (
        <SkeletonCard />
      ) : null}

      {selectedProperty && !selectorOpen && dashboard ? (
        <>
          <OwnerTabBar onChange={setTab} tab={tab} />
          {tab === "dashboard" ? (
            <DashboardTab dashboard={dashboard} monthSummary={monthSummaryQuery.data} onNavigate={navigate} />
          ) : (
            <WorkspaceTab dashboard={dashboard} onNavigate={navigate} pinnedKeys={pinnedKeys} workspaceRole={workspaceRole} />
          )}
        </>
      ) : null}
    </FadeInUp>
  );
}

type SnapshotKey = "collection" | "property" | "tenancy" | "cycle" | "pnl";

function OwnerTabBar({ onChange, tab }: { onChange: (tab: OwnerTab) => void; tab: OwnerTab }) {
  return (
    <TabSwitcher
      active={tab}
      onChange={onChange}
      options={[
        { label: "Workspace", value: "workspace" },
        { label: "Dashboard", value: "dashboard" },
      ]}
    />
  );
}


const SNAPSHOT_META: Record<SnapshotKey, { eyebrow: string; title: string }> = {
  collection: { eyebrow: "Money this month", title: "Collection snapshot" },
  property: { eyebrow: "Portfolio", title: "Property snapshot" },
  tenancy: { eyebrow: "Tenancy", title: "Tenancy snapshot" },
  cycle: { eyebrow: "Billing cycles", title: "Billing snapshot" },
  pnl: { eyebrow: "Profit & loss", title: "P&L snapshot" },
};

function DashboardTab({ dashboard, monthSummary, onNavigate }: { dashboard: OwnerDashboard; monthSummary?: BillingMonthSummary; onNavigate: (href: OwnerRoute) => void }) {
  const { money, occupancy, tenancy } = dashboard;
  const [openSnapshot, setOpenSnapshot] = useState<SnapshotKey | null>(null);
  const toggle = (key: SnapshotKey) => setOpenSnapshot((current) => (current === key ? null : key));

  const pnlPropertyId = dashboard.property.propertyId;
  const pnlStatement = useGetPnlStatementQuery(
    { month: istMonthStart(), propertyId: pnlPropertyId },
    { skip: !pnlPropertyId },
  ).data;

  return (
    <>
      <Section eyebrow="Dashboard" title="Snapshots">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {/* Collected OVER billed, like the Property box's occupied/total. On its
              own the collected figure reads as ₹0 for most of the month — true,
              but it hides whether that is nothing owed or nothing paid yet. */}
          <DashboardSnapshotBox
            active={openSnapshot === "collection"}
            icon={Banknote}
            label="Collection"
            onPress={() => toggle("collection")}
            tone="primary"
            value={`${compactMoneyPaise(money.collectedThisMonthPaise)}/${compactMoneyPaise(money.billedThisMonthPaise).replace("₹", "")}`}
          />
          <DashboardSnapshotBox active={openSnapshot === "property"} icon={DoorOpen} label="Property" onPress={() => toggle("property")} tone="primary" value={`${occupancy.occupiedBeds}/${occupancy.totalBeds}`} />
          <DashboardSnapshotBox active={openSnapshot === "tenancy"} icon={Users} label="Tenancy" onPress={() => toggle("tenancy")} tone="primary" value={String(tenancy.activeTenants)} />
          <DashboardSnapshotBox active={openSnapshot === "cycle"} icon={ClipboardList} label="Cycles" onPress={() => toggle("cycle")} tone={monthSummary && monthSummary.overdueCount > 0 ? "danger" : "primary"} value={monthSummary ? String(monthSummary.rentCycleCount) : "-"} />
          <DashboardSnapshotBox active={openSnapshot === "pnl"} icon={Receipt} label="P&L" onPress={() => toggle("pnl")} tone={pnlStatement && pnlStatement.netPaise < 0 ? "danger" : "primary"} value={pnlStatement ? signedCompactPaise(pnlStatement.netPaise) : "-"} />
        </View>
      </Section>

      {openSnapshot ? (
        <SnapshotDetail dashboard={dashboard} key={openSnapshot} monthSummary={monthSummary} onNavigate={onNavigate} pnlStatement={pnlStatement} snapshot={openSnapshot} />
      ) : null}
    </>
  );
}

function DashboardSnapshotBox({
  active,
  icon: Icon,
  label,
  onPress,
  tone = "default",
  value,
}: {
  active?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger" | "primary";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "danger" ? colors.danger : colors.primary;
  const accentSoft = tone === "danger" ? colors.dangerSoft : colors.primarySoft;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        aspectRatio: 1,
        backgroundColor: active ? accentSoft : colors.surface,
        borderColor: active ? accent : colors.border,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: active ? 1.5 : 1,
        flexBasis: "30%",
        flexGrow: 1,
        gap: spacing.xs,
        justifyContent: "center",
        maxWidth: "32%",
        minHeight: 104,
        padding: spacing.sm,
      }}
    >
      <Icon color={accent} size={24} strokeWidth={2.2} />
      {/* Shrinks rather than truncates: these are money figures, and a ratio like
          ₹1.2L/5.1L is far wider than the 3/11 these tiles were sized for.
          Half a rupee value is worse than a slightly smaller one. */}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ color: tone === "danger" ? colors.danger : colors.ink, fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"], letterSpacing: -0.3 }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.muted, fontSize: 11, textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// The detail for the selected dashboard snapshot, shown inline under the boxes
// (toggled by its box). Full summary cards, metric tiles and trend graphs.
function SnapshotDetail({
  dashboard,
  monthSummary,
  onNavigate,
  pnlStatement,
  snapshot,
}: {
  dashboard: OwnerDashboard;
  monthSummary?: BillingMonthSummary;
  onNavigate: (href: OwnerRoute) => void;
  pnlStatement?: PnlStatement;
  snapshot: SnapshotKey;
}) {
  const { colors, type } = useTheme();
  const { money, monthlyTrends, occupancy, tenancy } = dashboard;
  // Collection chart compares money collected per month against a dynamic
  // rupee ceiling (see TrendBarChart "money" mode), not a 0..100% rate.
  const collectionMoneyTrend = monthlyTrends.map((point) => ({ label: point.label, value: Math.round(point.collectedPaise / 100) }));
  const occupancyTrend = monthlyTrends.map((point) => ({ label: point.label, value: point.occupancyRate }));
  const meta = SNAPSHOT_META[snapshot];

  return (
    <FadeInUp>
      <Section eyebrow={meta.eyebrow} title={meta.title}>
        <View style={{ gap: spacing.sm }}>
            {snapshot === "collection" ? (
              <>
                <BillingSnapshotCard money={money} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={Receipt} label="Billed" value={formatMoneyPaise(money.billedThisMonthPaise)} tone="primary" delta={{ current: money.billedThisMonthPaise, previous: money.billedPrevMonthPaise }} />
                  <SnapshotTile icon={Banknote} label="Collected" value={formatMoneyPaise(money.collectedThisMonthPaise)} delta={money.collectedThisMonthPaise > 0 ? { current: money.collectedThisMonthPaise, previous: money.collectedPrevMonthPaise } : undefined} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={Clock} label="Pending" value={formatMoneyPaise(money.pendingPaise)} />
                  <SnapshotTile icon={AlertTriangle} label="Overdue" value={formatMoneyPaise(money.overduePaise)} tone={money.overdueCount > 0 ? "danger" : "default"} />
                </View>
                <TrendBarChart data={collectionMoneyTrend} mode="money" title="Collected" />
                <GradientCtaCard icon={Banknote} kicker="Billing" title="Open billing collection" description="Cycle list, mark paid, discounts, receipts and the monthly report." onPress={() => onNavigate("/owner-billing")} />
              </>
            ) : null}

            {snapshot === "property" ? (
              <>
                <PropertySnapshotCard occupancy={occupancy} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={DoorOpen} label="Rooms" value={String(occupancy.roomCount)} tone="primary" />
                  <SnapshotTile icon={DoorClosed} label="Room unavailable" count={occupancy.unavailableRooms} total={occupancy.roomCount} tone={occupancy.unavailableRooms > 0 ? "danger" : "default"} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={BedDouble} label="Occupied beds" count={occupancy.occupiedBeds} total={occupancy.totalBeds} />
                  <SnapshotTile icon={BedSingle} label="Vacant beds" count={occupancy.vacantBeds} total={occupancy.totalBeds} tone={occupancy.vacantBeds > 0 ? "primary" : "default"} />
                </View>
                <TrendBarChart data={occupancyTrend} title="Occupancy rate" />
                <GradientCtaCard icon={DoorOpen} kicker="Rooms" title="Room management" description="Floors, rooms, beds, rent and occupancy. Create single or in bulk." onPress={() => onNavigate("/owner-rooms")} />
              </>
            ) : null}

            {snapshot === "tenancy" ? (
              <>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={Users} label="Active tenants" value={String(tenancy.activeTenants)} tone="primary" delta={{ current: tenancy.activeTenants, previous: tenancy.activeTenantsPrevMonth }} />
                  <SnapshotTile icon={Bell} label="On notice" value={String(tenancy.onNotice)} tone={tenancy.onNotice > 0 ? "danger" : "default"} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={UserPlus} label="Started" value={String(tenancy.startedThisMonth)} tone={tenancy.startedThisMonth > 0 ? "primary" : "default"} delta={{ current: tenancy.startedThisMonth, previous: tenancy.startedPrevMonth }} />
                  <SnapshotTile icon={UserMinus} label="Ended" value={String(tenancy.endedThisMonth)} delta={{ current: tenancy.endedThisMonth, previous: tenancy.endedPrevMonth }} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <SnapshotTile icon={DoorOpen} label="Upcoming exits" value={String(tenancy.upcomingExits)} tone={tenancy.upcomingExits > 0 ? "danger" : "default"} />
                  <View style={{ flex: 1 }} />
                </View>
                <GradientCtaCard icon={Users} kicker="Tenancy" title="Open tenancy workspace" description="Active stays, onboarding, exit and room-change requests." onPress={() => onNavigate("/owner-tenancy")} />
              </>
            ) : null}

            {snapshot === "cycle" ? (
              <>
                {monthSummary ? (
                  <>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <SnapshotTile icon={ClipboardList} label="Billing cycles" value={String(monthSummary.rentCycleCount)} tone="primary" />
                      <SnapshotTile icon={Receipt} label="Other bills" value={String(monthSummary.oneOffCount)} tone={monthSummary.oneOffCount > 0 ? "primary" : "default"} />
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <SnapshotTile icon={AlertTriangle} label="Overdue" value={String(monthSummary.overdueCount)} tone={monthSummary.overdueCount > 0 ? "danger" : "default"} />
                      <SnapshotTile icon={Check} label="Paid" count={monthSummary.paidCycleCount} total={monthSummary.rentCycleCount + monthSummary.oneOffCount} />
                    </View>
                  </>
                ) : (
                  <SkeletonCard />
                )}
                <GradientCtaCard icon={ClipboardList} kicker="Billing" title="Open billing" description="Cycle list, mark paid, discounts, receipts and the monthly report." onPress={() => onNavigate("/owner-billing")} />
              </>
            ) : null}

            {snapshot === "pnl" ? (
              <PnlSnapshotDetail onNavigate={onNavigate} propertyId={dashboard.property.propertyId} statement={pnlStatement} />
            ) : null}
        </View>
      </Section>
    </FadeInUp>
  );
}

function PnlSnapshotDetail({ onNavigate, propertyId, statement }: { onNavigate: (href: OwnerRoute) => void; propertyId: string; statement?: PnlStatement }) {
  const { colors, type } = useTheme();
  // Trend only loads when this snapshot is expanded (the component mounts then).
  const trend = useGetPnlTrendQuery({ month: istMonthStart(), months: 6, propertyId }, { skip: !propertyId }).data;

  if (!statement) {
    return <SkeletonCard />;
  }

  const profit = statement.netPaise >= 0;
  return (
    <>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <SnapshotTile icon={TrendingUp} label="Income" tone="primary" value={formatMoneyPaise(statement.totalIncomePaise)} />
        <SnapshotTile icon={Wallet} label="Expense" value={formatMoneyPaise(statement.expensePaise)} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <SnapshotTile icon={Receipt} label={profit ? "Net profit" : "Net loss"} tone={profit ? "primary" : "danger"} value={signedMoneyPaise(statement.netPaise)} />
        <SnapshotTile icon={Banknote} label="Collected" value={formatMoneyPaise(statement.billCollectedPaise + statement.manualIncomePaise)} />
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <View style={{ backgroundColor: statement.billUncollectedPaise > 0 ? colors.warningText : colors.jade, borderRadius: 999, height: 8, width: 8 }} />
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
          {statement.billUncollectedPaise > 0
            ? `Collection pending · ${formatMoneyPaise(statement.billUncollectedPaise)} yet to be collected`
            : "All bills collected"}
        </Text>
      </View>
      {trend && trend.points.length > 0 ? <PnlTrendChart points={trend.points} /> : null}
      <GradientCtaCard
        description="Income, expenses, net, the 6-month trend and a downloadable report."
        icon={Receipt}
        kicker="Finance"
        onPress={() => onNavigate("/owner-pnl")}
        title="Open profit & loss"
      />
    </>
  );
}

function signedMoneyPaise(paise: number) {
  return `${paise < 0 ? "−" : ""}${formatMoneyPaise(Math.abs(paise))}`;
}

function signedCompactPaise(paise: number) {
  return `${paise < 0 ? "−" : ""}${compactMoneyPaise(Math.abs(paise))}`;
}

function FrequentlyVisited({ pinnedKeys, propertyId }: { pinnedKeys: string[]; propertyId: string | null }) {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const router = useGuardedRouter();
  const user = useAppSelector((state) => state.auth.user);
  const { canView, owner: isOwner } = usePropertyPermissions(propertyId);
  // A pin survives a permission change AND a module being removed, so both are
  // filtered here — otherwise a stale pin stays on Home as a shortcut into a
  // 403, or into a route that no longer exists.
  const modules = pinnedKeys
    .map((key) => findOwnerModule(key))
    .filter((module): module is NonNullable<typeof module> => Boolean(module))
    .filter((module) => !module.ownerOnly || isOwner)
    .filter((module) => !module.resources?.length || module.resources.some((resource) => canView(resource)));

  function unpin(key: string) {
    const next = pinnedKeys.filter((pinnedKey) => pinnedKey !== key);
    dispatch(setPinnedOwnerModules(next));
    if (user?.id) {
      void savePinnedOwnerModulesForUser(user.id, next);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        Frequently accessed
      </Text>
      {modules.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
          Pin owner services with the pin button on the workspace screen to keep them one tap away here.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              // The unpin control is a SIBLING of the tile, not a child of it.
              // Nested, both render as <button> on web — invalid HTML, and a
              // button inside a button is not reachable by keyboard or
              // announced by a screen reader, so unpinning was mouse-only. This
              // wrapper carries the grid sizing so the tile can still fill it.
              <View
                key={module.key}
                style={{ flexBasis: "30%", flexGrow: 1, maxWidth: "32%", position: "relative" }}
              >
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => router.push(module.route as never)}
                  style={{
                    alignItems: "center",
                    aspectRatio: 1,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderCurve: "continuous",
                    borderRadius: 16,
                    borderWidth: 1,
                    gap: spacing.xs,
                    justifyContent: "center",
                    minHeight: 104,
                    padding: spacing.sm,
                    width: "100%",
                  }}
                >
                  {/* Bare icon, same treatment as the Tools grid but smaller for
                      the tighter tile. The tinted chip it sat in made every pin
                      read as a status badge rather than a shortcut. */}
                  <Icon color={colors.primary} size={34} strokeWidth={1.8} />
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: fonts.sansBold,
                      fontSize: 12,
                      lineHeight: 15,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                  >
                    {module.title}
                  </Text>
                </AnimatedPressable>

                {/* Last sibling and raised, so it paints over the tile on both
                    platforms. No stopPropagation needed any more — a tap here
                    never reaches the tile because it is no longer inside it. */}
                <AnimatedPressable
                  accessibilityLabel={`Unpin ${module.title}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => unpin(module.key)}
                  style={{
                    alignItems: "center",
                    height: 30,
                    justifyContent: "center",
                    position: "absolute",
                    right: 2,
                    top: 2,
                    width: 30,
                    zIndex: 2,
                  }}
                >
                  {/* Filled and leaning, matching the workspace cards:
                      everything here is pinned by definition, so the mark shows
                      the state that unpinning would leave.

                      The tilt sits on a wrapping View, not on the icon: a
                      lucide glyph fills its own viewBox and the SVG clips to
                      it, so rotating the SVG shears the pin's tip off. */}
                  <View style={{ transform: [{ rotate: "32deg" }] }}>
                    <Pin color={colors.primary} fill={colors.primary} size={15} strokeWidth={2} />
                  </View>
                </AnimatedPressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function WorkspaceTab({
  dashboard,
  onNavigate,
  pinnedKeys,
  workspaceRole,
}: {
  dashboard: OwnerDashboard;
  onNavigate: (href: OwnerRoute) => void;
  pinnedKeys: string[];
  workspaceRole: "Owner" | "Manager";
}) {
  const { colors } = useTheme();
  const { attention, today } = dashboard;
  const actionCenterCount = attentionCount(dashboard);
  return (
    <>
      <Section eyebrow={`${workspaceRole} actions`} title="Workspace">
        <FrequentlyVisited pinnedKeys={pinnedKeys} propertyId={dashboard.property?.propertyId ?? null} />
        <WorkspaceHeroCard onPress={() => onNavigate("/owner")} role={workspaceRole} />
      </Section>

      <Section eyebrow="Quick access" title="Tools">
        {/* Every tool stays on screen whatever the manager holds. Tapping a
            blocked one refuses with a toast that names it, via the shared route
            gate — unlike a workspace MODULE, which is removed outright. The
            difference is deliberate: a missing module is a section they were
            never given, while a missing tool from a fixed four-square grid just
            looks broken, and leaves the survivors stretched across the row. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox icon={Search} label="Vacancy finder" onPress={() => onNavigate("/owner-vacancy-finder")} />
            <HomeToolBox icon={Wallet} label="Expenses" onPress={() => onNavigate("/owner-expenses")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox
              badge={attention.pendingDepositSettlements ?? 0}
              icon={Landmark}
              label="Deposit manager"
              onPress={() => onNavigate("/owner-deposit-manager")}
            />
            <HomeToolBox icon={TrendingUp} label="Profit & loss" onPress={() => onNavigate("/owner-pnl")} />
          </View>
          {/* An odd fifth tool. It keeps its half-width against a spacer rather
              than stretching across the row — a lone full-width tile among
              four half-width ones reads as a layout bug, not a feature. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <EnquiriesToolBox onNavigate={onNavigate} propertyId={dashboard.property?.propertyId ?? null} />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      </Section>

      {/* Shown to managers too. Consistent with the billing ruling: dashboard
          figures stay visible to everyone and only the way IN to a module is
          gated. Staff is the exception below, because it is owner-only outright
          rather than permission-gated. */}
      <Section eyebrow="Today" title="Live digest">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <DigestTile
              // Money in, so green — the one tile on this grid that is good
              // news rather than a queue.
              accentColor={colors.jade}
              hint={formatMoneyPaise(today.paymentsMadeTodayPaise)}
              highlight={today.paymentsMadeToday > 0}
              icon={Banknote}
              label="Payments"
              onPress={() => onNavigate("/owner-billing")}
              value={String(today.paymentsMadeToday)}
            />
            <DigestTile
              hint="Raised today"
              highlight={today.concernsRaisedToday > 0}
              icon={AlertCircle}
              label="Concerns"
              onPress={() => onNavigate(OWNER_CONCERNS_ROUTE)}
              value={String(today.concernsRaisedToday)}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <DigestTile
              hint="Started today"
              highlight={today.tenanciesStartedToday > 0}
              icon={UserPlus}
              label="Move-ins"
              onPress={() => onNavigate("/owner-tenancy")}
              value={String(today.tenanciesStartedToday)}
            />
            <DigestTile
              hint="Ending today"
              highlight={today.tenanciesEndingToday > 0}
              icon={LogOut}
              label="Move-outs"
              onPress={() => onNavigate("/owner-exit-requests")}
              value={String(today.tenanciesEndingToday)}
            />
          </View>
        </View>
        <UpcomingNoticesCard
          onOpen={() => onNavigate("/owner-upcoming-notices")}
          propertyId={dashboard.property.propertyId}
        />
        <ExpenseTrackerCard onOpen={() => onNavigate("/owner-expenses")} propertyId={dashboard.property.propertyId} />
      </Section>

    </>
  );
}

function HomeToolBox({ badge, icon: Icon, label, onPress }: { badge?: number; icon: ComponentType<LucideProps>; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 112,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.md,
      }}
    >
      {badge && badge > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderRadius: 999,
            justifyContent: "center",
            minWidth: 20,
            paddingHorizontal: 5,
            position: "absolute",
            right: spacing.sm,
            top: spacing.sm,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11, }}>
            {badge}
          </Text>
        </View>
      ) : null}
      <Icon color={colors.primary} size={48} strokeWidth={1.8} />
      <MarqueeText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}>
        {label}
      </MarqueeText>
    </AnimatedPressable>
  );
}

// Owner-only quick view of the staff team, sitting full-width (two tiles wide)
// under the live digest. Figures are estimated from current staff/manager pay terms.

function UpcomingNoticesCard({ onOpen, propertyId }: { onOpen: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const upcoming =
    useListUpcomingNoticesQuery(propertyId, { pollingInterval: 60_000, skip: !propertyId }).data ?? [];

  const recurringCount = upcoming.filter((notice) => notice.recurringNoticeId !== null).length;
  const scheduledCount = upcoming.length - recurringCount;
  const next = upcoming[0] ?? null;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 14, borderWidth: 1, height: 44, justifyContent: "center", width: 44 }}>
              <Megaphone color={colors.ink} size={22} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, }}>
                Upcoming notices
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StaffMetricBox hint="Next 3 hrs" label="Going live" value={String(upcoming.length)} />
            <StaffMetricBox hint="One-off" label="Scheduled" value={String(scheduledCount)} />
            <StaffMetricBox
              hint={next ? formatUpcomingTime(next.visibleFrom) : "Nothing due"}
              label="Recurring"
              value={String(recurringCount)}
            />
          </View>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

function formatUpcomingTime(visibleFrom: string) {
  return new Date(visibleFrom).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function ExpenseTrackerCard({ onOpen, propertyId }: { onOpen: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const budget = useGetBudgetOverviewQuery({ month: istMonthStart(), propertyId }, { skip: !propertyId }).data;

  const spent = budget?.spentPaise ?? 0;
  const effective = budget?.effectiveBudgetPaise ?? null;
  const hasBudget = effective != null && effective > 0;
  const over = hasBudget && spent > effective;
  const approaching = hasBudget && !over && spent * 100 >= effective * 80;
  const status = !hasBudget ? "—" : over ? "Crossed" : approaching ? "Approaching" : "On track";
  const statusColor = !hasBudget ? colors.muted : over ? colors.danger : approaching ? colors.warningText : colors.jade;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 14, borderWidth: 1, height: 44, justifyContent: "center", width: 44 }}>
              <Wallet color={colors.ink} size={22} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, }}>
                Expense tracker
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StaffMetricBox hint="This month" label="Spent" value={compactMoneyPaise(spent)} />
            <StaffMetricBox hint={hasBudget ? "Monthly" : "Not set"} label="Budget" value={hasBudget && effective != null ? compactMoneyPaise(effective) : "—"} />
            <StaffMetricBox hint="Vs budget" label="Status" value={status} valueColor={statusColor} valueSans />
          </View>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

// Current month key in IST so the digest matches the expense tool / backend
// (device-local time can land on the previous month near a boundary).
function istMonthStart() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (year && month) {
      return `${year}-${month}-01`;
    }
  } catch {
    // Fall through to the device-local month.
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function StaffMetricBox({ hint, label, value, valueColor, valueSans }: { hint: string; label: string; value: string; valueColor?: string; valueSans?: boolean }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, gap: 2, padding: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} numberOfLines={1}>
        {label}
      </Text>
      {/* Serif numerals (money) keep the ledger look; word statuses use the sans
          face. adjustsFontSizeToFit shrinks a long word ("Approaching") to fit
          the narrow box, but on Android the shrunk glyph box is centred against
          the ORIGINAL font metrics and its top ascender gets clipped — so pin an
          explicit lineHeight (with font padding + centred vertical align) that
          reserves the ascender room regardless of the shrink. */}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        numberOfLines={1}
        style={{
          color: valueColor ?? colors.ink,
          fontFamily: valueSans ? fonts.sans : fonts.display,
          fontSize: valueSans ? 16 : 17,
          fontVariant: ["tabular-nums"],
          fontWeight: valueSans ? "800" : "700",
          includeFontPadding: true,
          lineHeight: valueSans ? 22 : 23,
          textAlignVertical: "center",
        }}
      >
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Compact Indian money (₹45K / ₹2.4L / ₹1.2Cr) so a wide payout fits one line in
// the small metric box without shrinking the font out of line with the others.
function compactMoneyPaise(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 10000000) {
    return `₹${trimDecimal(rupees / 10000000)}Cr`;
  }
  if (rupees >= 100000) {
    return `₹${trimDecimal(rupees / 100000)}L`;
  }
  if (rupees >= 1000) {
    return `₹${trimDecimal(rupees / 1000)}K`;
  }
  return `₹${Math.round(rupees)}`;
}

function trimDecimal(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

const COLLAPSED_ACTIVITY_LINES = 2;

function ActivityRow({ item }: { item: RecentActivityItem }) {
  const { colors, isDark, type } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

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
              : item.type === "ROOM_MAINTENANCE_STARTED"
                ? Wrench
                : item.type === "ROOM_MAINTENANCE_ENDED"
                  ? Check
                  : item.type === "ROOM_DEACTIVATED"
                    ? Ban
                    : item.type === "ROOM_REACTIVATED"
                      ? RotateCcw
                      : item.type === "STAFF_ADDED" || item.type === "MANAGER_ADDED"
                        ? UserPlus
                        : item.type === "STAFF_REMOVED" || item.type === "MANAGER_REMOVED"
                          ? UserMinus
                          : KeyRound;

  // Colour-code the icon chip by the nature of the event.
  const tone: "primary" | "jade" | "accent" | "danger" =
    item.type === "CONCERN_ESCALATED" || item.type === "ROOM_DEACTIVATED"
      ? "danger"
      : item.type === "ROOM_MAINTENANCE_STARTED"
        ? "accent"
        : item.type === "PAYMENT_RECORDED" ||
            item.type === "CONCERN_RESOLVED" ||
            item.type === "ROOM_MAINTENANCE_ENDED" ||
            item.type === "ROOM_REACTIVATED"
          ? "jade"
          : "primary";
  const toneColor =
    tone === "danger" ? colors.danger : tone === "accent" ? colors.accent : tone === "jade" ? colors.jade : colors.ink;

  const subtitleColor = { color: colors.muted, lineHeight: 18 } as const;

  return (
    <Pressable
      onPress={canExpand ? () => setExpanded((value) => !value) : undefined}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: 1,
        elevation: 2,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            borderColor: colors.ink,
            borderCurve: "continuous",
            borderRadius: 12,
            borderWidth: 1,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Icon color={colors.ink} size={18} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[type.caption, { color: colors.kicker }]}>
              {formatRelativeTime(item.occurredAt)}
            </Text>
          </View>

          {/* Invisible full-text measurer: lets us show the toggle only when the
              subtitle actually overflows the collapsed line count. */}
          <Text
            style={[type.caption, subtitleColor, { left: 0, opacity: 0, position: "absolute", right: 0, top: 0 }]}
            onTextLayout={(event) => {
              const overflowing = event.nativeEvent.lines.length > COLLAPSED_ACTIVITY_LINES;
              setCanExpand((previous) => (previous === overflowing ? previous : overflowing));
            }}
          >
            {item.subtitle}
          </Text>
          <Text style={[type.caption, subtitleColor]} numberOfLines={expanded ? undefined : COLLAPSED_ACTIVITY_LINES}>
            {item.subtitle}
          </Text>

          {canExpand ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 3, marginTop: 1 }}>
              <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
                {expanded ? "Show less" : "Show more"}
              </Text>
              {expanded ? (
                <ChevronUp color={colors.primary} size={13} strokeWidth={2.6} />
              ) : (
                <ChevronDown color={colors.primary} size={13} strokeWidth={2.6} />
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
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

function DigestTile({
  accentColor,
  hint,
  highlight,
  icon: Icon,
  label,
  onPress,
  value,
}: {
  /**
   * Tints the line under the count. Only Payments uses it — money in reads
   * green — and it deliberately does not spread to the other three, which are
   * queues rather than good news.
   */
  accentColor?: string;
  hint: string;
  highlight: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const { colors, fonts, isDark, type } = useTheme();
  const tone = accentColor ?? colors.primary;
  const accent = highlight ? tone : colors.muted;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        minHeight: 132,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
      }}
    >
      {/* No chip: the tile already has its own surface, so a second filled
          shape inside it read as a control rather than a label. Colour alone
          carries the highlight. */}
      {/* The icon keeps the shared highlight colour whatever the tile is. Only
          the figures take a tile's own tone — the icon is what makes the four
          tiles read as one grid. */}
      <Icon color={highlight ? colors.primary : colors.muted} size={26} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{
          // The count is always ink. Colouring it on activity made the number
          // itself look like a status, when the number IS the fact — the icon
          // and the line beneath it already carry whether anything happened.
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 25,
          fontVariant: ["tabular-nums"],
          letterSpacing: -0.5,
          lineHeight: 30,
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {/* No dot. It restated what the hint's own colour already says, and four
          of them across a row read as status lights on a device. */}
      <Text style={[type.caption, { color: accent, textAlign: "center" }]} numberOfLines={1}>
        {hint}
      </Text>
    </AnimatedPressable>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Occupancy rate
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.5, lineHeight: 38 }}>
            {rate}%
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
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
          <Text style={[type.eyebrow, { color: tone }]}>
            {label}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 10, marginTop: spacing.sm, overflow: "hidden" }}>
        <View style={{ backgroundColor: tone, borderRadius: 999, height: 10, width: `${Math.min(100, Math.max(0, rate))}%` }} />
      </View>
    </Card>
  );
}

function BillingSnapshotCard({ money }: { money: OwnerDashboard["money"] }) {
  const { colors, fonts, type } = useTheme();
  const collectable = money.billedThisMonthPaise;
  const collected = money.collectedThisMonthPaise;
  // Before anything is collected this month the rate is a meaningless 0% — show
  // the amount still collectable instead of "₹0 of ₹0 collected".
  const awaiting = collected === 0 && collectable > 0;
  const rate = collectable > 0 ? Math.round((collected / collectable) * 100) : 0;
  const tone = awaiting
    ? colors.primary
    : collectable === 0
      ? colors.danger
      : rate >= 90
        ? colors.successText
        : rate >= 60
          ? colors.primary
          : colors.danger;
  const label =
    collectable === 0 ? "Nothing billed" : awaiting ? "Awaiting" : rate >= 90 ? "On track" : rate >= 60 ? "Collecting" : "Behind";

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            {awaiting ? "Collectable this month" : "Collection rate"}
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.5, lineHeight: 38 }}>
            {awaiting ? formatMoneyPaise(collectable) : `${rate}%`}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
            {awaiting
              ? "Yet to be collected"
              : `${formatMoneyPaise(collected)} of ${formatMoneyPaise(collectable)} collected`}
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
          <Text style={[type.eyebrow, { color: tone }]}>
            {label}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 10, marginTop: spacing.sm, overflow: "hidden" }}>
        <View style={{ backgroundColor: tone, borderRadius: 999, height: 10, width: `${Math.min(100, Math.max(0, rate))}%` }} />
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
          <SkeletonCard />
        ) : listings.length > 0 ? (
          listings.map((property) => (
            <SummaryRow
              key={property.propertyId}
              icon={Building2}
              kicker={property.city}
              title={property.name}
              body={`${property.address}  /  ${property.startingRoomRentPaise ? formatMoneyPaise(property.startingRoomRentPaise) : "Rent on profile"}`}
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
  workspaceRole,
}: {
  onSelect: (propertyId: string) => void;
  onToggle: () => void;
  open: boolean;
  properties: OwnerProperty[];
  selectedProperty: OwnerProperty | null;
  workspaceRole: "Owner" | "Manager";
}) {
  const { colors, fonts, isDark, type } = useTheme();
  const isManager = workspaceRole === "Manager";
  const hasMultipleProperties = properties.length > 1;
  const eyebrowLabel = isManager ? "Managed property" : "Active property";
  const selectorTitle = selectedProperty?.name ?? (isManager ? "Select managed property" : "Select property");
  const selectorSubtitle = selectedProperty
    ? [selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")
    : hasMultipleProperties
      ? isManager
        ? "Choose which assigned property to manage."
        : "Choose which property this owner workspace should control."
      : "Property will be selected automatically when available.";

  return (
    <View style={{ gap: spacing.sm }}>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={hasMultipleProperties ? onToggle : undefined}
        style={{
          alignItems: "center",
          backgroundColor: selectedProperty ? colors.surfaceRaised : colors.primarySoft,
          // Ink in both states. This card decides what every other screen in
          // the workspace is about, and a hairline let it sit at the same
          // weight as the tiles under it. The unselected state keeps its soft
          // primary fill, so "nothing chosen yet" still reads without the
          // border having to carry it.
          borderColor: colors.ink,
          borderCurve: "continuous",
          borderRadius: 18,
          // 2px, not a hairline. This is the hero control of the screen and a
          // 1px ink edge read as a thin outline rather than a deliberate frame.
          borderWidth: 2,
          flexDirection: "row",
          gap: spacing.md,
          minHeight: 72,
          // Clips the photograph to the card's rounded corners.
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {/* Absolutely positioned so it takes no part in the row layout, and
            first in the tree so every label paints over it. Faded hard: this is
            a ground, not a picture — it should register as texture and never
            compete with the property name sitting on top of it. */}
        {/* Four insets on the image itself, and no percentage anywhere — the
            same idiom as the auth hero band, which is the one full-bleed photo
            in the app already proven on a device.

            Percentage sizing is what broke this twice: `width: "100%"` on an
            absolutely positioned image resolves against a parent whose own size
            is still being derived, so native laid the photo out at its natural
            size in the top-left corner and left the card showing below and to
            the right. Insets give the layout a definite box up front, and
            `cover` then fills it.

            Dark mode takes less of it: a photograph lightens a dark surface
            instead of darkening a light one. */}
        <Image
          resizeMode="cover"
          source={PROPERTY_CARD_ART}
          style={{ bottom: 0, left: 0, opacity: isDark ? 0.1 : 0.16, position: "absolute", right: 0, top: 0 }}
        />
        {/* Outlined container, ink glyph, no fill — a tinted tile inside an
            ink-bordered card is a box in a box, and a blue glyph on a blue
            ground was the least legible thing on the card. */}
        <View
          style={{
            alignItems: "center",
            borderColor: colors.ink,
            borderCurve: "continuous",
            borderRadius: 12,
            // Lighter than the card that holds it, so the frame stays the
            // outer edge and the tile does not compete with it.
            borderWidth: 1.5,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Building2 color={colors.ink} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          {/* Ink, not the usual kicker grey. These two lines now sit on a
              photograph, and a light grey that reads fine on flat white
              dissolves into the building behind it. */}
          <Text style={[type.eyebrow, { color: selectedProperty ? colors.inkSoft : colors.primary }]}>
            {eyebrowLabel}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 20,
              lineHeight: 25,
            }}
          >
            {selectorTitle}
          </Text>
          <Text numberOfLines={2} style={[type.caption, { color: colors.inkSoft, fontSize: 11 }]}>
            {selectorSubtitle}
          </Text>
        </View>
        {hasMultipleProperties ? (
          <ChevronDown
            color={colors.muted}
            size={20}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          />
        ) : null}
      </AnimatedPressable>

      {open && hasMultipleProperties ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // Matches the bar it drops out of — a hairline panel under an ink
            // bar reads as two unrelated controls stacked by accident.
            borderColor: colors.ink,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 2,
            // No padding, and clip the children: this is what lets a selected
            // row fill the panel corner to corner. Padded rows with their own
            // borders and radii made every option a card floating inside a
            // card, which is the part that read as cluttered.
            overflow: "hidden",
          }}
        >
          {properties.map((property, index) => {
            const selected = property.id === selectedProperty?.id;

            return (
              <AnimatedPressable
                key={property.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(property.id)}
                style={{
                  alignItems: "center",
                  // Selection is a filled ink row, as in every other picker in
                  // the app. The tinted fill plus a tick said the same thing
                  // twice and still read as the weaker state of the two.
                  backgroundColor: selected ? colors.ink : "transparent",
                  // Options are separated by a rule, not boxed individually.
                  borderTopColor: colors.border,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[type.bodyStrong, { color: selected ? colors.surface : colors.ink }]}>
                    {property.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      type.caption,
                      // Dimmed by opacity rather than a grey token: the row's
                      // ground flips with the theme, a fixed grey does not.
                      { color: selected ? colors.surface : colors.muted, fontSize: 11, opacity: selected ? 0.75 : 1 },
                    ]}
                  >
                    {[property.city, property.state, property.pincode].filter(Boolean).join(", ")}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </View>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            {label}
          </Text>
          <Text numberOfLines={2} style={[type.body, { color: colors.ink, fontWeight: "800" }]}>
            {locationText}
          </Text>
          {detailParts.length > 0 && locationText !== detailParts.join(", ") ? (
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
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
        borderColor: colors.ink,
        borderWidth: 1,
        borderRadius: 14,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <Icon color={colors.ink} size={21} strokeWidth={2.4} />
    </View>
  );
}

function InfoLine({ icon: Icon, text }: { icon: ComponentType<LucideProps>; text: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={15} strokeWidth={2.2} />
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
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
        <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
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
          <Text style={[type.eyebrow, { color: "#1F7A3A", fontSize: 10 }]}>
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
            <Text style={[type.eyebrow, { color: hasItems ? colors.primary : colors.kicker }]}>
              {hasItems ? `${itemCount} board item${itemCount === 1 ? "" : "s"}` : "Property board"}
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
              Property board
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
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
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  {item.categoryName}
                </Text>
                <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]}>
                  {item.title}
                </Text>
                <Text numberOfLines={2} style={[type.body, { color: colors.muted }]}>
                  {item.body}
                </Text>
              </View>
            ))}

            <Text style={[type.eyebrow, { color: colors.primary, textAlign: "center" }]}>
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
            <Text style={[type.eyebrow, { color: hasNotices ? colors.primary : colors.kicker }]}>
              {hasNotices ? `${noticeCount} notice${noticeCount === 1 ? "" : "s"}` : "Notice board"}
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
              Notice board
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
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
                  <Text style={[type.eyebrow, { color: urgent ? colors.primary : colors.kicker }]}>
                    {humanizeToken(notice.priority)}
                  </Text>
                  <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]}>
                    {notice.title}
                  </Text>
                  <Text numberOfLines={2} style={[type.body, { color: colors.muted }]}>
                    {notice.body}
                  </Text>
                </View>
              );
            })}

            <Text style={[type.eyebrow, { color: colors.primary, textAlign: "center" }]}>
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
          <Text style={[type.eyebrow, { color: urgent ? colors.primary : colors.kicker }]}>
            {kicker}
          </Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]}>
            {title}
          </Text>
          <Text numberOfLines={2} style={[type.body, { color: colors.muted }]}>
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
      <Text style={[type.eyebrow, { color: colors.inkSoft, fontSize: 10.5 }]}>
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
    return tenancy.plannedEndDate ? `Normal notice  /  ends ${formatDate(tenancy.plannedEndDate)}` : "Normal notice";
  }
  if (tenancy.status === "ON_PREMATURE_NOTICE") {
    return tenancy.plannedEndDate
      ? `Premature notice  /  ends ${formatDate(tenancy.plannedEndDate)}`
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

function initialsFor(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "KH";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatFloor(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase().startsWith("floor") ? trimmed : `Floor ${trimmed}`;
}
