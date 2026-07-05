import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Text, View } from "react-native";
import { ArchiveRestore, Bell, BellOff, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import {
  countByTopic,
  notificationSource,
  paginateAlerts,
  TopicBubbleRow,
  usePropertyAlertScope,
  type AlertTopic,
} from "@/features/notifications/alert-filters";
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

const PAGE_SIZE = 6;

export default function NotificationsScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const { activeAccount, inPropertyScope, isManagement, selectedProperty } = usePropertyAlertScope();

  const recentQuery = useGetRecentNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const olderQuery = useGetOlderNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  const [topic, setTopic] = useState<AlertTopic>("all");
  const [page, setPage] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void recentQuery.refetch();
      void olderQuery.refetch();
      // Refetch identities are stable for this hook instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const scopedRecent = (recentQuery.data ?? []).filter(inPropertyScope);
  const scopedOlder = (olderQuery.data ?? []).filter(inPropertyScope);

  const topicCounts = countByTopic(scopedRecent);
  const unreadCount = [...scopedRecent, ...scopedOlder].filter((notification) => !notification.readAt).length;
  const olderCount = scopedOlder.length;

  // Property switches re-scope the queue; start from the first page again.
  useEffect(() => {
    setPage(0);
    setTopic("all");
  }, [selectedProperty?.id]);

  const queueItems = topic === "all" ? scopedRecent : scopedRecent.filter((notification) => notificationSource(notification) === topic);
  const pagedQueue = paginateAlerts(queueItems, page, PAGE_SIZE);

  function changeTopic(next: AlertTopic) {
    setTopic(next);
    setPage(0);
  }

  async function handleNotificationPress(recipientId: string, alreadyRead: boolean) {
    if (alreadyRead) {
      return;
    }
    try {
      await markRead(recipientId).unwrap();
    } catch {
      // Feed refetches on focus; failing to mark read should not block viewing.
    }
  }

  async function handleMarkAllRead() {
    try {
      if (isManagement && selectedProperty) {
        // Server read-all clears every property's alerts; per-recipient marks
        // keep the other properties' unread state intact.
        const unread = [...scopedRecent, ...scopedOlder].filter((notification) => !notification.readAt);
        await Promise.all(unread.map((notification) => markRead(notification.recipientId).unwrap()));
      } else {
        await markAllRead(activeAccount).unwrap();
      }
    } catch {
      // Keep this quiet; stale unread state resolves on next successful refresh.
    }
  }

  const loading = recentQuery.isLoading || olderQuery.isLoading;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: spacing.md }}>
      <ScreenHeader
        title="Notifications,"
        italicTail="one queue."
        subtitle={
          isManagement && selectedProperty
            ? `Notifications for ${selectedProperty.name}. Switch property from Home to see its own queue.`
            : user?.activeTenant
              ? "Your tenancy notifications in one queue — filter by topic below."
              : "Notifications will appear here once your tenancy or property workspace is active."
        }
        trailing={
          unreadCount > 0 ? (
            <AnimatedPressable
              accessibilityLabel="Mark all alerts as read"
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
                  fontFamily: fonts.sans,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.4,
                }}
                selectable
              >
                Mark read
              </Text>
            </AnimatedPressable>
          ) : null
        }
      />

      {loading ? <SkeletonCard /> : null}

      {recentQuery.isError ? (
        <EmptyState
          icon={BellOff}
          eyebrow="Backend unreachable"
          title="Couldn't load alerts"
          description="Check your backend connection, then pull down to try again."
        />
      ) : null}

      {!loading && !recentQuery.isError ? (
        <View style={{ gap: spacing.lg }}>
          <TopicBubbleRow active={topic} counts={topicCounts} onChange={changeTopic} />

          {queueItems.length === 0 ? (
            <EmptyState
              icon={Bell}
              eyebrow="All clear"
              title="Nothing in the queue"
              description={
                topic === "all"
                  ? "No notifications in the last seven days for this scope."
                  : "No recent notifications under this topic. Check older ones below."
              }
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.sm }}>
                {pagedQueue.pageItems.map((notification) => (
                  <NotificationRow
                    key={notification.recipientId}
                    notification={notification}
                    onPress={() => void handleNotificationPress(notification.recipientId, Boolean(notification.readAt))}
                  />
                ))}
              </View>
              {pagedQueue.totalPages > 1 ? (
                <PaginationBar
                  hasNext={pagedQueue.hasNext}
                  hasPrevious={pagedQueue.hasPrevious}
                  onNext={() => setPage(pagedQueue.page + 1)}
                  onPrevious={() => setPage(Math.max(0, pagedQueue.page - 1))}
                  page={pagedQueue.page}
                  totalElements={pagedQueue.totalElements}
                  totalPages={pagedQueue.totalPages}
                />
              ) : null}
            </View>
          )}

          {olderCount > 0 ? (
            <AnimatedPressable
              accessibilityLabel="Open older alerts"
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
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  On record
                </Text>
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.display,
                    fontSize: 17,
                    fontWeight: "500",
                    letterSpacing: -0.2,
                  }}
                  selectable
                >
                  Older notifications
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  {olderCount} older item{olderCount === 1 ? "" : "s"} from your current scope
                </Text>
              </View>
              <ChevronRight color={colors.primary} size={20} strokeWidth={2.2} />
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}
