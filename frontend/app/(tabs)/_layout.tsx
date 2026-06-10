import { useEffect } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Bell, Building2, Compass, Home, KeyRound, UserRound } from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationOptInPrompt } from "@/features/notifications/notification-opt-in-prompt";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import { clearSession } from "@/store/slices/auth-slice";
import { useTheme } from "@/theme/use-theme";

export default function TabLayout() {
  const { colors, fonts } = useTheme();
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });

  useEffect(() => {
    const status =
      typeof profileQuery.error === "object" && profileQuery.error && "status" in profileQuery.error
        ? profileQuery.error.status
        : null;

    if (status === 401 || status === 403) {
      dispatch(clearSession());
      dispatch(api.util.resetApiState());
      void clearStoredSession();
    }
  }, [dispatch, profileQuery.error]);

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

  return (
    <>
      <NotificationOptInPrompt />
      <Tabs
      screenOptions={{
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
        headerRight: () => <NotificationBell />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.kicker,
        tabBarLabelStyle: {
          fontFamily: fonts.sans,
          fontSize: 10.5,
          fontWeight: "700",
          letterSpacing: 0.6,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
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
          href: auth.user?.role === "USER" ? undefined : null,
          tabBarIcon: ({ color }) => <KeyRound color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="owner"
        options={{
          headerShown: false,
          title: "Owner",
          tabBarLabel: "OWNER",
          href: auth.user?.role === "OWNER" ? undefined : null,
          tabBarIcon: ({ color }) => <Building2 color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarLabel: "ALERTS",
          tabBarIcon: ({ color }) => <Bell color={color} size={20} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          headerShown: false,
          title: "Account",
          tabBarLabel: "ACCOUNT",
          tabBarIcon: ({ color }) => <UserRound color={color} size={20} strokeWidth={2} />,
        }}
      />
      </Tabs>
    </>
  );
}
