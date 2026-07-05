import { useEffect, type ReactNode } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Building2, Compass, Home, KeyRound, ShieldCheck, UserRound } from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { loadPinnedOwnerModulesForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { useAvailableAccounts } from "@/features/account/accounts";
import { NotificationOptInPrompt } from "@/features/notifications/notification-opt-in-prompt";
import { selectHaptic } from "@/lib/haptics";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import { NOTIFICATION_REFETCH_OPTIONS, useGetUnreadNotificationCountQuery } from "@/store/services/notification-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { clearActiveAccount, setActiveAccount } from "@/store/slices/account-slice";
import { clearSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { useTheme } from "@/theme/use-theme";

// Custom bottom bar stuck to the screen's bottom edge, spanning the full width
// with a hairline top border and a soft top shadow. The active tab is a
// soft-tinted contained pill with its icon + label; inactive tabs use a muted
// tone. Honours the bottom safe-area inset via padding so the row clears the
// home indicator. Routes hidden via `href: null` get a no-op `tabBarButton`
// from expo-router, which is how we skip them here.
type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<
    string,
    {
      options: {
        tabBarLabel?: unknown;
        title?: string;
        tabBarButton?: unknown;
        tabBarIcon?: (props: { color: string; focused: boolean; size: number }) => ReactNode;
      };
    }
  >;
  navigation: {
    emit: (event: { canPreventDefault: true; target: string; type: "tabPress" }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  // Route names rendered greyed-out and inert (press does nothing). Used to
  // gate property-scoped tabs until a management workspace has a property.
  blockedRoutes?: string[];
};

function BottomTabBar({ blockedRoutes = [], descriptors, navigation, state }: TabBarProps) {
  const { colors, fonts, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const focusedKey = state.routes[state.index]?.key;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopColor: colors.borderStrong,
        borderTopWidth: 1,
        bottom: 0,
        left: 0,
        // Pad past the home indicator while the surface still reaches the edge.
        paddingBottom: insets.bottom,
        position: "absolute",
        right: 0,
      }}
    >
      <View style={{ flexDirection: "row", height: 60 }}>
        {state.routes.map((route) => {
          const { options } = descriptors[route.key];
          if (options.tabBarButton) {
            return null;
          }
          const focused = route.key === focusedKey;
          const blocked = blockedRoutes.includes(route.name) && !focused;
          const color = focused ? colors.primary : colors.kicker;
          const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;

          function onPress() {
            if (blocked) {
              return;
            }
            const event = navigation.emit({ canPreventDefault: true, target: route.key, type: "tabPress" });
            if (!focused && !event.defaultPrevented) {
              selectHaptic();
              navigation.navigate(route.name);
            }
          }

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked, selected: focused }}
              key={route.key}
              onPress={onPress}
              style={{
                alignItems: "center",
                // Active tint fills the whole tab cell — no top/bottom gap.
                backgroundColor: focused ? colors.primarySoft : "transparent",
                flex: 1,
                gap: 3,
                height: "100%",
                justifyContent: "center",
                opacity: blocked ? 0.35 : 1,
              }}
            >
              {/* Accent rail across the top edge marks the active tab. */}
              {focused ? (
                <View
                  style={{
                    backgroundColor: colors.primary,
                    borderBottomLeftRadius: 3,
                    borderBottomRightRadius: 3,
                    height: 3,
                    left: 0,
                    position: "absolute",
                    right: 0,
                    top: 0,
                  }}
                />
              ) : null}
              {options.tabBarIcon?.({ color, focused, size: 22 })}
              <Text
                numberOfLines={1}
                style={{
                  color,
                  fontFamily: fonts.sans,
                  fontSize: 9,
                  fontWeight: focused ? "900" : "800",
                  letterSpacing: 0,
                  textAlign: "center",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors, fonts } = useTheme();
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });
  const { accounts, loading: accountsLoading } = useAvailableAccounts();
  const manageablePropertiesQuery = useListMyPropertiesQuery(undefined, { skip: !auth.accessToken });
  const managesAnyProperty = (manageablePropertiesQuery.data ?? []).length > 0;
  const hasManagementAccess = auth.user?.role === "OWNER" || managesAnyProperty;
  const hasTenantAccess = Boolean(auth.user?.activeTenant) && !hasManagementAccess;
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const isManagerAccount = activeAccount === "manager";
  // When an account is active, tabs follow it; otherwise fall back to the
  // capability heuristic so single-account users see their tab immediately.
  const showOwnerTab = activeAccount ? activeAccount === "owner" || isManagerAccount : hasManagementAccess;
  const showTenancyTab = activeAccount ? activeAccount === "tenant" : hasTenantAccess;
  const accountKey = accounts.join("|");

  // Management workspaces are property-scoped. Until a property is resolved —
  // an explicit pick on Home, or the only property an owner/manager has — the
  // property-dependent tabs stay greyed out and inert (mirrors Home's
  // resolveSelectedProperty fallback). Tenant accounts are never gated.
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const manageableProperties = manageablePropertiesQuery.data ?? [];
  const resolvedManagedProperty = selectedPropertyId
    ? manageableProperties.find((property) => property.id === selectedPropertyId) ?? null
    : manageableProperties.length === 1
      ? manageableProperties[0]
      : null;
  const blockedRoutes = showOwnerTab && !resolvedManagedProperty ? ["discovery", "owner", "notifications"] : [];

  // Drives the red dot on the Alerts tab. Account-scoped like the feed itself.
  const { data: unreadAlertCount = 0 } = useGetUnreadNotificationCountQuery(activeAccount, {
    ...NOTIFICATION_REFETCH_OPTIONS,
    skip: !auth.accessToken,
    pollingInterval: 30_000,
  });
  const hasUnreadAlerts = unreadAlertCount > 0;

  useEffect(() => {
    const status =
      typeof profileQuery.error === "object" && profileQuery.error && "status" in profileQuery.error
        ? profileQuery.error.status
        : null;

    if (status === 401 || status === 403) {
      dispatch(clearActiveAccount());
      dispatch(setPinnedOwnerModules([]));
      dispatch(clearSession());
      dispatch(api.util.resetApiState());
      void saveActiveAccount(null);
      void clearStoredSession();
    }
  }, [dispatch, profileQuery.error]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }
    if (activeAccount && !accounts.includes(activeAccount)) {
      dispatch(setActiveAccount(null));
      dispatch(setPinnedOwnerModules([]));
      void saveActiveAccount(null);
      return;
    }
    if (!activeAccount && accounts.length === 1) {
      dispatch(setActiveAccount(accounts[0]));
      void saveActiveAccount(accounts[0]);
      if (auth.user?.id) {
        void loadPinnedOwnerModulesForUser(auth.user.id).then((pins) => dispatch(setPinnedOwnerModules(pins)));
      }
    }
  }, [accountKey, accounts, accountsLoading, activeAccount, auth.user?.id, dispatch]);

  if (!auth.hydrated) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!auth.accessToken) {
    return <Redirect href="/auth" />;
  }

  if (accountsLoading || (!activeAccount && accounts.length === 1)) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!activeAccount && accounts.length > 1) {
    return <Redirect href="/account-select" />;
  }

  return (
    <>
      <NotificationOptInPrompt />
      <Tabs
      tabBar={(props) => <BottomTabBar {...props} blockedRoutes={blockedRoutes} />}
      screenOptions={{
        // Opacity-only cross-fade. The previous "shift" animation translated
        // scenes sideways, briefly exposing the outgoing screen's edge shadow
        // in the incoming tab; a fade has no displacement, so no bleed.
        animation: "fade",
        sceneStyle: {
          backgroundColor: colors.background,
        },
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 22,
          fontWeight: "500",
        },
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          // The greeting lives inside the screen body, so the header would
          // duplicate it. Hide the header entirely and let the screen own
          // the top-of-page typography.
          headerShown: false,
          title: "Home",
          tabBarLabel: "HOME",
          tabBarIcon: ({ color }) => <Home color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          headerShown: false,
          tabBarLabel: "DISCOVER",
          title: "Discovery",
          tabBarIcon: ({ color }) => <Compass color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="tenancy"
        options={{
          headerShown: false,
          title: "Tenancy",
          tabBarLabel: "TENANCY",
          href: showTenancyTab ? undefined : null,
          tabBarIcon: ({ color }) => <KeyRound color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="owner"
        options={{
          headerShown: false,
          title: isManagerAccount ? "Manager" : "Owner",
          tabBarLabel: isManagerAccount ? "MANAGER" : "OWNER",
          href: showOwnerTab ? undefined : null,
          tabBarIcon: ({ color }) =>
            isManagerAccount ? <ShieldCheck color={color} size={20} strokeWidth={2} /> : <Building2 color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Notifications",
          tabBarLabel: "NOTIFICATIONS",
          tabBarIcon: ({ color }) => (
            <View>
              <Bell color={color} size={20} strokeWidth={2} />
              {hasUnreadAlerts ? (
                <View
                  style={{
                    backgroundColor: colors.danger,
                    borderColor: colors.surface,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    height: 11,
                    position: "absolute",
                    right: -5,
                    top: -3,
                    width: 11,
                  }}
                />
              ) : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          headerShown: false,
          href: null,
          title: "Account",
          tabBarLabel: "ACCOUNT",
          tabBarIcon: ({ color }) => <UserRound color={color} size={20} strokeWidth={2} />,
        }}
      />
      </Tabs>
    </>
  );
}
