import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArchiveRestore, BellOff, ChevronRight, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { BloomModalShell } from "@/components/bloom-modal-shell";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { NotificationRow } from "@/features/notifications/notification-row";
import { useAppSelector } from "@/store/hooks";
import {
  NOTIFICATION_REFETCH_OPTIONS,
  useGetOlderNotificationsQuery,
  useGetRecentNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function NotificationsFeedScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const recentQuery = useGetRecentNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const olderQuery = useGetOlderNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  // The feed screen stays mounted underneath the older screen. When the user
  // returns to it (or re-focuses it), pull fresh data so newly arrived items
  // and read-state changes made elsewhere are reflected.
  useFocusEffect(
    useCallback(() => {
      void recentQuery.refetch();
      void olderQuery.refetch();
      // refetch identities are stable for a given hook instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const recent = recentQuery.data ?? [];
  const olderCount = olderQuery.data?.length ?? 0;
  const unreadCount = recent.filter((notification) => !notification.readAt).length;
  const isLoading = recentQuery.isLoading;
  const isError = recentQuery.isError;

  async function handleNotificationPress(recipientId: string, alreadyRead: boolean) {
    if (alreadyRead) {
      return;
    }
    try {
      await markRead(recipientId).unwrap();
    } catch {
      // Silent failure — feed will re-fetch on next focus.
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead(activeAccount).unwrap();
    } catch {
      // ignore
    }
  }

  return (
    <BloomModalShell>
      {(close) => (
    <ScreenScrollView>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Inbox · last 7 days
        </Text>
        <CloseButton onPress={close} />
      </View>

      <ScreenHeader
        title="Notifications"
        italicTail="for you."
        subtitle={
          user?.activeTenant
            ? "Scoped to your current tenancy — rent reminders, concerns, notices and payment updates."
            : user?.role === "OWNER"
              ? "Everything from your portfolio — concerns, exits, billing and notices across your properties."
              : "We'll start filling this once you become an active tenant or own a property."
        }
        trailing={
          unreadCount > 0 ? (
            <AnimatedPressable
              accessibilityLabel="Mark all as read"
              onPress={() => void handleMarkAllRead()}
              style={{
                alignItems: "center",
                borderColor: colors.border,
                borderRadius: 10,
                borderWidth: 1,
                flexDirection: "row",
                gap: spacing.xs,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <ArchiveRestore color={colors.primary} size={14} strokeWidth={2.2} />
              <Text
                style={{
                  color: colors.primary,
                  fontFamily: fonts.sansBold,
                  fontSize: 11,
                  letterSpacing: 0.4,
                }}
              >
                Mark all read
              </Text>
            </AnimatedPressable>
          ) : null
        }
      />

      {isLoading ? (
        <SkeletonCard />
      ) : null}

      {isError ? (
        <EmptyState
          icon={BellOff}
          title="Couldn't load notifications"
          description="Check your backend connection from Account, then pull down to try again."
        />
      ) : null}

      {!isLoading && !isError && recent.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No recent notifications"
          description={
            user?.activeTenant || user?.role === "OWNER"
              ? "Nothing in the last 7 days. Older items might still be available below."
              : "You'll see rent reminders, notices and updates here after you start a tenancy."
          }
        />
      ) : null}

      {recent.map((notification) => (
        <NotificationRow
          key={notification.recipientId}
          notification={notification}
          onPress={() => void handleNotificationPress(notification.recipientId, Boolean(notification.readAt))}
        />
      ))}

      {olderCount > 0 ? (
        <AnimatedPressable
          accessibilityLabel="Open older notifications"
          onPress={() => router.push("/notifications-older")}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 14,
            borderStyle: "dashed",
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.md,
            padding: spacing.lg,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              On record
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 17,
                letterSpacing: -0.2,
              }}
            >
              Older notifications
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {olderCount} older item{olderCount === 1 ? "" : "s"} from your current scope
            </Text>
          </View>
          <ChevronRight color={colors.primary} size={20} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : null}
    </ScreenScrollView>
      )}
    </BloomModalShell>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Close"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        width: 36,
      }}
    >
      <X color={colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}
