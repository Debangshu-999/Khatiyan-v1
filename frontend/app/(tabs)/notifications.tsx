import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Text, View } from "react-native";
import { ArchiveRestore, Bell, BellOff, ChevronRight } from "lucide-react-native";
import { useGetNudgeUnreadCountQuery, NUDGE_REFETCH_OPTIONS } from "@/store/services/nudge-api";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { BackButton } from "@/features/owner/owner-ui";
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
      {/* Notifications left the tab bar and now open from the bell on Home, so
          they need a way back the way every other pushed screen has one.

          Nudges sit on the far right of that row rather than in a tab below.
          One pill serves both roles — management lands on the send list, a
          tenant on their own received nudges — so neither side needs a second
          entry point invented for it. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
        <NudgesPill isManagement={isManagement} />
      </View>
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
                  fontFamily: fonts.sansBold,
                  fontSize: 11,
                  letterSpacing: 0.4,
                }}
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
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

/**
 * The way into nudges, from the row the back button already occupies.
 *
 * <p>The badge is tenant-only: on the management side this opens the send list,
 * where an unread count would be counting the reader's own messages back at
 * them. The count endpoint is tenant-scoped too, so the query is skipped rather
 * than answered with a 403.
 */
function NudgesPill({ isManagement }: { isManagement: boolean }) {
  const router = useGuardedRouter();
  const { colors, fonts } = useTheme();
  const unreadQuery = useGetNudgeUnreadCountQuery(undefined, {
    ...NUDGE_REFETCH_OPTIONS,
    skip: isManagement,
  });
  const unread = isManagement ? 0 : unreadQuery.data ?? 0;

  return (
    <AnimatedPressable
      accessibilityLabel={isManagement ? "Nudge a tenant" : "Open your nudges"}
      accessibilityRole="button"
      onPress={() => router.push(isManagement ? "/owner-nudges" : "/nudges")}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 3,
        // Same height and the same negative bottom margin as BackButton. That
        // margin shortens the back chip's layout box while it still paints full
        // height, so a plain centred sibling sits visibly high; matching both
        // numbers puts the two centres in the same place.
        height: 30,
        marginBottom: -spacing.sm,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>
        Nudges
      </Text>
      {unread > 0 ? (
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: 999,
            minWidth: 17,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontFamily: fonts.sansBold,
              fontSize: 10,
              textAlign: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
      <ChevronRight color={colors.muted} size={14} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}
