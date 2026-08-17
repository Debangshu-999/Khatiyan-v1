import { Text, View } from "react-native";

import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Bell } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useAppSelector } from "@/store/hooks";
import {
  NOTIFICATION_REFETCH_OPTIONS,
  useGetUnreadNotificationCountQuery,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Persistent bell affordance for the header right slot — drives the
// Notifications stack screen. Skips the count query when no session is
// hydrated so we don't get a transient 401 on the splash.
export function NotificationBell() {
  const router = useGuardedRouter();
  const { colors, fonts } = useTheme();
  const hasSession = useAppSelector((state) => Boolean(state.auth.accessToken));
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const { data: unreadCount = 0 } = useGetUnreadNotificationCountQuery(activeAccount, {
    ...NOTIFICATION_REFETCH_OPTIONS,
    skip: !hasSession,
    // Poll while the app is foregrounded so the badge stays live without the
    // user opening the feed. Foreground resume also triggers refetchOnFocus.
    pollingInterval: 30_000,
  });

  return (
    <AnimatedPressable
      accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      onPress={() => router.push("/notifications-feed")}
      style={{
        alignItems: "center",
        height: 38,
        justifyContent: "center",
        marginRight: spacing.md,
        width: 38,
      }}
    >
      <Bell color={colors.ink} size={20} strokeWidth={2.1} />
      {unreadCount > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primary,
            borderColor: colors.background,
            borderRadius: 999,
            borderWidth: 2,
            justifyContent: "center",
            minWidth: 18,
            paddingHorizontal: 4,
            paddingVertical: 1,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontFamily: fonts.sansBold,
              fontSize: 10,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
