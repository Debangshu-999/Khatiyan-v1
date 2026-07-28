import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import type { NoticeSummary, PropertyBoardItem } from "@/store/services/notice-api";
import { useListMyPropertyBoardItemsQuery, useListMyVisibleNoticesQuery } from "@/store/services/notice-api";
import { useGetPropertyMonthSummaryQuery, type BillingMonthSummary } from "@/store/services/billing-api";
import { useGetBudgetOverviewQuery } from "@/store/services/expense-api";
import {
  useGetOwnerDashboardQuery,
  type OwnerDashboard,
  type RecentActivityItem,
} from "@/store/services/dashboard-api";
import { useListPayoutAccountsQuery } from "@/store/services/payout-api";
import { PnlTrendChart } from "@/features/owner/pnl-trend-chart";
import { useGetPnlStatementQuery, useGetPnlTrendQuery, type PnlStatement } from "@/store/services/pnl-api";
import { findOwnerModule } from "@/features/owner/owner-modules";
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
  const accountMenuLabel = activeAccount ? `${accountLabel(activeAccount)} account` : markerLabel ? `${markerLabel} account` : "Account";

  async function handleLogout() {
    dispatch(clearActiveAccount());
    dispatch(setPinnedOwnerModules([]));
    void saveActiveAccount(null);
    dispatch(clearSession());
    dispatch(api.util.resetApiState());
    await clearStoredSession();
    router.replace("/auth");
  }

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
            <HeaderNote>{subtitle}</HeaderNote>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
          <HomeProfileMenu
            accountLabel={accountMenuLabel}
            imageUri={profileQuery.data?.profilePhotoUrl ?? null}
            name={user?.fullName?.trim() || "Khatiyan user"}
            onLogout={() => void handleLogout()}
            onOpenProfile={() => router.push("/account")}
            onOpenSettings={() => router.push("/account-settings")}
          />
          {isWorkspace ? <LatestEventsButton activity={headerRecentActivity} /> : null}
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
          style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sans, fontSize: 20, fontWeight: "800", letterSpacing: 0 }}
          selectable
        >
          {locationTitle(location)}
        </Text>
        {busy ? <ActivityIndicator color={colors.muted} size="small" /> : <RefreshCw color={colors.muted} size={14} strokeWidth={2.4} />}
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
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
    <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]} selectable>
      {label}
    </Text>
  );
}

function HomeProfileMenu({
  accountLabel,
  imageUri,
  name,
  onLogout,
  onOpenProfile,
  onOpenSettings,
}: {
  accountLabel: string;
  imageUri: string | null;
  name: string;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const initials = initialsFor(name);

  function closeAndRun(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <View style={{ alignItems: "flex-end", position: "relative", zIndex: 40 }}>
      <AnimatedPressable
        accessibilityLabel="Open account menu"
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 6,
          height: 40,
          paddingLeft: 4,
          paddingRight: 10,
        }}
      >
        <View style={{ alignItems: "center", borderRadius: 16, height: 32, justifyContent: "center", overflow: "hidden", width: 32 }}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ height: 32, width: 32 }} />
          ) : (
            <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, height: 32, justifyContent: "center", width: 32 }}>
              <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 12, fontWeight: "900" }} selectable>
                {initials}
              </Text>
            </View>
          )}
        </View>
        {open ? <ChevronUp color={colors.muted} size={16} strokeWidth={2.4} /> : <ChevronDown color={colors.muted} size={14} strokeWidth={2.4} />}
      </AnimatedPressable>

      {open ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderRadius: 14,
            borderWidth: 1,
            gap: 2,
            padding: spacing.xs,
            position: "absolute",
            right: 0,
            top: 48,
            width: 182,
            zIndex: 50,
          }}
        >
          <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1, gap: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
            <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]} numberOfLines={1} selectable>
              {accountLabel}
            </Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 14 }]} numberOfLines={1} selectable>
              {name}
            </Text>
          </View>
          <MenuAction icon={UserRound} label="Profile" onPress={() => closeAndRun(onOpenProfile)} />
          <MenuAction icon={Settings} label="Settings" onPress={() => closeAndRun(onOpenSettings)} />
          <MenuAction danger icon={LogOut} label="Logout" onPress={() => closeAndRun(onLogout)} />
        </View>
      ) : null}
    </View>
  );
}

function MenuAction({
  danger,
  icon: Icon,
  label,
  onPress,
}: {
  danger?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const tone = danger ? colors.danger : colors.ink;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", borderRadius: 10, flexDirection: "row", gap: spacing.sm, minHeight: 38, paddingHorizontal: spacing.sm }}
    >
      <Icon color={tone} size={16} strokeWidth={2.2} />
      <Text style={{ color: tone, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }} selectable>
        {label}
      </Text>
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
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 11, fontWeight: "900", letterSpacing: 1, opacity: 0.82, textTransform: "uppercase" }} selectable>
              {kicker}
            </Text>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.display, fontSize: 20, fontWeight: "600", letterSpacing: -0.3 }} selectable>
              {title}
            </Text>
          </View>
          <View style={{ alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.18)", borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
            <ChevronRight color={colors.onPrimary} size={19} strokeWidth={2.6} />
          </View>
        </View>
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, opacity: 0.85 }} selectable>
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
function LatestEventsButton({ activity }: { activity: RecentActivityItem[] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const latestKey = activity.length ? `${activity[0].type}-${activity[0].occurredAt}` : "";
  const seenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (seenKeyRef.current === null) {
      // First load - treat existing events as already seen so it doesn't blink.
      seenKeyRef.current = latestKey;
      return;
    }
    if (latestKey && latestKey !== seenKeyRef.current) {
      setHasNew(true);
    }
  }, [latestKey]);

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
        onPress={openModal}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <MaterialIcons name="dynamic-feed" color={colors.muted} size={22} />
        {hasNew ? <BlinkingDot /> : null}
      </AnimatedPressable>
      {open ? <LatestEventsModal activity={activity} onClose={() => setOpen(false)} /> : null}
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

function LatestEventsModal({ activity, onClose }: { activity: RecentActivityItem[]; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "82%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Recent activity
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: "600" }} selectable>
                Latest events
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close latest events"
              accessibilityRole="button"
              onPress={onClose}
              style={{ alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}
            >
              <X color={colors.ink} size={18} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>
          {activity.length === 0 ? (
            <Text style={[type.body, { color: colors.muted }]} selectable>
              No recent activity yet. New tenancies, payments, resolved concerns and published notices will appear here.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator>
              {activity.map((item, index) => (
                <ActivityRow item={item} key={`${item.type}-${item.occurredAt}-${index}`} />
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
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
  | "/owner-concerns"
  | "/owner-vacancy-finder"
  | "/owner-staff"
  | "/owner-expenses"
  | "/owner-pnl"
  | { pathname: "/owner-service-placeholder"; params: { service: string; title: string } };

const OWNER_CONCERNS_ROUTE: OwnerRoute = "/owner-concerns";

type OwnerTab = "workspace" | "dashboard";

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
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
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
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
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

      {selectedProperty && dashboardQuery.isFetching && !dashboard ? (
        <SkeletonCard />
      ) : null}

      {selectedProperty && dashboard ? (
        <>
          <OwnerTabBar onChange={setTab} tab={tab} />
          {tab === "dashboard" ? (
            <DashboardTab dashboard={dashboard} monthSummary={monthSummaryQuery.data} onNavigate={onNavigate} />
          ) : (
            <WorkspaceTab dashboard={dashboard} onNavigate={onNavigate} pinnedKeys={pinnedKeys} workspaceRole={workspaceRole} />
          )}
        </>
      ) : null}
    </FadeInUp>
  );
}

function OwnerTabBar({ onChange, tab }: { onChange: (tab: OwnerTab) => void; tab: OwnerTab }) {
  const { colors, fonts, isDark } = useTheme();
  const tabs: { label: string; value: OwnerTab }[] = [
    { label: "Workspace", value: "workspace" },
    { label: "Dashboard", value: "dashboard" },
  ];
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: 16, flexDirection: "row", padding: 5 }}>
      {tabs.map((item) => {
        const selected = tab === item.value;
        return (
          <AnimatedPressable
            accessibilityRole="button"
            key={item.value}
            onPress={() => onChange(item.value)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.surface : "transparent",
              borderColor: selected ? colors.borderStrong : "transparent",
              borderCurve: "continuous",
              borderRadius: 13,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              minHeight: 46,
            }}
          >
            <Text style={{ color: selected ? colors.ink : colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: selected ? "900" : "700" }} selectable>
              {item.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

type SnapshotKey = "collection" | "property" | "tenancy" | "cycle" | "pnl";

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
          <DashboardSnapshotBox active={openSnapshot === "collection"} icon={Banknote} label="Collection" onPress={() => toggle("collection")} tone="primary" value={compactMoneyPaise(money.collectedThisMonthPaise)} />
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
      <Text
        style={{ color: tone === "danger" ? colors.danger : colors.ink, fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "700", letterSpacing: -0.3 }}
        numberOfLines={1}
        selectable
      >
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.muted, fontSize: 11, textAlign: "center" }]} numberOfLines={1} selectable>
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
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]} selectable>
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

function FrequentlyVisited({ pinnedKeys }: { pinnedKeys: string[] }) {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const router = useGuardedRouter();
  const user = useAppSelector((state) => state.auth.user);
  const modules = pinnedKeys.map((key) => findOwnerModule(key)).filter((module): module is NonNullable<typeof module> => Boolean(module));

  function unpin(key: string) {
    const next = pinnedKeys.filter((pinnedKey) => pinnedKey !== key);
    dispatch(setPinnedOwnerModules(next));
    if (user?.id) {
      void savePinnedOwnerModulesForUser(user.id, next);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        Frequently accessed
      </Text>
      {modules.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
          Pin owner services with the pin button on the workspace screen to keep them one tap away here.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <AnimatedPressable
                accessibilityRole="button"
                key={module.key}
                onPress={() => router.push(module.route as never)}
                style={{
                  alignItems: "center",
                  aspectRatio: 1,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderCurve: "continuous",
                  borderRadius: 16,
                  borderWidth: 1,
                  flexBasis: "30%",
                  flexGrow: 1,
                  gap: spacing.xs,
                  justifyContent: "center",
                  maxWidth: "32%",
                  minHeight: 104,
                  padding: spacing.sm,
                }}
              >
                <AnimatedPressable
                  accessibilityLabel={`Unpin ${module.title}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation();
                    unpin(module.key);
                  }}
                  style={{
                    alignItems: "center",
                    height: 26,
                    justifyContent: "center",
                    position: "absolute",
                    right: spacing.xs,
                    top: spacing.xs,
                    width: 26,
                  }}
                >
                  <Pin color={colors.primary} size={14} strokeWidth={2.6} />
                </AnimatedPressable>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    height: 44,
                    justifyContent: "center",
                    width: 44,
                  }}
                >
                  <Icon color={colors.primary} size={21} strokeWidth={2.2} />
                </View>
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.sans,
                    fontSize: 12,
                    fontWeight: "900",
                    lineHeight: 15,
                    textAlign: "center",
                  }}
                  numberOfLines={2}
                  selectable
                >
                  {module.title}
                </Text>
              </AnimatedPressable>
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
  const { attention, budget, today } = dashboard;
  // Payout banks belong to the owner, not the property — a manager has none to
  // set up, so the missing-bank item never counts for them.
  const hasSession = useAppSelector((state) => Boolean(state.auth.accessToken));
  const payoutQuery = useListPayoutAccountsQuery(undefined, { skip: workspaceRole !== "Owner" || !hasSession });
  const payoutMissing = workspaceRole === "Owner" && payoutQuery.isSuccess && (payoutQuery.data?.length ?? 0) === 0;
  // Total open items the action center groups - drives its attention badge. A
  // budget that is approaching or exceeded counts as one more item.
  const actionCenterCount =
    (payoutMissing ? 1 : 0) +
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
    (budget?.level === "APPROACHING" || budget?.level === "EXCEEDED" ? 1 : 0);
  return (
    <>
      <Section eyebrow={`${workspaceRole} actions`} title="Workspace">
        <FrequentlyVisited pinnedKeys={pinnedKeys} />
        <WorkspaceHeroCard onPress={() => onNavigate("/owner")} role={workspaceRole} />
      </Section>

      <Section eyebrow="Quick access" title="Tools">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox badge={actionCenterCount} icon={ClipboardList} label="Action center" onPress={() => onNavigate("/owner-action-center")} />
            <HomeToolBox icon={Search} label="Vacancy finder" onPress={() => onNavigate("/owner-vacancy-finder")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox icon={Wallet} label="Expenses" onPress={() => onNavigate("/owner-expenses")} />
            <HomeToolBox
              badge={attention.pendingDepositSettlements ?? 0}
              icon={Landmark}
              label="Deposit manager"
              onPress={() => onNavigate("/owner-deposit-manager")}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox icon={TrendingUp} label="Profit & loss" onPress={() => onNavigate("/owner-pnl")} />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      </Section>

      <Section eyebrow="Today" title="Live digest">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <DigestTile
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
              icon={DoorOpen}
              label="Move-outs"
              onPress={() => onNavigate("/owner-exit-requests")}
              value={String(today.tenanciesEndingToday)}
            />
          </View>
        </View>
        {workspaceRole === "Owner" ? (
          <StaffManagementCard onOpen={() => onNavigate("/owner-staff")} propertyId={dashboard.property.propertyId} />
        ) : null}
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
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 11, fontWeight: "900" }} selectable>
            {badge}
          </Text>
        </View>
      ) : null}
      <Icon color={colors.primary} size={48} strokeWidth={1.8} />
      <MarqueeText style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "900", lineHeight: 15, textAlign: "center" }}>
        {label}
      </MarqueeText>
    </AnimatedPressable>
  );
}

// Owner-only quick view of the staff team, sitting full-width (two tiles wide)
// under the live digest. Figures are estimated from current staff/manager pay terms.
function StaffManagementCard({ onOpen, propertyId }: { onOpen: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const members = useListStaffMembersQuery({ propertyId }, { skip: !propertyId }).data ?? [];
  const managers = useListManagerEmploymentQuery(propertyId, { skip: !propertyId }).data ?? [];
  const categories = useListStaffCategoriesQuery(propertyId, { skip: !propertyId }).data ?? [];

  const days = daysInCurrentMonth();
  // Daily staff are paid only for their selected working days; managers have no
  // weekday pattern yet, so they bill every day of the month.
  const memberPayoutPaise = members.reduce(
    (sum, member) => sum + (member.salaryStructure === "MONTHLY" ? member.salaryRatePaise : workingDaysInCurrentMonth(member.workingDaysMask) * member.salaryRatePaise),
    0,
  );
  const managerPayoutPaise = managers.reduce(
    (sum, manager) => sum + (manager.salaryStructure === "MONTHLY" ? manager.salaryRatePaise : days * manager.salaryRatePaise),
    0,
  );
  const payoutPaise = memberPayoutPaise + managerPayoutPaise;
  const totalStaff = members.length + managers.length;
  const totalCategories = categories.length + 1; // managers form their own category

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 14, height: 44, justifyContent: "center", width: 44 }}>
              <Users color={colors.primary} size={22} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Team
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "600" }} selectable>
                Staff management
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StaffMetricBox hint="Incl. managers" label="Team" value={String(totalStaff)} />
            <StaffMetricBox hint="Est. this month" label="Payout" value={compactMoneyPaise(payoutPaise)} />
            <StaffMetricBox hint="Incl. managers" label="Categories" value={String(totalCategories)} />
          </View>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

// Money-out counterpart to the staff card: this month's spend against the
// budget, opening the expense tracker. Reads the same budget overview the tool
// itself uses, so figures (incl. projected salary) always agree with it.
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
            <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 14, height: 44, justifyContent: "center", width: 44 }}>
              <Wallet color={colors.accent} size={22} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Money out
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "600" }} selectable>
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
      <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} numberOfLines={1} selectable>
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
        selectable
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
      <Text style={[type.caption, { color: colors.kicker }]} numberOfLines={1} selectable>
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
  const iconBg =
    tone === "danger" ? colors.dangerSoft : tone === "accent" ? colors.accentSoft : tone === "jade" ? colors.jadeSoft : colors.primarySoft;
  const iconColor =
    tone === "danger" ? colors.danger : tone === "accent" ? colors.accent : tone === "jade" ? colors.jade : colors.primary;

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
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: iconBg,
            borderRadius: 12,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Icon color={iconColor} size={18} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]} numberOfLines={1} selectable>
              {item.title}
            </Text>
            <Text style={[type.caption, { color: colors.kicker }]} selectable>
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
          <Text style={[type.caption, subtitleColor]} numberOfLines={expanded ? undefined : COLLAPSED_ACTIVITY_LINES} selectable>
            {item.subtitle}
          </Text>

          {canExpand ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 3, marginTop: 1 }}>
              <Text style={[type.caption, { color: colors.primary, fontWeight: "700" }]} selectable>
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
  hint,
  highlight,
  icon: Icon,
  label,
  onPress,
  value,
}: {
  hint: string;
  highlight: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const { colors, fonts, isDark, type } = useTheme();
  const accent = highlight ? colors.primary : colors.muted;

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
      <View
        style={{
          alignItems: "center",
          backgroundColor: highlight ? colors.primarySoft : colors.surfaceSunken,
          borderColor: highlight ? colors.primarySoft : colors.border,
          borderCurve: "continuous",
          borderRadius: 13,
          borderWidth: 1,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Icon color={highlight ? colors.primary : colors.muted} size={20} strokeWidth={2.25} />
      </View>
      <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} numberOfLines={1} selectable>
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? colors.primary : colors.ink,
          fontFamily: fonts.display,
          fontSize: 25,
          fontVariant: ["tabular-nums"],
          fontWeight: "600",
          letterSpacing: -0.5,
          lineHeight: 30,
          textAlign: "center",
        }}
        numberOfLines={1}
        selectable
      >
        {value}
      </Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
        <View
          style={{
            backgroundColor: highlight ? colors.primary : colors.border,
            borderRadius: 999,
            height: 6,
            width: 6,
          }}
        />
        <Text style={[type.caption, { color: accent, textAlign: "center" }]} numberOfLines={1} selectable>
          {hint}
        </Text>
      </View>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Occupancy rate
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, fontWeight: "600", letterSpacing: -0.5, lineHeight: 38 }} selectable>
            {rate}%
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            {awaiting ? "Collectable this month" : "Collection rate"}
          </Text>
          <Text style={{ color: tone, fontFamily: fonts.display, fontSize: 34, fontWeight: "600", letterSpacing: -0.5, lineHeight: 38 }} selectable>
            {awaiting ? formatMoneyPaise(collectable) : `${rate}%`}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
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
          <Text style={[type.eyebrow, { color: tone }]} selectable>
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
          borderColor: selectedProperty ? colors.border : colors.primary,
          borderCurve: "continuous",
          borderRadius: 18,
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
            {eyebrowLabel}
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
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
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
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1,
            gap: spacing.xs,
            overflow: "hidden",
            padding: spacing.xs,
          }}
        >
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
                  borderCurve: "continuous",
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
                  <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
                    {[property.city, property.state, property.pincode].filter(Boolean).join(", ")}
                  </Text>
                </View>
                {selected ? <Check color={colors.primary} size={18} strokeWidth={2.4} /> : null}
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
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            {label}
          </Text>
          <Text numberOfLines={2} style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
            {locationText}
          </Text>
          {detailParts.length > 0 && locationText !== detailParts.join(", ") ? (
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]} selectable>
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
