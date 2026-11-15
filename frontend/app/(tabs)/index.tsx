import { PriorityChip } from "@/features/notice/notice-ui";
import { RollCallHomeCard } from "@/features/roll-call/roll-call-home-card";
import { BookingsArt, DepositSafeArt, ExpensesArt, ExpenseTrackerArt, LeadsArt, PaymentClaimsArt, ProfitLossArt, ServiceBalanceArt, VacancyFinderArt, VisitorDeskArt } from "@/features/owner/home-tool-art";
import { NoticeArt, type ModuleArt } from "@/features/owner/workspace-module-icons";
import { LoadFailed, loadFailure } from "@/components/load-failed";
import { WrapTitle } from "@/components/wrap-title";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Image, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurTargetView, BlurView } from "expo-blur";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { attentionCount } from "@/features/owner/action-center";
import { HomeQuickActions } from "@/features/quick-actions/home-quick-actions";
import { NoticeBoardHomeCard } from "@/features/notice/notice-board-ui";
import { TenantStatusBar, YellowBell3D } from "@/features/tenant-home/tenant-status-bar";
import { ActionCenter3D } from "@/components/action-center-3d";
import { useLocationWatcher } from "@/features/location/use-location-watcher";
import { PropertyCardScenery, propertyCardGround } from "@/components/property-card-scenery";
import { PropertyHouseIcon } from "@/components/property-house-icon";
import { TenancyToolsHomeCard } from "@/features/tenancy/tenancy-tools";
import { MealScanHomeCard } from "@/features/food/meal-attendance-ui";
import { MealPassCard } from "@/features/food/meal-pass";
import { MealRatingButton } from "@/features/food/meal-rating";
import { useFocusEffect } from "expo-router";
import { useDoubleBackToExit } from "@/navigation/use-double-back-to-exit";
import { Activity, AlertCircle, ChartPie, AlertTriangle, Ban, Banknote, BedDouble, Bell, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Compass, FileText, Home, Info, KeyRound, LayoutGrid, LocateFixed, Lock, LogOut, Clock3, type LucideProps, MapPin, Megaphone, MessageSquareWarning, Navigation, Pin, ReceiptText, RefreshCw, RotateCcw, Search, Settings, ShieldCheck, UserMinus, UserPlus, UserRound, Users, Waves, Wrench, LockOpen, X } from "lucide-react-native";
import { BookingsIcon } from "@/features/property/property-control-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Path, Rect } from "react-native-svg";

import { clearStoredSession } from "@/auth/session-storage";
import { PropertyIcon } from "@/components/property-icon";
import { RupeeBanknoteIcon } from "@/components/rupee-banknote-icon";
import { LeadsInsightsIcon } from "@/components/leads-insights-icon";
import { ScreenHeader } from "@/components/screen-header";
import { useToast } from "@/components/toast";
import { takeWelcome } from "@/features/auth/pending-welcome";
import { PropertyArtwork } from "@/components/artwork-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilterPillRow } from "@/components/filter-bubbles";
import { HeaderNote } from "@/components/header-note";
import { MarqueeText } from "@/components/marquee-text";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { Section } from "@/components/section";
import { Skeleton, SkeletonCard, SkeletonPills, SkeletonScreen, SkeletonTiles } from "@/components/skeleton";
import {
  OwnerDashboardDataSkeleton,
  OwnerDigestCardSkeleton,
  OwnerLiveDigestSkeleton,
  OwnerPinnedServicesSkeleton,
  OwnerPropertySelectorSkeleton,
} from "@/components/skeletons/owner";
import { api } from "@/store/api";
import { getGreeting } from "@/features/greeting/get-greeting";
import {
  PropertyBoardHomeCard,
  selectPropertyBoardPreviewItems,
} from "@/features/property-board/property-board-ui";
import { formatFloor } from "@/features/property/floor";
import { saveActiveAccount } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import { useSearchDiscoveryPropertiesQuery } from "@/store/services/discovery-api";
import type { NoticeSummary } from "@/store/services/notice-api";
import {
  useListMyPropertyBoardItemsQuery,
  useListMyVisibleNoticesQuery,
  useListUpcomingNoticesQuery,
} from "@/store/services/notice-api";
import {
  useGetOwnerDashboardQuery,
  type BudgetAttentionLevel,
  type OwnerDashboard,
  type ActivityDayBucket,
  type RecentActivityType,
  type RecentActivityItem,
} from "@/store/services/dashboard-api";
import { useGetBudgetOverviewQuery } from "@/store/services/expense-api";
import { useGetPnlStatementQuery, type PnlStatement } from "@/store/services/pnl-api";
import { findOwnerModule } from "@/features/owner/owner-modules";
import { useScopedUnreadCount } from "@/features/notifications/alert-filters";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useScreenAccessGuard } from "@/features/owner/use-screen-access-guard";
import { stayOutDay } from "@/features/tenancy/stay-out-ui";
import { CardCarousel } from "@/components/card-carousel";
import { StayOutIcon } from "@/components/stay-out-icon";
import { DigestConcernsColorIcon, DigestMoveInsColorIcon, DigestMoveOutsColorIcon, DigestPaymentsColorIcon } from "@/components/digest-color-icons";
import { useGetStayOutBoardQuery } from "@/store/services/stay-out-api";
import { DIVISIONS } from "@/features/analytics/divisions";
import type { AnalyticsDivision } from "@/features/analytics/types";
import { useRouteGate } from "@/features/owner/route-gates";
import { workingDaysInCurrentMonth } from "@/features/owner/working-days";
import { type MealType, type OwnerProperty } from "@/store/services/property-api";
import { useListManagerEmploymentQuery, useListStaffCategoriesQuery, useListStaffMembersQuery } from "@/store/services/staff-api";
import { useGetMyActiveTenancyQuery, type TenantActiveTenancy } from "@/store/services/tenancy-api";
import { accountLabel, useAvailableAccounts } from "@/features/account/accounts";
import { fetchCurrentLocation, type DeviceLocationState } from "@/store/slices/location-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { clearSession } from "@/store/slices/auth-slice";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import type { PaymentIntentDigest } from "@/store/services/payment-intent-api";
import { useGetServiceBalanceQuery } from "@/store/services/service-balance-api";
import { useGetLeadInsightsQuery, useGetPropertyLeadCountsQuery } from "@/store/services/lead-api";
import { leadsInPlay } from "@/features/lead/lead-display";
import {
  useGetMyFoodAvailabilityQuery,
  useGetMyFoodSubscriptionQuery,
  useGetMyMealScheduleQuery,
  type FoodPlan,
} from "@/store/services/food-api";
import { MealGlyph, MEAL_LABEL, foodIcon, formatMealTime, formatMealWindow } from "@/features/food/food-ui";
import { ServingMealCard, mealSkyInk, mealSkyMuted } from "@/features/food/serving-meal-card";
import { ActionButton } from "@/features/owner/owner-ui";
import { DelayedChip } from "@/features/food/meal-schedule-ui";
import { TenancyStartsSoonBubble } from "@/features/tenancy/starts-soon-bubble";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { metricFontSize } from "@/theme/metric-size";
import { useTheme } from "@/theme/use-theme";

/** The tools' coloured vector drawings (user, 2026-11-14), the same subjects as the old pictures. */
const HOME_TOOL_ARTWORK: Record<"bookings" | "deposit" | "expenses" | "pnl" | "vacancy" | "visits", ModuleArt> = {
  bookings: BookingsArt,
  deposit: DepositSafeArt,
  expenses: ExpensesArt,
  pnl: ProfitLossArt,
  vacancy: VacancyFinderArt,
  visits: VisitorDeskArt,
};

/** How long Home is on screen before the greeting can appear over it. */
const HOME_SETTLE_MS = 450;
/** The gap between the greeting and the location permission prompt. */
const LOCATION_PROMPT_DELAY_MS = 700;

export default function HomeScreen() {
  const { colors, fonts, isDark, type } = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const statusGlassTarget = useRef<View | null>(null);
  // A gentle curve kept well inside the strip. At the strip's full height the
  // two quarter-circles met the top edge and the ends looked pinched rather
  // than rounded.
  const statusGlassRadius = Math.round(Math.min(18, safeAreaInsets.top * 0.5));
  const dispatch = useAppDispatch();
  // The place at the top follows the device when it moves (user, 2026-11-14).
  useLocationWatcher();
  const router = useGuardedRouter();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });
  const user = profileQuery.data ?? auth.user;
  const location = useAppSelector((state) => state.location);

  const { loading: accountsLoading, managedProperties, ownedProperties, propertiesKnown } = useAvailableAccounts();
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const [ownerSelectorOpen, setOwnerSelectorOpen] = useState(false);

  // Home first, then anything that talks over it. The sign-in greeting and the
  // location permission prompt both used to fire before Home had painted —
  // the prompt from this screen's first effect, the greeting from the sign-in
  // screen — so they appeared over the loading screen. They now wait until
  // Home has been on screen for a beat. If the tabs layout swaps Home back out
  // for the loading screen in that window, the cleanup cancels and the next
  // mount tries again, so neither can land on the wrong screen.
  const toast = useToast();
  const [homeSettled, setHomeSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHomeSettled(true), HOME_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!homeSettled) {
      return;
    }
    const welcome = takeWelcome();
    if (welcome) {
      toast.success(welcome);
    }
    // takeWelcome is one-shot, so this must run once per settle, not per toast
    // identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeSettled]);

  useEffect(() => {
    if (!homeSettled || location.status !== "idle") {
      return;
    }
    // A moment after the greeting, so the toast is seen before the system
    // dialog dims the screen.
    const timer = setTimeout(() => void dispatch(fetchCurrentLocation()), LOCATION_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dispatch, homeSettled, location.status]);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = getDisplayFirstName(user?.fullName);

  const isManagerAccount = activeAccount === "manager";
  const isWorkspace = activeAccount === "owner" || isManagerAccount;
  const isTenantAccount = activeAccount === "tenant";
  const hasBlueHomeHeader = isWorkspace || isTenantAccount;
  const ownerHeaderSecondary = isDark ? "rgba(5, 5, 5, 0.70)" : "rgba(255, 255, 255, 0.82)";
  const ownerHeaderAccent = isDark ? "rgba(5, 5, 5, 0.88)" : "#DCE8FF";

  // Recent activity for the header's latest-events button (deduped with the
  // dashboard query rendered inside the workspace view).
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const workspaceProperties = isManagerAccount ? managedProperties : ownedProperties;
  const selectedWorkspaceProperty = resolveSelectedProperty(workspaceProperties, selectedPropertyId);
  const headerDashboardQuery = useGetOwnerDashboardQuery(selectedWorkspaceProperty?.id ?? "", {
    skip: !isWorkspace || !selectedWorkspaceProperty,
    refetchOnMountOrArgChange: true, refetchOnFocus: true, refetchOnReconnect: true,
    pollingInterval: 60_000, skipPollingIfUnfocused: true,
  });
  useFocusEffect(useCallback(() => {
    if (isWorkspace && selectedWorkspaceProperty && !headerDashboardQuery.isUninitialized) void headerDashboardQuery.refetch();
  }, [isWorkspace, selectedWorkspaceProperty?.id, headerDashboardQuery.isUninitialized, headerDashboardQuery.refetch]));
  // One back on Home only warns, a second closes the app (user, 2026-11-09).
  useDoubleBackToExit();
  const headerRecentActivity = headerDashboardQuery.currentData?.recentActivity ?? [];
  const headerAttentionCount = attentionCount(headerDashboardQuery.currentData);
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
    <View style={{ flex: 1 }}>
    {/* The blur's source on Android. BlurView there can only blur what sits
        inside a BlurTargetView, so the whole scroll view lives in one; the glass
        strip is its sibling, outside it, so it never blurs itself. */}
    <BlurTargetView ref={statusGlassTarget} style={{ flex: 1 }}>
    <ScreenScrollView
      // Home's banner scrolls with the page; it is not a docked ScreenHeader.
      // Opt out explicitly so its component name cannot trigger auto-pinning.
      stickyHeaderIndices={[]}
      // Flush to the safe area, unlike every other screen. Home opens on the
      // location bar and the greeting rather than a title, and the gap that
      // gives a heading room reads as a band of nothing above a greeting.
      contentContainerStyle={{
        gap: isWorkspace ? 0 : spacing.lg,
        paddingBottom: isWorkspace && ownerSelectorOpen ? spacing.xs : undefined,
        paddingTop: 0,
      }}
      scrollOnlyWhenNeeded={isWorkspace && ownerSelectorOpen}
      // No top safe area: the glass strip below sits over the status bar
      // instead. A safe area would stop the page at the clock and leave a strip
      // that has to be recoloured as the page scrolls; glass takes its colour
      // from whatever passes beneath it, so it never needs to.
      refreshOffset={safeAreaInsets.top}
      safeAreaEdges={["bottom"]}
    >
      {/* Left column stacks the location bar and the greeting so the greeting
          hugs the location; the profile + live-events stay pinned top-right. */}
      {isWorkspace ? (
        <WorkspaceHomeHeader
          firstName={firstName}
          greeting={greeting}
          location={location}
          onRefreshLocation={() => void dispatch(fetchCurrentLocation())}
          subtitle={subtitle}
          topInset={safeAreaInsets.top}
        >
          {/* A 3D action centre, then the tenant's yellow 3D bell, no recent-activity icon (user, 2026-11-14). */}
          <HomeAttentionButton colored count={headerAttentionCount} disabled={awaitingPropertyChoice} inverse onPress={() => router.push("/owner-action-center")} />
          <HomeAlertsButton disabled={awaitingPropertyChoice} inverse onPress={() => router.push("/notifications")} yellow />
        </WorkspaceHomeHeader>
      ) : isTenantAccount ? (
        // No blue band, greeting or description for a tenant (user, 2026-11-10):
        // the location on top with a yellow bell, then the launcher's status bar.
        <View style={{ gap: spacing.md, paddingTop: safeAreaInsets.top + spacing.sm }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <HomeLocationBar compact location={location} onRefresh={() => void dispatch(fetchCurrentLocation())} />
            </View>
            <HomeAlertsButton onPress={() => router.push("/notifications")} yellow />
          </View>
          <TenantStatusBar />
        </View>
      ) : (
      <View
        style={{
          alignItems: "flex-start",
          backgroundColor: hasBlueHomeHeader ? colors.primary : "transparent",
          borderBottomLeftRadius: isTenantAccount ? 18 : 0,
          borderBottomRightRadius: isTenantAccount ? 18 : 0,
          borderCurve: "continuous",
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "space-between",
          marginHorizontal: hasBlueHomeHeader ? -spacing.lg : 0,
          paddingBottom: hasBlueHomeHeader ? spacing.lg : 0,
          paddingHorizontal: hasBlueHomeHeader ? spacing.lg : 0,
          // The status-bar strip is part of the blue band rather than a safe
          // area above it, so the fill runs to the top of the display. Padding
          // rather than a painted lid: a lid would have to change colour as the
          // band scrolls past it, and a colour that changes mid-scroll draws
          // more attention than the content passing under the clock does. The
          // extra sm is the gap the old safe area used to give for free —
          // padding of exactly the inset put the location bar against it.
          //
          // The other Home modes pad by the inset too, now that no mode takes
          // a top safe area: their header starts below the clock, and what
          // scrolls up passes under it.
          paddingTop: safeAreaInsets.top + (hasBlueHomeHeader ? spacing.sm : 0),
        }}
      >
        <View style={{ flex: 1, gap: spacing.sm }}>
          <HomeLocationBar
            compact={hasBlueHomeHeader}
            inverse={hasBlueHomeHeader}
            location={location}
            onRefresh={() => void dispatch(fetchCurrentLocation())}
          />
          <View style={{ gap: spacing.xs }}>
            <Text
              style={{
                color: hasBlueHomeHeader ? colors.onPrimary : colors.ink,
                fontFamily: fonts.display,
                fontSize: hasBlueHomeHeader ? 22 : 30,
                letterSpacing: -0.4,
                lineHeight: hasBlueHomeHeader ? 28 : 36,
              }}
            >
              {greeting},{" "}
              <Text
                style={{
                  color: hasBlueHomeHeader ? ownerHeaderAccent : colors.primary,
                  fontStyle: "italic",
                  fontWeight: "400",
                }}
              >
                {firstName}.
              </Text>
            </Text>
            {hasBlueHomeHeader ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  maxWidth: 430,
                }}
              >
                <View
                  style={{
                    alignSelf: "stretch",
                    backgroundColor: ownerHeaderAccent,
                    borderRadius: 2,
                    width: 4,
                  }}
                />
                <FitText
                  numberOfLines={2}
                  style={[
                    type.body,
                    {
                      color: ownerHeaderSecondary,
                      flex: 1,
                      fontSize: 11,
                      lineHeight: 15,
                    },
                  ]}
                >
                  {subtitle}
                </FitText>
              </View>
            ) : (
              <HeaderNote>{subtitle}</HeaderNote>
            )}
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
            inverse={hasBlueHomeHeader}
            onPress={() => router.push("/notifications")}
          />
          {isWorkspace ? (
            <>
              <LatestEventsButton
                activity={headerRecentActivity}
                disabled={awaitingPropertyChoice}
                inverse
                propertyName={selectedWorkspaceProperty?.name ?? null}
              />
              <HomeAttentionButton
                count={headerAttentionCount}
                disabled={awaitingPropertyChoice}
                inverse
                onPress={() => router.push("/owner-action-center")}
              />
            </>
          ) : null}
        </View>
      </View>
      )}

      {/* The greeting and other static chrome stay visible. Only the account or
          property content that is actually waiting on an API response ghosts. */}
      {accountsLoading ? (
        isWorkspace ? <OwnerPropertySelectorSkeleton /> : <SkeletonCard />
      ) : isWorkspace ? (
        <OwnerHome
          account={isManagerAccount ? "manager" : "owner"}
          onNavigate={router.push}
          onSelectorOpenChange={setOwnerSelectorOpen}
          properties={isManagerAccount ? managedProperties : ownedProperties}
          propertiesKnown={propertiesKnown}
        />
      ) : activeAccount === "tenant" ? (
        <TenantHome
          onNavigate={router.push}
          onOpenBoardItem={(itemId) => {
            router.push({ pathname: "/property-board", params: { itemId } });
          }}
        />
      ) : (
        <NonTenantHome onNavigate={router.push} />
      )}
    </ScreenScrollView>
    </BlurTargetView>

      {/* Frosted glass over the status bar. Content scrolls up beneath it and
          shows through blurred and softened, so the clock stays readable
          without the page ever sitting on top of it — and at rest over the
          workspace's blue band it simply reads as that blue, frosted.

          The lightest wash expo-blur offers. On Android the real blur needs
          API 31 or later; older phones get the translucent wash alone.

          Rounded along the bottom to follow the curve of the phone's own screen
          corners. The rounding and clipping belong to a plain View around the
          blur: a native blur view does not reliably clip itself to a radius on
          Android, but a clipped parent always does. No outline: the tint alone
          sets the glass apart from the band beneath it, and a bottom-only
          border faded out before the corners, which made the edge look rough. */}
      <View
        pointerEvents="none"
        style={{
          borderBottomLeftRadius: statusGlassRadius,
          borderBottomRightRadius: statusGlassRadius,
          height: safeAreaInsets.top,
          left: 0,
          overflow: "hidden",
          position: "absolute",
          right: 0,
          top: 0,
        }}
      >
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={statusGlassTarget}
          intensity={isDark ? 55 : 60}
          style={StyleSheet.absoluteFill}
          tint={isDark ? "dark" : "default"}
        />
      </View>
    </View>
  );
}

/** Only the owner/manager banner changes; tenant and discovery Home keep their header. */
function WorkspaceHomeHeader({
  children,
  firstName,
  greeting,
  location,
  onRefreshLocation,
  subtitle,
  topInset,
}: {
  children: ReactNode;
  firstName: string;
  greeting: string;
  location: DeviceLocationState;
  onRefreshLocation: () => void;
  subtitle: string;
  topInset: number;
}) {
  const { colors } = useTheme();

  // No greeting or description (user, 2026-11-14): the location with the bell and
  // action centre beside it in one row, so the property card rises into the space.
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.primary, flexDirection: "row", gap: spacing.sm, marginHorizontal: -spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <HomeLocationBar compact inverse location={location} onRefresh={onRefreshLocation} />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {children}
      </View>
    </View>
  );
}

// Device-location bar pinned to the top-left of every home view: a navigation
// glyph, a short place label with a chevron affordance, and the full address
// below. Tapping it re-fetches the current location.
function HomeLocationBar({
  compact = false,
  inverse = false,
  location,
  onRefresh,
}: {
  compact?: boolean;
  inverse?: boolean;
  location: DeviceLocationState;
  onRefresh: () => void;
}) {
  const { colors, fonts, isDark, type } = useTheme();
  const busy = location.status === "loading" || location.status === "idle";
  const foregroundColor = inverse ? colors.onPrimary : colors.ink;
  const secondaryColor = inverse
    ? isDark
      ? "rgba(5, 5, 5, 0.68)"
      : "rgba(255, 255, 255, 0.76)"
    : colors.muted;
  const locationIconColor = inverse ? colors.onPrimary : colors.primary;

  return (
    <AnimatedPressable
      accessibilityHint="Refresh your current location"
      accessibilityLabel={`Current location: ${locationTitle(location)}`}
      accessibilityRole="button"
      onPress={onRefresh}
      style={{ alignSelf: "stretch", gap: compact ? 0 : 2 }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: compact ? spacing.xxs : spacing.xs }}>
        <Navigation color={locationIconColor} fill={locationIconColor} size={compact ? 13 : 16} strokeWidth={2} />
        <FitText
          numberOfLines={1}
          style={{ color: foregroundColor, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: compact ? 16 : 20, letterSpacing: 0 }}
        >
          {locationTitle(location)}
        </FitText>
        {busy ? (
          <ActivityIndicator color={secondaryColor} size="small" />
        ) : (
          <RefreshCw color={secondaryColor} size={compact ? 12 : 14} strokeWidth={2.4} />
        )}
      </View>
      <FitText numberOfLines={1} style={[type.caption, { color: secondaryColor, fontSize: compact ? 10 : 11 }]}>
        {locationAddress(location)}
      </FitText>
    </AnimatedPressable>
  );
}

function locationTitle(location: DeviceLocationState) {
  if (location.status === "error") {
    return "Location unavailable";
  }
  const label = location.city ?? location.locality;
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


function HomeAttentionButton({
  colored = false,
  count,
  disabled,
  inverse = false,
  onPress,
}: {
  /** The 3D clipboard beside the yellow bell (user, 2026-11-14). */
  colored?: boolean;
  count: number;
  disabled?: boolean;
  inverse?: boolean;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const iconColor = inverse ? colors.onPrimary : colors.ink;

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
      {colored ? <ActionCenter3D size={30} /> : <ClipboardList color={iconColor} size={23} strokeWidth={2.1} />}
      {count > 0 && !disabled ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderColor: inverse ? colors.primary : colors.surface,
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

function HomeAlertsButton({ disabled, inverse = false, onPress, yellow = false }: {
  disabled?: boolean;
  inverse?: boolean;
  onPress: () => void;
  /** The tenant's yellow 3D bell (user, 2026-11-10). */
  yellow?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const auth = useAppSelector((state) => state.auth);
  const unreadCount = useScopedUnreadCount({ enabled: Boolean(auth.accessToken) });
  const iconColor = inverse ? colors.onPrimary : colors.ink;

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
        // Lined up with the tenant's location row. On the owner's band the row centres it (2026-11-14).
        marginTop: inverse ? 0 : 6,
        opacity: disabled ? 0.4 : 1,
        width: 32,
      }}
    >
      {yellow ? <YellowBell3D size={30} /> : <Bell color={iconColor} size={23} strokeWidth={2.1} />}
      {/* The count, not a dot: a bare dot says "something, sometime" and cannot
          be told apart from one you already read. */}
      {unreadCount > 0 && !disabled ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderColor: inverse ? colors.primary : colors.surface,
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

/**
 * The owner's prepaid balance, one tap from Home.
 *
 * <p>Sits ABOVE the workspace card because it is money: an owner should see
 * what they have before they walk into the tools that spend it.
 *
 * <p>Owner-only. A manager runs the property but does not hold the purse, and
 * the server refuses them anyway, so showing them a balance they cannot read
 * would only be a locked door.
 */

function ServiceBalanceCard({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const balanceQuery = useGetServiceBalanceQuery(undefined, { refetchOnFocus: true });
  const balance = balanceQuery.data;
  const unlocked = useWalletUnlocked();
  const [pinOpen, setPinOpen] = useState(false);

  if (!balance && (balanceQuery.isLoading || balanceQuery.isFetching)) return (
    <View accessibilityLabel="Loading wallet balance" style={[homeTileStyle(colors), { justifyContent: "space-between" }]}>
      <Skeleton width={44} height={38} radius={10} />
      <View style={{ gap: 6 }}>
        <Skeleton width={90} height={14} />
        <Skeleton width={110} height={24} />
      </View>
    </View>
  );

  return (
    <>
    <HomeTile
      accessibilityLabel="Service balance"
      artwork={<ServiceBalanceArt size={44} />}
      label="Service balance"
      // Whether the wallet asks for a PIN, not the balance (user, 2026-11-07).
      note={balance?.walletLockEnabled ? "Secured with PIN" : "Not secured"}
      noteIcon={balance?.walletLockEnabled ? Lock : LockOpen}
      onPress={() => { if (balance?.walletLockEnabled && !unlocked) setPinOpen(true); else onPress(); }}
    />
    {pinOpen ? <WalletPinModal onCancel={() => setPinOpen(false)} onUnlocked={() => { setPinOpen(false); onPress(); }} /> : null}
    </>
  );
}

function homeTileStyle(colors: { border: string; shadow: string; surface: string }) {
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: "continuous" as const,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minHeight: 132,
    padding: spacing.md,
    ...cardShadow(colors.shadow),
  };
}

/**
 * A Home tile (user, 2026-11-07): its artwork and an arrow on top, then what it is, the
 * figure, and one line under it. Service balance and Leads sit as a pair of these.
 */
function HomeTile({
  accessibilityLabel,
  artwork,
  label,
  note,
  noteIcon: NoteIcon,
  onPress,
}: {
  accessibilityLabel: string;
  artwork: ReactNode;
  label: string;
  note: string;
  /** A glyph before the line under the title, such as the wallet's lock. */
  noteIcon?: ComponentType<LucideProps>;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={{ flex: 1 }}>
      <View style={homeTileStyle(colors)}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
          {artwork}
          <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2, justifyContent: "flex-end" }}>
          {/* The title leads, bold, and the figure follows in plain weight (user, 2026-11-07). */}
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>{label}</FitText>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
            {NoteIcon ? <NoteIcon color={colors.muted} size={13} strokeWidth={2.2} /> : null}
            <Text numberOfLines={1} style={{ color: colors.muted, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 }}>{note}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

/**
 * Property Leads, under the Service Balance card (user, 2026-10-17): the way
 * into the Leads workspace, with how many leads are in play and how many are
 * going cold. Owner and managers alike: leads are open to everyone who
 * manages the property, by the owner's decision.
 */

function PropertyLeadsCard({ onPress, propertyId }: { onPress: () => void; propertyId: string }) {
  const { colors } = useTheme();
  const countsQuery = useGetPropertyLeadCountsQuery(propertyId, { refetchOnFocus: true });
  const counts = countsQuery.currentData;
  const inPlay = leadsInPlay(counts);
  return (
    // The "Property Leads" header stays off (user, 2026-10-27): the tile's label says Leads.
    <HomeTile
      accessibilityLabel="Property Leads"
      artwork={<LeadsArt size={42} />}
      label="Leads workspace"
      note={inPlay == null ? "—" : `${inPlay} active ${inPlay === 1 ? "lead" : "leads"}`}
      onPress={onPress}
    />
  );
}

/**
 * Bookings to onboard today (user, 2026-10-27): confirmed, moving in today,
 * nobody moved in yet. Pale yellow with the Bookings calendar mark, under
 * Property Leads, and only when there is at least one. Opens the booking
 * onboarding screen, on its Today tab.
 */
function MoveInsTodayCard({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const label = count === 1 ? "1 booking to onboard today" : `${count} bookings to onboard today`;
  return (
    <AnimatedPressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.warningSoft,
          borderCurve: "continuous",
          borderRadius: radii.card,
          flexDirection: "row",
          gap: spacing.sm,
          // Smaller than the two cards above it (user, 2026-10-27): one line, a small mark.
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          ...cardShadow(colors.shadow),
        }}
      >
        <BookingsIcon size={24} />
        <FitText numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{label}</FitText>
        <ChevronRight color={colors.warningText} size={16} strokeWidth={2.2} />
      </View>
    </AnimatedPressable>
  );
}

// Header button for the dashboard's latest events. Opens the full-screen feed,
// and shows a blinking dot when a new event arrives.
function LatestEventsButton({
  activity,
  disabled,
  inverse = false,
  propertyName,
}: {
  activity: RecentActivityItem[];
  disabled?: boolean;
  inverse?: boolean;
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
        {/* A timeline with a clock: what happened recently. The radar it replaced read as scanning for something. */}
        <MaterialCommunityIcons color={inverse ? colors.onPrimary : colors.ink} name="timeline-clock-outline" size={24} />
        {hasNew && !disabled ? <BlinkingDot inverse={inverse} /> : null}
      </AnimatedPressable>
      {open ? (
        <LatestEventsModal activity={activity} onClose={() => setOpen(false)} propertyName={propertyName} />
      ) : null}
    </>
  );
}

function BlinkingDot({ inverse = false }: { inverse?: boolean }) {
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
        borderColor: inverse ? colors.primary : colors.surface,
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
  TENANT_ONBOARDED: "tenancy",
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
    // A full screen rather than a sheet over Home. The feed is a thing you read
    // through, filter and scroll, and at 85% of the height with Home dimmed
    // behind it, it read as a popup to dismiss rather than a place to be.
    // The device back button runs the same close as the arrow (onRequestClose).
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingBottom: insets.bottom + spacing.md,
            paddingTop: insets.top + spacing.sm,
          }}
        >
          {/* No back row: the title leads the screen, and the device back
              button closes it (onRequestClose above). The property sits in the
              subtitle, because the feed only ever covers one and a reader with
              several needs to know which. */}
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
            <ScreenHeader
              subtitle={propertyName ? `Activity in ${propertyName}` : undefined}
              title="Latest events"
            />
          </View>

          {!propertyName ? (
            <ActivityNoPropertyState />
          ) : (
          <>
          {/* Always present, including on an empty feed: the chips tell the owner
              what this screen will eventually carry. */}
          {/* No counts on the pills. Each day header already reports how many
              rows it holds UNDER THE CURRENT FILTER — `groups` is built from the
              filtered list — so a count on the pill was the same number said
              twice, and the two disagreed the moment a day was collapsed. */}
          <View style={{ paddingVertical: spacing.sm }}>
            <FilterPillRow
              inset
              onChange={setCategory}
              options={ACTIVITY_CATEGORY_ORDER.map((item) => ({
                label: ACTIVITY_CATEGORY_LABEL[item],
                value: item,
              }))}
              value={category}
            />
          </View>

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
            {groups.map((group) => (
              <ActivityDaySection
                bucket={group.bucket}
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
  items,
  onToggle,
  open,
}: {
  bucket: ActivityDayBucket;
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
    <View style={open ? { flexGrow: 1, marginBottom: spacing.sm } : { marginBottom: spacing.sm }}>
      {/* The notice-board shape: a hairline card with a thick rule along the
          bottom. Replaces a grey gradient wash and a left ink rail — the wash
          read as a disabled row against the flat white cards below it, and the
          rail said only "this day has something in it", which the count beside
          it already said. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          // The same grey as the hairline around it, just heavier — the card
          // gains a weighted base without the rule becoming a colour with
          // something to say. A tone per day was tried and read as three
          // statuses rather than three dates.
          borderBottomColor: colors.borderStrong,
          // Thick enough to be the thing you see first, matching NoticeBar.
          borderBottomWidth: 5,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
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
          <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
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
        <PropertyArtwork size={34} />
      </View>
      <Text
        style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
      >
        Choose a property first
      </Text>
      <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
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
      <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
        Property events for last 7 days will appear here
      </Text>
    </View>
  );
}

function TenantHome({
  onNavigate,
  onOpenBoardItem,
}: {
  onNavigate: (href: "/tenancy" | "/property-board" | "/property-notices" | "/discovery" | "/concerns" | "/tenancy-food") => void;
  onOpenBoardItem: (itemId: string) => void;
}) {
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const activeTenancy = activeTenancyQuery.data;
  // Until the agreement is signed the stay has not begun: food, the property
  // board and notices are the property's own business with its tenants, and
  // stay closed (owner's decision, 2026-09-27). Not even fetched.
  const awaitingSignature = activeTenancy?.tenancy.status === "PENDING_ACCEPTANCE";
  const boardQuery = useListMyPropertyBoardItemsQuery(undefined, { skip: awaitingSignature });
  // Checked every minute and on return, so a notice that goes live shows without a reload (user, 2026-11-14).
  const noticesQuery = useListMyVisibleNoticesQuery(undefined, { pollingInterval: 60_000, refetchOnFocus: true, skip: awaitingSignature });
  // Availability only (is there food here at all), so the locked card shows
  // where the real one would. Nothing about the tenant's meals is read.
  const foodQuery = useGetMyFoodAvailabilityQuery(undefined, { skip: !activeTenancy });
  const boardItems = selectPropertyBoardPreviewItems(boardQuery.data ?? []);
  const noticeCount = noticesQuery.data?.length ?? 0;
  const notices = [...(noticesQuery.data ?? [])].sort(compareNoticePriority).slice(0, 3);

  const loadFailed = loadFailure(activeTenancyQuery);
  if (loadFailed) {
    return <LoadFailed error={loadFailed.error} onReload={loadFailed.reload} />;
  }

  if (activeTenancyQuery.isFetching && !activeTenancy) {
    return (
      <SkeletonScreen cards={3} header={false} rows={0} tiles={0} />
    );
  }

  if (!activeTenancy) {
    return (
      <EmptyState
        icon={Home}
        title="No active stay loaded"
        description="Your tenant dashboard appears once your active tenancy profile is available."
      />
    );
  }

  return (
    <>
      {/* No property card at the top of a tenant's Home (user, 2026-11-09). */}
      {/* Before the start date only. Nothing renders once the stay has begun. */}
      <TenancyStartsSoonBubble startDate={activeTenancy.tenancy.startDate} />

      {/* Six tools and View more, above the meals (user, 2026-11-10). */}
      <TenancyToolsHomeCard />

      {/* Tonight's roll call, directly under the first card, only while its window is open (user, 2026-11-09). */}
      {awaitingSignature ? null : <RollCallHomeCard />}

      {foodQuery.data?.foodAvailableInProperty ? (
        awaitingSignature ? (
          // Locked, a tap goes to where the agreement is signed.
          <ActionCard
            description="Sign agreement to unlock"
            icon={foodIcon("silverware-fork-knife")}
            onPress={() => onNavigate("/tenancy")}
            title="Food preference"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            <MealPassCard skip={!foodQuery.data.moduleEnabled} />
            <FoodPreferenceHomeCard
              moduleEnabled={foodQuery.data.moduleEnabled}
              onPress={() => onNavigate("/tenancy-food")}
            />
          </View>
        )
      ) : null}

      {/* The two boards in one carousel, the notice board first (user, 2026-11-10).
          Both the same height, the empty notice board as tall as three board notes. */}
      <CardCarousel
        pages={[
          {
            key: "notices",
            node: awaitingSignature ? (
              <NoticeBoardHomeCard
                fill
                lockedText="Sign agreement to unlock"
                noticeCount={0}
                notices={[]}
                onPress={() => onNavigate("/tenancy")}
              />
            ) : noticesQuery.isFetching && !noticesQuery.data ? (
              <SkeletonCard />
            ) : (
              <NoticeBoardHomeCard
                fill
                noticeCount={noticeCount}
                notices={notices}
                onPress={() => onNavigate("/property-notices")}
              />
            ),
          },
          {
            key: "board",
            node: boardQuery.isFetching && !boardQuery.data ? (
              <SkeletonCard />
            ) : (
              <PropertyBoardHomeCard
                fill
                items={boardItems}
                lockedText={awaitingSignature ? "Sign agreement to unlock" : undefined}
                onOpenBoard={() => onNavigate(awaitingSignature ? "/tenancy" : "/property-board")}
                onOpenItem={(item) => onOpenBoardItem(item.id)}
              />
            ),
          },
        ]}
      />

    </>
  );
}

const FoodPlanIcon = foodIcon("silverware-fork-knife");

/**
 * The tenant's food card on Home (user, 2026-11-09): the next meal on that
 * meal's own sky, the meal pass's colours and drawings (dawn for breakfast, day
 * for lunch, night for dinner), with the tenant's plan and the way in on the
 * same sky. After the day's last meal it shows the night sky. Which meal is next
 * comes from the server's meal schedule, the same one the owner's forecast and
 * the food screen read.
 */
function FoodPreferenceHomeCard({
  moduleEnabled,
  onPress,
}: {
  moduleEnabled: boolean;
  onPress: () => void;
}) {
  const { fonts } = useTheme();
  // The server's meal day (2026-09-28): the next meal, its time and any delay.
  // Nothing is next once the day's last meal is over, until midnight.
  const upcoming = useGetMyMealScheduleQuery().data?.nextMeal ?? null;
  const subscriptionQuery = useGetMyFoodSubscriptionQuery(undefined, { skip: !moduleEnabled });
  const planCopy = foodPlanCopy(subscriptionQuery.data ?? null);
  const mealType = upcoming?.mealType ?? "DINNER";
  const muted = mealSkyMuted(mealType);
  const ink = mealSkyInk(mealType);

  return (
    <ServingMealCard
      meal={upcoming ?? { endTime: "00:00", mealType: "DINNER", startTime: "00:00" }}
      showWindow={Boolean(upcoming)}
      title={
        upcoming
          ? `${MEAL_LABEL[upcoming.mealType]}, ${upcoming.status === "SERVING" ? "serving now" : "up next"}`
          : "Meals done for today"
      }
    >
      {upcoming && upcoming.delayMinutes > 0 ? (
        <View style={{ alignSelf: "flex-start" }}>
          <DelayedChip minutes={upcoming.delayMinutes} />
        </View>
      ) : null}
      {/* The plan, label over value, on the same sky. */}
      <View style={{ borderTopColor: "rgba(255, 255, 255, 0.28)", borderTopWidth: 1, gap: 2, paddingTop: spacing.sm }}>
        <Text style={{ color: muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>Your plan</Text>
        {moduleEnabled ? (
          <>
            <FitText numberOfLines={1} style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 18 }}>
              {planCopy.name}
            </FitText>
            {planCopy.note ? (
              <Text style={{ color: muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>{planCopy.note}</Text>
            ) : null}
          </>
        ) : (
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
            Your property manages your meals directly.
          </Text>
        )}
      </View>
      {/* Rating the last meal is a button here, not a card of its own (user, 2026-11-10). */}
      <MealRatingButton skip={!moduleEnabled} />
      {/* A white button on the sky, as the meal pass's Scan button is. */}
      <AnimatedPressable
        accessibilityLabel="Meals and plan"
        accessibilityRole="button"
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderCurve: "continuous",
          borderRadius: radii.card - 2,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "center",
          minHeight: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <FoodPlanIcon color={ink} size={18} />
        <Text style={{ color: ink, fontFamily: fonts.sansBold, fontSize: 14 }}>Meals and plan</Text>
        <ChevronRight color={ink} size={17} strokeWidth={2.2} />
      </AnimatedPressable>
    </ServingMealCard>
  );
}

/**
 * Compact plan copy for the Home card.
 */
function foodPlanCopy(plan: FoodPlan | null): { name: string; note: string | null } {
  const today = plan?.today ?? null;
  const next = plan?.fromTomorrow ?? null;
  if (!today) {
    return next ? { name: foodPlanName(next), note: "Starts tomorrow" } : { name: "No plan selected", note: null };
  }
  const name = foodPlanName(today);
  if (plan?.endsTonight) {
    return { name, note: "Ends tonight" };
  }
  if (next) {
    return { name, note: `Switches to ${foodPlanName(next)} tomorrow` };
  }
  return { name, note: null };
}

function foodPlanName(plan: NonNullable<FoodPlan["today"]>): string {
  return plan.hybrid ? "Hybrid" : plan.profileName ?? "Plan selected";
}

type OwnerRoute =
  | "/owner"
  | "/owner-tenancy"
  | "/owner-action-center"
  | "/owner-billing"
  | "/owner-deposit-manager"
  | "/owner-onboard-tenant"
  | "/owner-exit-requests"
  | "/owner-exits-today"
  | "/owner-stay-outs"
  | "/owner-payments-today"
  | "/owner-move-ins-today"
  | "/owner-concerns-today"
  | "/owner-room-change-requests"
  | "/owner-property"
  | "/owner-rooms"
  | "/owner-notices"
  | "/owner-upcoming-notices"
  | "/owner-payment-claims"
  | "/owner-concerns"
  | "/owner-vacancy-finder"
  | "/owner-staff"
  | "/owner-expenses"
  | "/owner-service-balance"
  | "/owner-food"
  | "/owner-pnl"
  | "/owner-bookings"
  | "/owner-booking-onboarding"
  | "/owner-leads"
  | "/owner-visits";

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

function OwnerHome({
  account,
  onNavigate,
  onSelectorOpenChange,
  properties,
  propertiesKnown,
}: {
  account: "owner" | "manager";
  onNavigate: (href: OwnerRoute) => void;
  onSelectorOpenChange: (open: boolean) => void;
  properties: OwnerProperty[];
  /** Whether the list has really arrived, rather than being fetched again or having failed. */
  propertiesKnown: boolean;
}) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertyRestored = useAppSelector((state) => state.ownerWorkspace.restored);
  const pinnedKeys = useAppSelector((state) => state.ownerPins.pinnedKeys);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tab, setTab] = useState<OwnerTab>("workspace");
  const workspaceRole: "Owner" | "Manager" = account === "manager" ? "Manager" : "Owner";
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  // The list opens in a bottom sheet (user, 2026-11-14), so the card and the tabs never
  // give way to it. Home always shows a property: the first in the list until one is chosen.
  const selectorOpenForDisplay = false;
  const selectorPanelOpen = !selectedProperty;
  const { dialog: routeGateDialog, gate: routeGate } = useRouteGate(selectedProperty?.id);
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

  useEffect(() => {
    onSelectorOpenChange(selectorPanelOpen);
  }, [onSelectorOpenChange, selectorPanelOpen]);

  useEffect(() => () => onSelectorOpenChange(false), [onSelectorOpenChange]);

  useEffect(() => {
    if (properties.length === 1 && selectedPropertyId !== properties[0].id) {
      dispatch(setSelectedOwnerPropertyId(properties[0].id));
      setSelectorOpen(false);
      return;
    }

    // Only a list that has arrived can say a property is gone. Reloading drops the list
    // for a moment, and clearing here left every screen that needs a property waiting
    // forever (user, 2026-11-02).
    if (propertiesKnown && selectedPropertyId && !properties.some((property) => property.id === selectedPropertyId)) {
      dispatch(setSelectedOwnerPropertyId(properties[0]?.id ?? null));
      return;
    }

    // First open, or the chosen property is gone: open on the first property in the list,
    // not on a list to choose from (user, 2026-11-14). Only once the remembered property
    // has been read back: before that, the first one would overwrite it.
    if (properties.length > 1 && !selectedPropertyId && propertyRestored) {
      dispatch(setSelectedOwnerPropertyId(properties[0].id));
    }
  }, [dispatch, properties, propertiesKnown, propertyRestored, selectedPropertyId]);

  const loadFailed = loadFailure(dashboardQuery);
  if (loadFailed) {
    return <LoadFailed error={loadFailed.error} onReload={loadFailed.reload} />;
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={PropertyIcon}
        title={account === "manager" ? "No assigned properties" : "No property yet"}
        description={
          account === "manager"
            ? "Properties appear here once an owner assigns you as a manager."
            : "Create your first property from the owner workspace to unlock rooms, tenancies, billing, notices and discovery."
        }
      />
    );
  }

  const selectProperty = (propertyId: string) => {
    dispatch(setSelectedOwnerPropertyId(propertyId));
    setSelectorOpen(false);
  };

  return (
    <View>
      <View
        style={{
          backgroundColor: colors.primary,
          // In the open state this blue surface is the selector card's outer
          // frame, so its lower corners use the same radius as that card.
          borderBottomColor: colors.background,
          borderBottomLeftRadius: selectorPanelOpen ? 18 : 0,
          borderBottomRightRadius: selectorPanelOpen ? 18 : 0,
          borderBottomWidth: selectorPanelOpen ? StyleSheet.hairlineWidth : 0,
          borderCurve: "continuous",
          // More room between the property card and the tabs (user, 2026-11-14).
          gap: spacing.xl,
          // Paint one point beyond each viewport edge so Android cannot reveal
          // the scroll surface as a white sliver. The matching padding increase
          // below keeps the property card and tab geometry exactly where it is.
          marginHorizontal: -spacing.lg - 1,
          // The greeting header and this selector surface are painted by
          // separate native views. Overlap them by one point so Android cannot
          // expose a raster seam between two otherwise identical blue fills.
          marginTop: -1,
          overflow: selectorPanelOpen ? "hidden" : "visible",
          // The curved tabs own the blue-to-page boundary.
          paddingBottom: selectorPanelOpen ? spacing.md : 0,
          paddingHorizontal: spacing.lg + 1,
        }}
      >
        <OwnerPropertyPicker
          open={selectorOpen}
          onSelect={selectProperty}
          renderOptions={false}
          properties={properties}
          selectedProperty={selectedProperty}
          workspaceRole={workspaceRole}
          onToggle={() => setSelectorOpen(true)}
        />
        {selectedProperty && !selectorOpenForDisplay ? <OwnerTabBar onChange={setTab} tab={tab} /> : null}
      </View>

      <View
        style={{
          backgroundColor: colors.background,
          gap: spacing.lg,
          paddingTop: selectorPanelOpen ? spacing.md : spacing.lg,
        }}
      >
        {/* The open picker takes the selected tab's content slot. The tab
            switcher remains steady while the old property's workspace and
            dashboard disappear until a new property is chosen. */}
        {/* The properties in a bottom-up sheet, no summary tiles (user, 2026-11-14). */}
        {selectorOpen && properties.length > 1 ? (
          // No title, no box and no lines: just the properties (user, 2026-11-14).
          <SheetShell onClose={() => setSelectorOpen(false)} size="medium" title="">
            <OwnerPropertyOptions
              bare
              onSelect={selectProperty}
              properties={properties}
              selectedProperty={selectedProperty}
            />
          </SheetShell>
        ) : null}

        {selectedProperty && !selectorOpenForDisplay && dashboardQuery.isFetching && !dashboard ? (
          tab === "dashboard" ? (
            <OwnerDashboardDataSkeleton />
          ) : (
            <WorkspaceTabLoading
              onNavigate={navigate}
              pinnedKeys={pinnedKeys}
              propertyId={selectedProperty.id}
              workspaceRole={workspaceRole}
            />
          )
        ) : null}

        {selectedProperty && !selectorOpenForDisplay && dashboard ? (
          tab === "dashboard" ? (
            <DashboardTab dashboard={dashboard} />
          ) : (
            <WorkspaceTab dashboard={dashboard} onNavigate={navigate} pinnedKeys={pinnedKeys} workspaceRole={workspaceRole} />
          )
        ) : null}
        {routeGateDialog}
      </View>
    </View>
  );
}

/** The original Home tab's line-chart icon. */
function DashboardGlyph({ color, size }: LucideProps) {
  return <MaterialCommunityIcons color={color} name="chart-line" size={Number(size ?? 24)} />;
}

function OwnerTabBar({ onChange, tab }: { onChange: (tab: OwnerTab) => void; tab: OwnerTab }) {
  const { colors, fonts } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [tabBarSize, setTabBarSize] = useState(() => ({ height: 56, width: Math.max(0, windowWidth - spacing.lg * 2) }));
  const options: { icon: ComponentType<LucideProps>; label: string; value: OwnerTab }[] = [
    { icon: LayoutGrid, label: "Workspace", value: "workspace" },
    { icon: DashboardGlyph, label: "Dashboard", value: "dashboard" },
  ];
  const iconSize = 20;
  const iconGap = 4;
  const tabWidth = tabBarSize.width / options.length;
  const activeLeft = tab === "workspace" ? 0 : tabWidth;
  const curveSize = 28;
  const edgeBleed = 3;
  const canvasWidth = tabBarSize.width + spacing.lg * 2 + edgeBleed * 2;
  const shapeHeight = tabBarSize.height;
  const activeStart = spacing.lg + edgeBleed + activeLeft;
  const activeEnd = activeStart + tabWidth;
  const leftShoulder = activeStart - curveSize;
  const rightShoulder = activeEnd + curveSize;
  const curveControl = curveSize * 0.55228475;
  // Restore the original single blue-to-page contour, with no underline or grey pill.
  const contourPath = [
    `M 0 ${shapeHeight}`,
    `L ${leftShoulder} ${shapeHeight}`,
    `C ${leftShoulder + curveControl} ${shapeHeight} ${activeStart} ${shapeHeight - curveSize + curveControl} ${activeStart} ${shapeHeight - curveSize}`,
    `L ${activeStart} ${curveSize}`,
    `C ${activeStart} ${curveSize - curveControl} ${activeStart + curveSize - curveControl} 0 ${activeStart + curveSize} 0`,
    `H ${activeEnd - curveSize}`,
    `C ${activeEnd - curveSize + curveControl} 0 ${activeEnd} ${curveSize - curveControl} ${activeEnd} ${curveSize}`,
    `L ${activeEnd} ${shapeHeight - curveSize}`,
    `C ${activeEnd} ${shapeHeight - curveSize + curveControl} ${rightShoulder - curveControl} ${shapeHeight} ${rightShoulder} ${shapeHeight}`,
    `L ${canvasWidth} ${shapeHeight}`,
  ].join(" ");
  const pageShape = `${contourPath} L ${canvasWidth} ${shapeHeight} L 0 ${shapeHeight} Z`;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setTabBarSize((current) => Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { height, width });
      }}
      style={{ alignItems: "stretch", flexDirection: "row", overflow: "visible" }}
    >
      {tabBarSize.width > 0 && tabBarSize.height > 0 ? (
        <Svg accessible={false} height={shapeHeight} pointerEvents="none"
          style={{ left: -spacing.lg - edgeBleed, position: "absolute", top: 0, zIndex: 0 }} width={canvasWidth}>
          <Rect fill={colors.primary} height={shapeHeight} width={canvasWidth} x={0} y={0} />
          <Path d={pageShape} fill={colors.background} />
        </Svg>
      ) : null}
      {/* Cover the last raster row at the page boundary on high-density Android displays. */}
      <View pointerEvents="none" style={{ backgroundColor: colors.background, bottom: -1, height: 2,
        left: -spacing.lg - edgeBleed, position: "absolute", right: -spacing.lg - edgeBleed, zIndex: 1 }} />
      {options.map((option) => {
        const active = option.value === tab;
        const Icon = option.icon;
        return (
          <View key={option.value} style={{ flex: 1, position: "relative", zIndex: 2 }}>
          <AnimatedPressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{ alignItems: "center", backgroundColor: "transparent", flex: 1, justifyContent: "center", minHeight: 56, paddingHorizontal: spacing.md, zIndex: 2 }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: iconGap,
              transform: [{ translateX: option.value === "workspace" && !active ? -(iconSize + iconGap) / 2 : 0 }] }}>
              <Icon color={active ? colors.primary : colors.onPrimary} size={iconSize} strokeWidth={2.1} />
              <Text style={{ color: active ? colors.ink : colors.onPrimary, fontFamily: active ? fonts.sansBold : fonts.sans, fontSize: 15 }}>{option.label}</Text>
            </View>
          </AnimatedPressable>
          </View>
        );
      })}
    </View>
  );
}


function DashboardTab({ dashboard }: { dashboard: OwnerDashboard }) {
  const router = useGuardedRouter();
  const { concerns, money, occupancy } = dashboard;
  const { dialog: accessDialog, guardAny } = useScreenAccessGuard(dashboard.property.propertyId);

  const pnlPropertyId = dashboard.property.propertyId;
  const pnlStatement = useGetPnlStatementQuery(
    { month: istMonthStart(), propertyId: pnlPropertyId },
    { skip: !pnlPropertyId },
  ).data;

  // Each row opens its division's analytics screen. The figure on it is a
  // teaser from data this tab already loads, so the rows cost no request. A
  // manager with none of a division's permissions is told why instead of
  // landing on an empty screen.
  const openDivision = (division: AnalyticsDivision) => {
    guardAny(DIVISIONS[division].resources, `${DIVISIONS[division].tileLabel} insights`, () =>
      router.push({ params: { division }, pathname: "/owner-analytics/[division]" }),
    );
  };
  const openConcerns = concerns.open + concerns.underReview + concerns.inProgress;
  const netLoss = Boolean(pnlStatement && pnlStatement.netPaise < 0);
  // The same request the insights screen opens on, so it is already loaded there.
  const leadInsights = useGetLeadInsightsQuery(
    { period: "THIS_MONTH", propertyId: pnlPropertyId },
    { skip: !pnlPropertyId },
  ).data;

  return (
    <>
      {/* No heading over the cards (user, 2026-11-08): the tab itself says
          what they are. */}
      <View style={{ gap: spacing.sm + 2 }}>
          {/* Collected OVER billed. On its own the collected figure reads as ₹0
              for most of the month — true, but it hides whether that is nothing
              owed or nothing paid yet. */}
          <AnalyticsRowCard
            caption="Collected of billed this month"
            icon={RupeeBanknoteIcon}
            label="Billing"
            onPress={() => openDivision("billing")}
            value={`${compactMoneyPaise(money.collectedThisMonthPaise)} / ${compactMoneyPaise(money.billedThisMonthPaise)}`}
          />
          <AnalyticsRowCard
            caption={netLoss ? "Net loss this month" : "Net profit this month"}
            icon={ChartPie}
            label="Finance"
            onPress={() => openDivision("finance")}
            tone={netLoss ? "danger" : "primary"}
            value={pnlStatement ? signedCompactPaise(pnlStatement.netPaise) : "-"}
          />
          <AnalyticsRowCard
            caption="Beds occupied right now"
            icon={Users}
            label="Tenancy"
            onPress={() => openDivision("tenants")}
            value={`${occupancy.occupiedBeds} / ${occupancy.totalBeds}`}
          />
          {/* Every lead figure in one place (user, 2026-10-18): the listing
              funnel from the profile events and the pipeline read. Under
              Tenancy, by the demo the user approved. */}
          <AnalyticsRowCard
            caption="Moved in from listing views this month"
            icon={LeadsInsightsIcon}
            label="Leads"
            onPress={() => router.push("/owner-leads-insights")}
            value={leadInsights ? `${leadInsights.steps[5]?.people ?? 0} / ${leadInsights.steps[0]?.people ?? 0}` : "-"}
          />
          <AnalyticsRowCard
            caption="Open concerns right now"
            icon={MessageSquareWarning}
            label="Concerns"
            onPress={() => openDivision("concerns")}
            value={String(openConcerns)}
          />
      </View>
      {accessDialog}
    </>
  );
}

/**
 * One analytics division on the Dashboard tab: its icon in an outlined tile,
 * name, what its figure means, and the figure itself.
 *
 * <p>Squarer corners and no coloured foot (user, 2026-11-08). The press
 * feedback is the pressable's own, nothing stays marked after a tap.
 */
function AnalyticsRowCard({
  caption,
  icon: Icon,
  label,
  onPress,
  tone = "primary",
  value,
}: {
  caption: string;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  tone?: "danger" | "primary";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "danger" ? colors.danger : colors.primary;
  return (
    <AnimatedPressable
      accessibilityHint={`Opens ${label} insights`}
      accessibilityLabel={`${label}, ${value}, ${caption}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 78,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          height: 48,
          justifyContent: "center",
          width: 48,
        }}
      >
        <Icon color={accent} size={26} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16 }}>
          {label}
        </FitText>
        <FitText numberOfLines={2} style={[type.description, { color: colors.muted }]}>
          {caption}
        </FitText>
      </View>
      {/* Measured, not adjustsFontSizeToFit: that prop does nothing on web. A
          money ratio like ₹1.2L / ₹1.5L is far wider than 5 / 28. */}
      <FitText
        numberOfLines={1}
        style={{
          color: tone === "danger" ? colors.danger : colors.ink,
          fontFamily: fonts.display,
          fontSize: metricFontSize(value, 20),
          fontVariant: ["tabular-nums"],
          letterSpacing: -0.3,
          maxWidth: "38%",
        }}
      >
        {value}
      </FitText>
      <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} style={{ marginLeft: -spacing.xs }} />
    </AnimatedPressable>
  );
}

function signedCompactPaise(paise: number) {
  return `${paise < 0 ? "−" : ""}${compactMoneyPaise(Math.abs(paise))}`;
}

/** The panel's own inset and frame. */
const PINNED_BOX_PADDING = spacing.sm;
const PINNED_BOX_BORDER = 1;
const PINNED_PAGE_SIZE = 6;

function FrequentlyVisited({
  pinnedKeys,
  propertyId,
  workspaceRole,
}: {
  pinnedKeys: string[];
  propertyId: string | null;
  workspaceRole: "Owner" | "Manager";
}) {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const { canView } = usePropertyPermissions(propertyId);
  // A pin survives a permission change AND a module being removed, so both are
  // filtered here — otherwise a stale pin stays on Home as a shortcut into a
  // 403, or into a route that no longer exists.
  const modules = pinnedKeys
    .map((key) => findOwnerModule(key))
    .filter((module): module is NonNullable<typeof module> => Boolean(module))
    // The account role is already known here. Waiting for the property
    // permissions query to return its owner flag makes owner-only pins appear
    // a frame late and expands the card over the workspace button.
    .filter((module) => !module.ownerOnly || workspaceRole === "Owner")
    .filter((module) => !module.resources?.length || module.resources.some((resource) => canView(resource)));


  /**
   * Open or closed, as the reader last left it this session.
   *
   * <p>Null until they tap, and until then it follows what is pinned: open when
   * there is something to show, closed when there is only the explanation.
   * Derived rather than set once on mount, because the pins are read from
   * storage after Home first renders — deciding on that first render would
   * always see nothing pinned and start closed.
   */
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  const open = chosenOpen ?? modules.length > 0;

  // The panel is sized from its own width rather than a fixed number, because
  // a tile is square and as wide as a third of the row — so its height is a
  // function of the screen.
  // Home's scroll content has an 18px gutter on each side. Start with that
  // width instead of zero: waiting for onLayout renders no tiles for a frame,
  // so the blue workspace CTA below flashes through before the grid expands.
  const { width: windowWidth } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(() => Math.max(0, windowWidth - spacing.lg * 2));
  const [hasMeasured, setHasMeasured] = useState(false);
  // onLayout reports the BORDER box, so the frame comes off as well as the
  // padding. Missing the two border pixels made each tile a third of a pixel
  // too wide, which is enough to overflow the row and wrap it after two.
  const innerWidth = Math.max(0, boxWidth - PINNED_BOX_PADDING * 2 - PINNED_BOX_BORDER * 2);
  // Three to a row, from the width actually available. Floored, because a
  // fractional width that adds back up to exactly the row is one rounding
  // error away from wrapping again.
  const tileWidth = innerWidth > 0 ? Math.floor((innerWidth - spacing.sm * 2) / 3) : 0;
  const tileHeight = Math.max(tileWidth, 104);
  const pageHeight = Math.min(2, Math.ceil(modules.length / 3)) * tileHeight
    + (modules.length > 3 ? spacing.sm : 0);
  const pages = Array.from({ length: Math.ceil(modules.length / PINNED_PAGE_SIZE) }, (_, index) =>
    modules.slice(index * PINNED_PAGE_SIZE, (index + 1) * PINNED_PAGE_SIZE),
  );
  const [activePage, setActivePage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const moduleKeys = modules.map((module) => module.key).join("|");

  // An unpinned or newly restricted service can remove the page currently in
  // view. Return to the first page instead of leaving an empty carousel frame.
  useEffect(() => {
    setActivePage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [moduleKeys]);

  return (
    /* A dropdown rather than a standing box. Closed it is one row, so an owner
       with nothing pinned is not handed two rows of empty dashed space above
       the things they came to Home for. */
    <View
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (measuredWidth > 0 && measuredWidth !== boxWidth) {
          setBoxWidth(measuredWidth);
        }
        if (measuredWidth > 0 && !hasMeasured) {
          setHasMeasured(true);
        }
      }}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: PINNED_BOX_BORDER,
        overflow: "hidden",
        ...cardShadow(colors.shadow),
      }}
    >
      <AnimatedPressable
        accessibilityLabel={`Pinned Services, ${modules.length} pinned`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setChosenOpen(!open)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        {/* The Manage tab's pin: same glyph, same lean. The rotation goes on a
            wrapping View, never on the icon — rotating the SVG shears the tip. */}
        <View style={{ transform: [{ rotate: "32deg" }] }}>
          <Pin color={colors.primary} fill={colors.primary} size={16} strokeWidth={2.1} />
        </View>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15 }}>
          Pinned Services
        </Text>
        {modules.length > 0 ? (
          <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>
            {modules.length}
          </Text>
        ) : null}
        {/* Swapped, never rotated: a transform on a lucide icon does not reach
            the SVG, so a rotated chevron keeps pointing down. */}
        {open ? (
          <ChevronUp color={colors.muted} size={18} strokeWidth={2.2} />
        ) : (
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
        )}
      </AnimatedPressable>

      {!open ? null : modules.length === 0 ? (
        <View
          style={{
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
          }}
        >
          <Text style={[type.description, { color: colors.muted }]}>
            Pinned management services appear here. Pin them from the{" "}
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold }}>MANAGE</Text> tab to keep
            them one tap away.
          </Text>
        </View>
      ) : (
        <View
          style={{
            borderTopColor: colors.border,
            borderTopWidth: 1,
            padding: PINNED_BOX_PADDING,
          }}
        >
          {!hasMeasured ? (
            <OwnerPinnedServicesSkeleton tileHeight={tileHeight} tileWidth={tileWidth} />
          ) : innerWidth > 0 ? (
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              scrollEnabled={pages.length > 1}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                setActivePage(Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / innerWidth)));
              }}
              style={{ width: innerWidth }}
            >
              {pages.map((page, pageIndex) => (
                <View
                  key={pageIndex}
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: spacing.sm,
                    height: pageHeight,
                    width: innerWidth,
                  }}
                >
                  {page.map((module) => (
                    <View key={module.key} style={{ width: tileWidth }}>
                      <AnimatedPressable
                        accessibilityRole="button"
                        onPress={() => router.push(module.route as never)}
                        style={{
                          alignItems: "center",
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderRadius: 0,
                          borderWidth: 1,
                          gap: spacing.xs,
                          height: tileHeight,
                          justifyContent: "center",
                          padding: spacing.sm,
                          width: "100%",
                        }}
                      >
                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: "transparent",
                            borderRadius: 999,
                            height: module.artworkVariant === "large" ? 68 : 64,
                            justifyContent: "center",
                            // A vector drawing is never clipped round: Android drew nothing.
                            overflow: module.art ? "visible" : "hidden",
                            width: module.artworkVariant === "wide" ? 90 : module.artworkVariant === "large" ? 68 : 64,
                          }}
                        >
                          {module.art ? (
                            <module.art size={module.artworkVariant === "large" ? 66 : 60} />
                          ) : module.artwork ? (
                            <Image
                              accessibilityIgnoresInvertColors
                              accessible={false}
                              resizeMode="contain"
                              source={module.artwork}
                              style={{
                                height: module.artworkVariant === "large" ? 66 : module.artworkVariant === "compact" ? 54 : 60,
                                width: module.artworkVariant === "wide" ? 88 : module.artworkVariant === "large" ? 66 : module.artworkVariant === "compact" ? 54 : 60,
                              }}
                            />
                          ) : (
                            <module.icon color={colors.ink} size={32} strokeWidth={1.8} />
                          )}
                        </View>
                        <FitText
                          style={{
                            color: colors.ink,
                            fontFamily: fonts.sansBold,
                            fontSize: 12,
                            lineHeight: 15,
                            textAlign: "center",
                          }}
                          numberOfLines={2}
                        >
                          {module.pinnedTitle ?? module.title}
                        </FitText>
                      </AnimatedPressable>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : null}
          {pages.length > 1 ? (
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "center", paddingTop: spacing.sm }}>
              {pages.map((_, index) => (
                <Pressable
                  key={index}
                  accessibilityLabel={"Pinned services page " + (index + 1) + " of " + pages.length}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activePage === index }}
                  onPress={() => {
                    pagerRef.current?.scrollTo({ x: index * innerWidth, animated: true });
                    setActivePage(index);
                  }}
                  style={{ padding: 5 }}
                >
                  <View
                    style={{
                      backgroundColor: activePage === index ? colors.primary : colors.borderStrong,
                      borderRadius: 999,
                      height: activePage === index ? 8 : 6,
                      width: activePage === index ? 8 : 6,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
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
  // Shares the card's cache. Refused to a manager who cannot see stays: then no page.
  const stayOutBoard = useGetStayOutBoardQuery(dashboard.property.propertyId, { skip: !dashboard.property.propertyId });
  const { attention, today } = dashboard;
  const actionCenterCount = attentionCount(dashboard);
  return (
    <>
      {/* No "Workspace" heading. The tab directly above already says it, and
          the pinned services dropdown carries its own header. */}
      <View style={{ gap: spacing.md }}>
        {dashboard.property?.propertyId ? <MealScanHomeCard propertyId={dashboard.property.propertyId} /> : null}
        <FrequentlyVisited pinnedKeys={pinnedKeys} propertyId={dashboard.property?.propertyId ?? null} workspaceRole={workspaceRole} />
        <HomeQuickActions key={dashboard.property.propertyId} dashboard={dashboard} />
        {/* Side by side, a pair of tiles (user, 2026-11-07). A manager has Leads alone, full width. */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {workspaceRole === "Owner" ? (
          <ServiceBalanceCard onPress={() => onNavigate("/owner-service-balance")} />
        ) : null}
        {dashboard.property?.propertyId ? (
          <PropertyLeadsCard onPress={() => onNavigate("/owner-leads")} propertyId={dashboard.property.propertyId} />
        ) : null}
        </View>
        {/* Under Property Leads, only while someone is due in today (user, 2026-10-27). */}
        {(dashboard.bookings?.moveInsToday ?? 0) > 0 ? (
          <MoveInsTodayCard
            count={dashboard.bookings?.moveInsToday ?? 0}
            // Straight to the booking onboarding screen, which opens on Today (user, 2026-10-27).
            onPress={() => onNavigate("/owner-booking-onboarding")}
          />
        ) : null}
      </View>

      <Section title="Property Tools">
        {/* Every tool stays on screen whatever the manager holds. Tapping a
            blocked one refuses with a toast that names it, via the shared route
            gate — unlike a workspace MODULE, which is removed outright. The
            difference is deliberate: a missing module is a section they were
            never given, while a missing tool from a fixed four-square grid just
            looks broken, and leaves the survivors stretched across the row. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.vacancy} label="Vacancy finder" onPress={() => onNavigate("/owner-vacancy-finder")} />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.expenses} label="Expenses" onPress={() => onNavigate("/owner-expenses")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox
              badge={attention.pendingDepositSettlements ?? 0}
              artwork={HOME_TOOL_ARTWORK.deposit}
              label="Deposit manager"
              onPress={() => onNavigate("/owner-deposit-manager")}
            />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.pnl} label="Profit & loss" onPress={() => onNavigate("/owner-pnl")} />
          </View>
          {/* Bookings sits beside VMS in both loading and loaded layouts. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox
              artwork={HOME_TOOL_ARTWORK.visits}
              // A scene, not a single object, so it is drawn a little larger
              // than the other tools to read at this size (user, 2026-10-04).
              artworkSize={60}
              // The Visitor Management System, by its initials: the full
              // name does not fit a tool box (user, 2026-10-04).
              label="VMS"
              onPress={() => onNavigate("/owner-visits")}
            />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.bookings} artworkSize={60} label="Bookings" onPress={() => onNavigate("/owner-bookings")} />
          </View>
        </View>
      </Section>

      {/* Shown to managers too. Consistent with the billing ruling: dashboard
          figures stay visible to everyone and only the way IN to a module is
          gated. Staff is the exception below, because it is owner-only outright
          rather than permission-gated. */}
      <Section title="Live digest">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <DigestTile
              // Money in, so green — the one tile on this grid that is good
              // news rather than a queue.
              accentColor={colors.jade}
              hint={formatMoneyPaise(today.paymentsMadeTodayPaise)}
              highlight={today.paymentsMadeToday > 0}
              // ReceiptText, the same mark the owner and tenant bill cards
              // carry. A payment made today is a bill being settled, and this
              // tile opens straight into that list.
              icon={DigestPaymentsColorIcon}
              label="Payments"
              // Only today's payments, the ones counted here (user, 2026-10-18).
              onPress={() => onNavigate("/owner-payments-today")}
              value={String(today.paymentsMadeToday)}
            />
            <DigestTile
              hint="Raised today"
              highlight={today.concernsRaisedToday > 0}
              icon={DigestConcernsColorIcon}
              label="Concerns"
              // Only today's concerns, with the module a tap away (user, 2026-10-18).
              onPress={() => onNavigate("/owner-concerns-today")}
              value={String(today.concernsRaisedToday)}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <DigestTile
              hint="Started today"
              highlight={today.tenanciesStartedToday > 0}
              icon={DigestMoveInsColorIcon}
              label="Move-ins"
              // Only the stays that started today (user, 2026-10-18).
              onPress={() => onNavigate("/owner-move-ins-today")}
              value={String(today.tenanciesStartedToday)}
            />
            <DigestTile
              hint="Ending today"
              highlight={today.tenanciesEndingToday > 0}
              icon={DigestMoveOutsColorIcon}
              label="Move-outs"
              // Only the tenants leaving today, each with End tenancy. The exit
              // requests queue buried them among pending and future requests.
              onPress={() => onNavigate("/owner-exits-today")}
              value={String(today.tenanciesEndingToday)}
            />
          </View>
        </View>
        {/* Always, including at zero. It used to appear only when someone was
            waiting, which meant the one route to the claims screen existed only
            while there was a claim on it — an owner could not go and look at
            what had already been verified, or check the screen was there at
            all. A steady tile reading zero also says "nothing is waiting",
            which a missing tile does not. */}
        {/* Side by side, swiped one at a time (user, 2026-11-09): stacked, the
            four made Home too long. Stay outs only for those who can see stays. */}
        <CardCarousel
          pages={[
            { key: "claims", node: <PaymentClaimsCard digest={dashboard.paymentIntents} onOpen={() => onNavigate("/owner-payment-claims")} /> },
            {
              key: "notices",
              node: <UpcomingNoticesCard onOpen={() => onNavigate("/owner-upcoming-notices")} propertyId={dashboard.property.propertyId} />,
            },
            ...(stayOutBoard.isError
              ? []
              : [{ key: "stay-outs", node: <StayOutsCard onOpen={() => onNavigate("/owner-stay-outs")} propertyId={dashboard.property.propertyId} /> }]),
            {
              key: "expenses",
              node: <ExpenseTrackerCard onOpen={() => onNavigate("/owner-expenses")} propertyId={dashboard.property.propertyId} />,
            },
          ]}
        />
      </Section>

    </>
  );
}

function WorkspaceTabLoading({
  onNavigate,
  pinnedKeys,
  propertyId,
  workspaceRole,
}: {
  onNavigate: (href: OwnerRoute) => void;
  pinnedKeys: string[];
  propertyId: string;
  workspaceRole: "Owner" | "Manager";
}) {
  return (
    <>
      <View style={{ gap: spacing.md }}>
        <MealScanHomeCard propertyId={propertyId} />
        <FrequentlyVisited pinnedKeys={pinnedKeys} propertyId={propertyId} workspaceRole={workspaceRole} />
        <HomeQuickActions key={propertyId} />
        {/* Side by side, a pair of tiles (user, 2026-11-07). A manager has Leads alone, full width. */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {workspaceRole === "Owner" ? (
          <ServiceBalanceCard onPress={() => onNavigate("/owner-service-balance")} />
        ) : null}
        <PropertyLeadsCard onPress={() => onNavigate("/owner-leads")} propertyId={propertyId} />
        </View>
      </View>

      <Section title="Property Tools">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.vacancy} label="Vacancy finder" onPress={() => onNavigate("/owner-vacancy-finder")} />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.expenses} label="Expenses" onPress={() => onNavigate("/owner-expenses")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.deposit} label="Deposit manager" onPress={() => onNavigate("/owner-deposit-manager")} />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.pnl} label="Profit & loss" onPress={() => onNavigate("/owner-pnl")} />
          </View>
          {/* Bookings sits beside VMS in both loading and loaded layouts. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HomeToolBox
              artwork={HOME_TOOL_ARTWORK.visits}
              // A scene, not a single object, so it is drawn a little larger
              // than the other tools to read at this size (user, 2026-10-04).
              artworkSize={60}
              // The Visitor Management System, by its initials: the full
              // name does not fit a tool box (user, 2026-10-04).
              label="VMS"
              onPress={() => onNavigate("/owner-visits")}
            />
            <HomeToolBox artwork={HOME_TOOL_ARTWORK.bookings} artworkSize={60} label="Bookings" onPress={() => onNavigate("/owner-bookings")} />
          </View>
        </View>
      </Section>

      <OwnerLiveDigestSkeleton />
    </>
  );
}

function HomeToolBox({
  artwork: Art,
  artworkSize = 48,
  badge,
  label,
  onPress,
}: {
  artwork: ModuleArt;
  /** The artwork's side. 48 unless a tool's picture needs more room to read. */
  artworkSize?: number;
  badge?: number;
  label: string;
  onPress: () => void;
}) {
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
        ...cardShadow(colors.shadow),
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
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11 }}>
            {badge}
          </Text>
        </View>
      ) : null}
      <Art size={artworkSize} />
      <MarqueeText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}>
        {label}
      </MarqueeText>
    </AnimatedPressable>
  );
}

// Owner-only quick view of the staff team, sitting full-width (two tiles wide)
// under the live digest. Figures are estimated from current staff/manager pay terms.

/**
 * Tenants who say they have paid, waiting on the owner's bank statement.
 *
 * <p>The oldest wait is coloured when it passes a day, because the number that
 * matters here is not how many are queued but how long someone has been blocked.
 */
function PaymentClaimsCard({ digest, onOpen }: { digest: PaymentIntentDigest; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ padding: spacing.sm }}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {/* 30 in a compact 36 rail, matching Upcoming notices below —
                the two digest cards are read as a pair. The 72px artwork, not
                the 1254px one: half a megabyte is a lot to download for a mark
                this small. */}
            <View style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}>
              <PaymentClaimsArt size={34} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
                Payment claims
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StaffMetricBox hint="To verify" label="Awaiting" value={String(digest.awaitingReview)} />
            <StaffMetricBox hint="At stake" label="Claimed" value={formatMoneyPaise(digest.awaitingAmountPaise)} />
            {/* Resolved, not "oldest wait". With the tile now on the dashboard
                whether or not anything is queued, an empty queue showed three
                figures that all meant nothing — and "Oldest: Today" on zero
                claims reads as a claim raised today. This says what the screen
                got done instead. */}
            <StaffMetricBox hint="This month" label="Resolved" value={String(digest.resolvedThisMonth)} />
          </View>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

function UpcomingNoticesCard({ onOpen, propertyId }: { onOpen: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const upcomingQuery = useListUpcomingNoticesQuery(propertyId, { pollingInterval: 60_000, skip: !propertyId });
  const upcoming = upcomingQuery.data ?? [];

  if (upcomingQuery.isFetching && !upcomingQuery.data) {
    return <OwnerDigestCardSkeleton />;
  }

  const recurringCount = upcoming.filter((notice) => notice.recurringNoticeId !== null).length;
  const scheduledCount = upcoming.length - recurringCount;
  const next = upcoming[0] ?? null;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ padding: spacing.sm }}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {/* 30 in a compact 36 rail, the same as Payment claims above — the
                two digest cards are read as a pair and a glyph a few points
                out is visible straight away. */}
            <View style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}>
              <NoticeArt size={34} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
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

/**
 * Who said they are away (user, 2026-11-08), shaped like Upcoming notices
 * above it. Hidden from a manager who cannot see the current stays: the board
 * names tenants, and the server refuses it to them.
 */
function StayOutsCard({ onOpen, propertyId }: { onOpen: () => void; propertyId: string }) {
  const { colors, fonts } = useTheme();
  const boardQuery = useGetStayOutBoardQuery(propertyId, { pollingInterval: 300_000, skip: !propertyId });
  const board = boardQuery.data;

  if (boardQuery.isFetching && !board) {
    return <OwnerDigestCardSkeleton />;
  }
  if (!board) {
    return null;
  }
  const next = board.upcoming[0] ?? null;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ padding: spacing.sm }}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}>
              <StayOutIcon size={30} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>Stay outs</Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StaffMetricBox hint="Not eating here" label="Away tonight" value={String(board.awayTonight.length)} />
            <StaffMetricBox hint="Coming back" label="Back today" value={String(board.backToday.length)} />
            <StaffMetricBox
              hint={next ? `Next ${stayOutDay(next.leaveDate)}` : "Next 30 days"}
              label="Upcoming"
              value={String(board.upcoming.length)}
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
  const budgetQuery = useGetBudgetOverviewQuery({ month: istMonthStart(), propertyId }, { skip: !propertyId });
  const budget = budgetQuery.data;

  if (budgetQuery.isFetching && !budgetQuery.data) {
    return <OwnerDigestCardSkeleton />;
  }

  const spent = budget?.spentPaise ?? 0;
  const effective = budget?.effectiveBudgetPaise ?? null;
  const hasBudget = effective != null && effective > 0;
  const over = hasBudget && spent > effective;
  const approaching = hasBudget && !over && spent * 100 >= effective * 80;
  const status = !hasBudget ? "—" : over ? "Crossed" : approaching ? "Approaching" : "On track";
  const statusColor = !hasBudget ? colors.muted : over ? colors.danger : approaching ? colors.warningText : colors.jade;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ padding: spacing.sm }}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {/* 30 in a 44 rail, the third of the digest cards to carry its
                module's artwork rather than a line glyph. */}
            <View style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}>
              <ExpenseTrackerArt size={34} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
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
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flex: 1, gap: 2, padding: spacing.sm }}>
      <FitText style={[type.caption, { color: colors.muted, fontSize: 11 }]} numberOfLines={1}>
        {label}
      </FitText>
      {/* Serif numerals (money) keep the ledger look; word statuses use the sans
          face. adjustsFontSizeToFit shrinks a long word ("Approaching") to fit
          the narrow box, but on Android the shrunk glyph box is centred against
          the ORIGINAL font metrics and its top ascender gets clipped — so pin an
          explicit lineHeight (with font padding + centred vertical align) that
          reserves the ascender room regardless of the shrink. */}
      <FitText
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
      </FitText>
      <FitText style={[type.caption, { color: colors.kicker }]} numberOfLines={1}>
        {hint}
      </FitText>
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
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            borderCurve: "continuous",
            borderRadius: 12,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Icon color={colors.ink} size={18} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <WrapTitle style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
              {item.title}
            </WrapTitle>
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
          <FitText style={[type.caption, subtitleColor]} numberOfLines={expanded ? undefined : COLLAPSED_ACTIVITY_LINES}>
            {item.subtitle}
          </FitText>

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

/**
 * One live-digest count, in the app's metric-card shape.
 *
 * <p>
 * It used to be its own thing: a centred column with a 26pt glyph above the
 * label and everything middle-aligned. Every other statistic in the app — the
 * billing summary, the concern overview, the tenancy snapshot, the dashboard
 * tiles — is a 38pt ink glyph in a 44-wide rail with the label, number and
 * hint stacked beside it, so the four digest tiles were the last place the same
 * kind of fact wore a different face.
 *
 * <p>
 * The glyph is ink, like everywhere else. It used to turn blue on activity,
 * which is what the {@code hint} line underneath already says — and saying it
 * twice cost the tile its resemblance to every card around it. {@code
 * accentColor} still tints that line, so Payments reads green for money in
 * while the other three stay neutral queues.
 */
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
  const { colors, fonts, type } = useTheme();
  const tone = accentColor ?? colors.primary;
  const accent = highlight ? tone : colors.muted;
  const valueSize = metricFontSize(value, 23);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        // Centred: a tile whose hint wraps to two lines is taller than the one
        // beside it, and top-aligned the shorter one's glyph sat against the
        // ceiling with the spare height below it.
        justifyContent: "center",
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {/* Bare on the tile's own white — no chip. The tile is already a
            surface, and a filled square inside it read as a control. */}
        <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
          <Icon color="#000000" size={40} strokeWidth={2.7} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
            {label}
          </FitText>
          {/* The count is always ink. Colouring it on activity made the number
              itself look like a status, when the number IS the fact — the hint
              beneath it carries whether anything happened. */}
          <FitText
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: valueSize,
              fontVariant: ["tabular-nums"],
              lineHeight: valueSize + 5,
            }}
          >
            {value}
          </FitText>
          {/* No dot. It restated what the hint's own colour already says, and
              four of them across a grid read as status lights on a device. */}
          <FitText numberOfLines={2} style={[type.caption, { color: accent, fontSize: 11, lineHeight: 15 }]}>
            {hint}
          </FitText>
        </View>
      </View>
    </AnimatedPressable>
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

      <Section title="Find your next stay">
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
              icon={PropertyIcon}
              kicker={property.city}
              title={property.name}
              body={`${property.address}  /  ${property.startingRoomRentPaise ? formatMoneyPaise(property.startingRoomRentPaise) : "Rent on profile"}`}
            />
          ))
        ) : (
          <EmptyState
            icon={Search}
            title="Start with discovery"
            description="Listed properties near your location will appear here. If nothing is nearby, open discovery and choose a city or area."
          />
        )}
      </Section>

      <Section title="Before move-in">
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

      <Section title="What unlocks after tenancy">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ModuleChip icon={PropertyIcon} label="Property" />
          <ModuleChip icon={KeyRound} label="Tenancy" />
          <ModuleChip icon={FileText} label="Notices" />
          <ModuleChip icon={AlertCircle} label="Concerns" />
          <ModuleChip icon={PropertyIcon} label="Property board" />
        </View>
      </Section>
    </>
  );
}

/** A property's name split for the card: all but the last word, and the last word to italicise. */
function fancyName(name: string) {
  // "Pg" or "pg" reads as the abbreviation it is, PG (user, 2026-11-14).
  const words = name.trim().split(/\s+/).map((word) => (/^pg$/i.test(word) ? "PG" : word));
  if (words.length < 2) return { lead: "", tail: words.join(" ") };
  return { lead: words.slice(0, -1).join(" "), tail: words[words.length - 1] };
}

function OwnerPropertyPicker({
  onSelect,
  onToggle,
  open,
  properties,
  renderOptions = true,
  selectedProperty,
  workspaceRole,
}: {
  onSelect: (propertyId: string) => void;
  onToggle: () => void;
  open: boolean;
  properties: OwnerProperty[];
  renderOptions?: boolean;
  selectedProperty: OwnerProperty | null;
  workspaceRole: "Owner" | "Manager";
}) {
  const { colors, fonts, isDark, type } = useTheme();
  const isManager = workspaceRole === "Manager";
  const hasMultipleProperties = properties.length > 1;
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
        accessibilityLabel={selectorTitle}
        accessibilityState={{ disabled: !hasMultipleProperties, expanded: hasMultipleProperties ? open : undefined }}
        disabled={!hasMultipleProperties}
        onPress={hasMultipleProperties ? onToggle : undefined}
        style={{
          alignItems: "center",
          // One neutral ground in both states. The blue wash on "nothing
          // chosen" made an empty selector the most saturated thing on Home,
          // and it clashed with the photograph it sat behind. The prompt state
          // is carried by the border and the eyebrow instead.
          // The scene's own ground, so its left fade meets the card seamlessly (user, 2026-11-14).
          backgroundColor: propertyCardGround(isDark),
          // No border at all. The card is a photograph with a shadow under it —
          // an edge drawn around a picture that already ends at a hard boundary
          // is a second line saying the same thing, and the blue variant made
          // the unselected state the most saturated element on Home. The
          // prompt is carried by the eyebrow turning blue, which is where the
          // reader is looking anyway.
          borderCurve: "continuous",
          // Far less rounded (user, 2026-11-14). It was 18.
          borderRadius: 8,
          flexDirection: "row",
          gap: spacing.md,
          // A little more compact (user, 2026-11-14).
          minHeight: 60,
          // Clips the scene to the card's rounded corners.
          overflow: "hidden",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          // Lifted instead of outlined. A soft shadow separates it from the
          // page the way the ink border used to, without the weight.
          ...cardShadow(colors.shadow),
          // One even light rim on all four sides (user, 2026-11-14): the cards' grey edges
          // covered three, and the band's blue showed along the top.
          borderBottomColor: "rgba(255, 255, 255, 0.9)",
          borderBottomWidth: 1.5,
          borderLeftColor: "rgba(255, 255, 255, 0.9)",
          borderLeftWidth: 1.5,
          borderRightColor: "rgba(255, 255, 255, 0.9)",
          borderRightWidth: 1.5,
          borderTopColor: "rgba(255, 255, 255, 0.9)",
          borderTopWidth: 1.5,
        }}
      >
        {/* A drawn scene in place of the faded photograph (user, 2026-11-14): sky,
            sun, a skyline and a residence block on the right, the left left clean
            for the name. First in the tree so every label paints over it. */}
        <PropertyCardScenery dark={isDark} />
        {/* Outlined container, ink glyph, no fill — a tinted tile inside an
            ink-bordered card is a box in a box, and a blue glyph on a blue
            ground was the least legible thing on the card. */}
        {/* No box around it. The mark is two buildings already — a frame drew a
            third, and boxing a glyph inside a card inside a page is one edge
            too many. Without the border it can take the tile's full width
            instead of sitting shrunk in the middle of it. */}
        {/* A colour building for the property, small, no pin (user, 2026-11-14). */}
        <PropertyHouseIcon size={34} />
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          {/* The name in a fancy face (user, 2026-11-14): Playfair Display, the last word
              in its italic and the gold accent, a soft white glow against the sky. The
              prompt before a property is chosen stays plain. */}
          <FitText
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: selectedProperty ? fonts.fancy : fonts.display,
              fontSize: selectedProperty ? 23 : 20,
              letterSpacing: selectedProperty ? 0.2 : 0,
              lineHeight: selectedProperty ? 29 : 25,
              textShadowColor: isDark ? "rgba(0, 0, 0, 0.45)" : "rgba(255, 255, 255, 0.9)",
              textShadowOffset: { height: 0, width: 0 },
              textShadowRadius: 6,
            }}
          >
            {selectedProperty ? fancyName(selectorTitle).lead : selectorTitle}
            {selectedProperty && fancyName(selectorTitle).tail ? (
              // Upright, gold (user, 2026-11-14: not italic).
              <Text style={{ color: colors.accent, fontFamily: fonts.fancy, fontSize: 23, lineHeight: 29 }}>
                {`${fancyName(selectorTitle).lead ? " " : ""}${fancyName(selectorTitle).tail}`}
              </Text>
            ) : null}
          </FitText>
          {/* No address once a property is chosen (user, 2026-11-14): only the prompt before. */}
          {selectedProperty ? null : (
            <FitText numberOfLines={2} ellipsizeMode="tail" style={[type.caption, { color: colors.inkSoft, flexShrink: 1, fontSize: 11, maxWidth: "100%" }]}>
              {selectorSubtitle}
            </FitText>
          )}
        </View>
        {hasMultipleProperties ? <View pointerEvents="none" accessible={false} style={{ alignItems: "center", alignSelf: "center", backgroundColor: isDark ? "rgba(15, 23, 42, 0.45)" : "rgba(255, 255, 255, 0.5)", borderColor: "rgba(255, 255, 255, 0.65)", borderRadius: 999, borderWidth: 1, flexShrink: 0, height: 36, justifyContent: "center", width: 36 }}>
          {open ? <ChevronUp color={colors.inkSoft} size={18} strokeWidth={2.2} /> : <ChevronDown color={colors.inkSoft} size={18} strokeWidth={2.2} />}
        </View> : null}
      </AnimatedPressable>

      {renderOptions && open && hasMultipleProperties ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // Matches the card it drops out of, which is now a hairline too.
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
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
                  // A soft wash and a tick, not a slab of black. The filled ink
                  // row turned the open list into a black band and forced every
                  // label on it to invert; the wash marks the row without
                  // repainting it.
                  //
                  // Terracotta rather than the blue it replaced: blue is this
                  // app's ACTION colour — buttons, links, the submit at the
                  // bottom of every form — so a blue row read as something to
                  // press rather than something already chosen. The warm tone
                  // also sits with the building photograph on the card above
                  // instead of fighting it.
                  backgroundColor: selected ? colors.terracottaSoft : "transparent",
                  // Options are separated by a rule, not boxed individually.
                  borderTopColor: colors.border,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                }}
              >
                <OwnerPropertyOptionContent property={property} selected={selected} />
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function OwnerPropertyOptions({
  bare = false,
  onSelect,
  properties,
  selectedProperty,
}: {
  /** In the bottom sheet: no box around the list and no lines between rows (user, 2026-11-14). */
  bare?: boolean;
  onSelect: (propertyId: string) => void;
  properties: OwnerProperty[];
  selectedProperty: OwnerProperty | null;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={bare ? { gap: spacing.xs } : {
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
        ...cardShadow(colors.shadow),
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
              backgroundColor: selected ? colors.terracottaSoft : "transparent",
              // Bare rows are rounded on their own, with no rule between them.
              borderRadius: bare ? radii.card : 0,
              borderTopColor: colors.border,
              borderTopWidth: bare || index === 0 ? 0 : 1,
              flexDirection: "row",
              // In the sheet the icons sit further left, the text closer to them (user, 2026-11-14).
              gap: bare ? spacing.sm : spacing.md,
              padding: spacing.md,
              paddingLeft: bare ? spacing.xs : spacing.md,
            }}
          >
            <OwnerPropertyOptionContent property={property} selected={selected} />
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? properties[0] ?? null;
  }

  // The first property until one is chosen (user, 2026-11-14), not a list to pick from.
  return properties[0] ?? null;
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
  const detailParts = [location.locality, location.city]
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
            borderRadius: radii.card,
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
          <FitText numberOfLines={2} style={[type.body, { color: colors.ink, fontWeight: "800" }]}>
            {locationText}
          </FitText>
          {detailParts.length > 0 && locationText !== detailParts.join(", ") ? (
            <FitText numberOfLines={1} style={[type.description, { color: colors.muted }]}>
              {detailParts.join(", ")}
            </FitText>
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

function AddressInfoLine({ address }: { address: string }) {
  const { colors, fonts, isDark, type } = useTheme();
  const frost = isDark ? "rgba(15, 23, 42, 0.78)" : "rgba(255, 255, 255, 0.82)";

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: frost,
        borderRadius: 8,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <MapPin color={colors.danger} size={15} strokeWidth={2.2} />
      <Text
        style={[
          type.description,
          {
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sansBold,
            fontSize: 12.5,
            lineHeight: 17,
          },
        ]}
      >
        {address}
      </Text>
    </View>
  );
}

function OwnerPropertyOptionContent({ property, selected }: { property: OwnerProperty; selected: boolean }) {
  const { colors, fonts, type } = useTheme();
  const address = [property.city, property.state, property.pincode].filter(Boolean).join(", ");
  const typeLabel = property.type === "PG" ? "PG" : humanizeToken(property.type);

  return (
    <>
      <View style={{ alignItems: "center", gap: spacing.xs, width: 24 }}>
        <Ionicons color={colors.muted} name="home-outline" size={24} />
        <MapPin color={colors.muted} size={14} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <FitText
            numberOfLines={1}
            style={[type.bodyStrong, { color: selected ? colors.terracotta : colors.ink, flexShrink: 1 }]}
          >
            {property.name}
          </FitText>
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 10, lineHeight: 13 }}>
              {typeLabel}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", minWidth: 0 }}>
          <FitText numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1, fontSize: 11 }]}>
            {address}
          </FitText>
        </View>
      </View>
    </>
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
          <FitText numberOfLines={2} style={[type.description, { color: colors.muted }]}>
            {body}
          </FitText>
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
import { useWalletUnlocked, WalletPinModal } from "@/features/billing/wallet-pin-gate";
import { FitText } from "@/components/fit-text";
