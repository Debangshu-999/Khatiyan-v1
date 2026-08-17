import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { Provider } from "react-redux";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadSession } from "@/auth/session-storage";
import { ScreenErrorFallback } from "@/components/screen-error-fallback";
import { ToastProvider } from "@/components/toast";
import { SessionExpiryGuard } from "@/features/auth/session-expiry-guard";
import { loadAppSettings, pinnedOwnerModulesForUser, themeModeForUser } from "@/config/app-settings-storage";
import { useAppDispatch } from "@/store/hooks";
import { setActiveAccount } from "@/store/slices/account-slice";
import { setThemeMode } from "@/store/slices/app-config-slice";
import { markSessionHydrated, setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { store } from "@/store/store";
import { useAppFonts } from "@/theme/use-app-fonts";
import { useTheme } from "@/theme/use-theme";

function ThemedRootStack() {
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    let mounted = true;

    Promise.all([loadSession(), loadAppSettings()])
      .then(([session, settings]) => {
        if (!mounted) {
          return;
        }

        const hydratedThemeMode = themeModeForUser(settings, session?.user?.id);
        if (hydratedThemeMode) {
          dispatch(setThemeMode(hydratedThemeMode));
        } else if (session?.user) {
          dispatch(setThemeMode("light"));
        }

        if (session?.user) {
          dispatch(setPinnedOwnerModules(pinnedOwnerModulesForUser(settings, session.user.id)));
        } else {
          dispatch(setPinnedOwnerModules([]));
        }

        if (settings.activeAccount) {
          dispatch(setActiveAccount(settings.activeAccount));
        }

        if (session?.accessToken && session.user) {
          dispatch(setSession(session));
        }
      })
      .finally(() => {
        if (mounted) {
          dispatch(markSessionHydrated());
        }
      });

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  // Hold on a plain background until the typefaces are in. Rendering first and
  // reflowing when they land flashes the whole app on every cold start.
  if (!fontsLoaded) {
    return <View style={{ backgroundColor: colors.background, flex: 1 }} />;
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Above the navigator so it can announce an expiry from any screen. */}
      <SessionExpiryGuard />
      <Stack
        screenOptions={{
          // Native push/pop. "simple_push" is JS-driven and flashes a blank
          // frame on the back gesture; the native slide keeps the previous
          // screen painted through the whole transition. slide_from_left makes a
          // pushed screen enter from the left; the native pop mirrors it.
          animation: "slide_from_left",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.ink },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="get-started" options={{ animation: "fade", headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="account-select" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="owner-tenancy" options={{ headerShown: false }} />
        <Stack.Screen name="owner-action-center" options={{ headerShown: false }} />
        <Stack.Screen name="owner-onboard-tenant" options={{ headerShown: false }} />
        <Stack.Screen name="owner-active-tenancy-detail" options={{ headerShown: false }} />
        <Stack.Screen name="owner-billing" options={{ headerShown: false }} />
        <Stack.Screen name="owner-payment-history" options={{ headerShown: false }} />
        <Stack.Screen name="owner-tenant-bills" options={{ headerShown: false }} />
        <Stack.Screen name="owner-upcoming-cycles" options={{ headerShown: false }} />
        <Stack.Screen name="owner-deposit-manager" options={{ headerShown: false }} />
        <Stack.Screen name="owner-deposit-history" options={{ headerShown: false }} />
        <Stack.Screen name="owner-exit-requests" options={{ headerShown: false }} />
        <Stack.Screen name="owner-room-change-requests" options={{ headerShown: false }} />
        <Stack.Screen name="owner-edit-property" options={{ headerShown: false }} />
        <Stack.Screen name="owner-property" options={{ headerShown: false }} />
        <Stack.Screen name="owner-register-property" options={{ headerShown: false }} />
        <Stack.Screen name="owner-rooms" options={{ headerShown: false }} />
        <Stack.Screen name="owner-vacancy-finder" options={{ headerShown: false }} />
        <Stack.Screen name="owner-expenses" options={{ headerShown: false }} />
        <Stack.Screen name="owner-pnl" options={{ headerShown: false }} />
        <Stack.Screen name="owner-local-places" options={{ headerShown: false }} />
        <Stack.Screen name="owner-nearby-places" options={{ headerShown: false }} />
        <Stack.Screen name="owner-staff" options={{ headerShown: false }} />
        <Stack.Screen name="owner-manager-permissions" options={{ headerShown: false }} />
        <Stack.Screen name="owner-tenancy-agreement" options={{ headerShown: false }} />
        <Stack.Screen name="owner-exit-policies" options={{ headerShown: false }} />
        <Stack.Screen name="owner-end-tenancy" options={{ headerShown: false }} />
        <Stack.Screen name="owner-board" options={{ headerShown: false }} />
        <Stack.Screen name="owner-notices" options={{ headerShown: false }} />
        <Stack.Screen name="owner-upcoming-notices" options={{ headerShown: false }} />
        <Stack.Screen name="owner-nudges" options={{ headerShown: false }} />
        <Stack.Screen name="nudges" options={{ headerShown: false }} />
        <Stack.Screen name="owner-enquiries" options={{ headerShown: false }} />
        <Stack.Screen name="owner-notice-detail" options={{ headerShown: false }} />
        <Stack.Screen name="owner-notice-create" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concerns" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concern-monitor" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concern-detail" options={{ headerShown: false }} />
        <Stack.Screen name="concern-detail" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen
          name="notifications-feed"
          options={{
            animation: "fade",
            contentStyle: { backgroundColor: "transparent" },
            headerShown: false,
            presentation: "transparentModal",
          }}
        />
        <Stack.Screen
          name="notifications-older"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="concerns"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="create-concern"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-deposit"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-billing-cycle"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-billing-history"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-request-history"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-exit-request"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-agreement-view"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="tenancy-room-change-request"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="property-board"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="property-notices"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="account-settings"
          options={{
            animation: "fade",
            contentStyle: { backgroundColor: "transparent" },
            headerShown: false,
            presentation: "transparentModal",
          }}
        />
      </Stack>
    </View>
  );
}

/**
 * Expo Router renders this instead of unwinding to a crash when any route below
 * throws while rendering. Without it a single bad field takes down the whole app
 * and the user's only recourse is force-quitting.
 */
export { ScreenErrorFallback as ErrorBoundary };

export default function RootLayout() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ToastProvider>
          <ThemedRootStack />
        </ToastProvider>
      </SafeAreaProvider>
    </Provider>
  );
}
