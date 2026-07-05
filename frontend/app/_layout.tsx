import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { Provider } from "react-redux";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadSession } from "@/auth/session-storage";
import { ToastProvider } from "@/components/toast";
import { loadAppSettings, pinnedOwnerModulesForUser, themeModeForUser } from "@/config/app-settings-storage";
import { useAppDispatch } from "@/store/hooks";
import { setActiveAccount } from "@/store/slices/account-slice";
import { setThemeMode } from "@/store/slices/app-config-slice";
import { markSessionHydrated, setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { store } from "@/store/store";
import { useTheme } from "@/theme/use-theme";

function ThemedRootStack() {
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();

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

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
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
        <Stack.Screen name="payment-method" options={{ headerShown: false }} />
        <Stack.Screen name="owner-active-tenancy-detail" options={{ headerShown: false }} />
        <Stack.Screen name="owner-billing" options={{ headerShown: false }} />
        <Stack.Screen name="owner-upcoming-cycles" options={{ headerShown: false }} />
        <Stack.Screen name="owner-deposit-manager" options={{ headerShown: false }} />
        <Stack.Screen name="owner-deposit-history" options={{ headerShown: false }} />
        <Stack.Screen name="owner-exit-requests" options={{ headerShown: false }} />
        <Stack.Screen name="owner-room-change-requests" options={{ headerShown: false }} />
        <Stack.Screen name="owner-property" options={{ headerShown: false }} />
        <Stack.Screen name="owner-register-property" options={{ headerShown: false }} />
        <Stack.Screen name="owner-rooms" options={{ headerShown: false }} />
        <Stack.Screen name="owner-vacancy-finder" options={{ headerShown: false }} />
        <Stack.Screen name="owner-expenses" options={{ headerShown: false }} />
        <Stack.Screen name="owner-local-places" options={{ headerShown: false }} />
        <Stack.Screen name="owner-staff" options={{ headerShown: false }} />
        <Stack.Screen name="owner-board" options={{ headerShown: false }} />
        <Stack.Screen name="owner-notices" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concerns" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concern-monitor" options={{ headerShown: false }} />
        <Stack.Screen name="owner-concern-detail" options={{ headerShown: false }} />
        <Stack.Screen name="concern-detail" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="owner-service-placeholder" options={{ headerShown: false }} />
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
          name="razorpay-checkout"
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
