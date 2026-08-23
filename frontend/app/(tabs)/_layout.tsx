import { useEffect, type ReactNode } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Pressable, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Building2, Compass, Home, KeyRound, MessageCircle, ShieldCheck, UserRound } from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { loadPinnedOwnerModulesForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { useAvailableAccounts } from "@/features/account/accounts";
import { NotificationOptInPrompt } from "@/features/notifications/notification-opt-in-prompt";
import { selectHaptic } from "@/lib/haptics";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import { useGetChatUnreadCountQuery } from "@/store/services/chat-api";
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

/**
 * A tab icon, solid when selected.
 *
 * <p>Filling a Lucide glyph in place does not work. Its paths are siblings in
 * source order, and for Home the DOOR is drawn before the house body — so a
 * fill on the whole glyph paints the body straight over the door. Recolouring
 * the stroke cannot rescue it; the door is already buried. The same applies to
 * the compass needle and the building's windows.
 *
 * <p>So the selected state draws the icon twice: a solid silhouette underneath,
 * then the ordinary outlined glyph on top in the page colour. The second pass
 * carries no fill, so every path — including ones the silhouette swallowed —
 * comes back as a clean knocked-out line.
 */
function TabIcon({
  color,
  focused,
  icon: Icon,
}: {
  // Expo Router types this as ColorValue, which is wider than a hex string.
  color: ColorValue;
  focused: boolean;
  icon: typeof Home;
}) {
  const { colors } = useTheme();

  if (!focused) {
    return <Icon color={color} size={20} strokeWidth={2} />;
  }

  return (
    <View style={{ height: 20, width: 20 }}>
      <Icon color={color} fill={color} size={20} strokeWidth={2} style={{ position: "absolute" }} />
      <Icon color={colors.surface} fill="none" size={20} strokeWidth={2} style={{ position: "absolute" }} />
    </View>
  );
}

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
          // Ink, not the blue accent — same selection language as TabSwitcher.
          const color = focused ? colors.ink : colors.kicker;
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
                flex: 1,
                gap: 3,
                height: "100%",
                justifyContent: "center",
                opacity: blocked ? 0.35 : 1,
              }}
            >
              {/* Selection is carried by the icon itself — a solid glyph rather
                  than a tinted cell or a rail. One signal, and it sits on the
                  thing you actually looked at. */}
              {options.tabBarIcon?.({ color, focused, size: 22 })}
              <Text
                numberOfLines={1}
                style={{
                  color,
                  // The weight lives in the FILE — a fontWeight on top of a
                  // loaded family makes Android synthesise a second bolding.
                  fontFamily: focused ? fonts.sansBold : fonts.sansMedium,
                  fontSize: 9,
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
  const blockedRoutes = showOwnerTab && !resolvedManagedProperty ? ["discovery", "owner", "notifications", "chat"] : [];

  // Conversations with something unread, counted server-side. Polled slowly:
  // the tab is a glance, and the thread list refreshes properly when opened.
  const unreadChats =
    useGetChatUnreadCountQuery(undefined, {
      pollingInterval: 20_000,
      refetchOnFocus: true,
      skip: !auth.accessToken,
    }).data?.count ?? 0;

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
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} icon={Home} />,
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          headerShown: false,
          tabBarLabel: "DISCOVER",
          title: "Discovery",
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} icon={Compass} />,
        }}
      />
      {/* Third for everybody. Tenancy and Owner are each conditional, so
          anchoring Chat straight after Discovery is what keeps its position
          fixed whichever workspace the reader is in. */}
      <Tabs.Screen
        name="chat"
        options={{
          headerShown: false,
          title: "Chats",
          tabBarLabel: "CHATS",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <TabIcon color={color} focused={focused} icon={MessageCircle} />
              {/* A dot rather than a number: the tab says "somebody wrote",
                  and how many conversations is the list's job to show. */}
              {unreadChats > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.primary,
                    borderColor: colors.surface,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    height: 9,
                    position: "absolute",
                    right: -2,
                    top: -1,
                    width: 9,
                  }}
                />
              ) : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="tenancy"
        options={{
          headerShown: false,
          title: "Tenancy",
          tabBarLabel: "TENANCY",
          href: showTenancyTab ? undefined : null,
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} icon={KeyRound} />,
        }}
      />
      <Tabs.Screen
        name="owner"
        options={{
          headerShown: false,
          title: isManagerAccount ? "Manager" : "Owner",
          tabBarLabel: isManagerAccount ? "MANAGER" : "OWNER",
          href: showOwnerTab ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} icon={isManagerAccount ? ShieldCheck : Building2} />
          ),
        }}
      />
      {/* Off the tab bar. Notifications open from the bell on Home, which is
          where the profile chip used to sit — a notification feed is something
          you glance at and dismiss, not a place you navigate to and stay. */}
      <Tabs.Screen name="notifications" options={{ headerShown: false, href: null, title: "Notifications" }} />
      <Tabs.Screen
        name="account"
        options={{
          headerShown: false,
          title: "Account",
          tabBarLabel: "ACCOUNT",
          tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} icon={UserRound} />,
        }}
      />
      </Tabs>
    </>
  );
}
