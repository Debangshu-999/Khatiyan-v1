import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { ArchiveRestore, Bell, BellOff, ChevronRight } from "lucide-react-native";
import { useGetNudgeUnreadCountQuery, NUDGE_REFETCH_OPTIONS } from "@/store/services/nudge-api";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { BackButton } from "@/features/owner/owner-ui";
import { PullUpSleeve } from "@/features/notifications/pull-up-sleeve";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import {
  countByTopic,
  notificationSource,
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

/** First screenful, and how many more arrive each time the reader reaches the end. */
/**
 * Room left under the feed for the pinned sleeve.
 *
 * <p>Covers the floating tab bar AND the sleeve above it. Both overlay the list rather than
 * sitting below it, so anything short of this leaves the final notification
 * half-covered with no way to scroll it clear.
 */
const SLEEVE_CLEARANCE = 232;

const PAGE_SIZE = 6;

/** How close to the bottom counts as "reached the end", in px. */
const LOAD_MORE_THRESHOLD_PX = 240;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // Property switches re-scope the queue; collapse back to one screenful.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setTopic("all");
  }, [selectedProperty?.id]);

  const queueItems = topic === "all" ? scopedRecent : scopedRecent.filter((notification) => notificationSource(notification) === topic);
  const visibleQueue = queueItems.slice(0, visibleCount);
  const hasMore = visibleCount < queueItems.length;

  /**
   * Reveals the next batch as the reader nears the end.
   *
   * <p>The whole window is already in memory — the feed arrives as one payload
   * — so this pages the RENDER, not the fetch. That is the only reason it can
   * be this simple, and the reason it must change if the feed ever paginates
   * server-side.
   */
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMore) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, queueItems.length));
    }
  }

  function changeTopic(next: AlertTopic) {
    setTopic(next);
    setVisibleCount(PAGE_SIZE);
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
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        contentContainerStyle={{
          // Clears the pinned sleeve, so the last notification can still be
          // scrolled out from under it.
          paddingBottom: olderCount > 0 ? SLEEVE_CLEARANCE : undefined,
          paddingTop: spacing.md,
        }}
        onScroll={handleScroll}
        safeAreaEdges={["top", "bottom"]}
        scrollEventThrottle={16}
      >
      {/* Notifications left the tab bar and now open from the bell on Home, so
          they need a way back the way every other pushed screen has one.

          Nudges sits on the far right of that row. Mark read sits beside the
          title, and is always rendered — it used to exist only while something
          was unread, so the control vanished the instant it worked and the
          header reflowed around it. It greys out now instead. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
        <NudgesPill isManagement={isManagement} />
      </View>
      <ScreenHeader
        title="Notifications"
        trailing={<MarkAllReadButton disabled={unreadCount === 0} onPress={() => void handleMarkAllRead()} />}
        subtitle={
          isManagement && selectedProperty
            ? `Notifications for ${selectedProperty.name}. Switch property from Home to see its own queue.`
            : user?.activeTenant
              ? "Your tenancy notifications in one queue — filter by topic below."
              : "Notifications will appear here once your tenancy or property workspace is active."
        }
      />

      {loading ? <SkeletonCard /> : null}

      {recentQuery.isError ? (
        <EmptyState
          icon={BellOff}
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
                {visibleQueue.map((notification) => (
                  <NotificationRow
                    key={notification.recipientId}
                    notification={notification}
                    onPress={() => void handleNotificationPress(notification.recipientId, Boolean(notification.readAt))}
                  />
                ))}
              </View>
              {/* A foot for the list either way: still loading, or genuinely the
                  end. Without it the last card just stops, and there is no way to
                  tell a finished list from one that failed to extend. */}
              {hasMore ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                  That&apos;s all for now
                </Text>
              )}
            </View>
          )}

        </View>
      ) : null}
      </ScreenScrollView>

      {/* Outside the scroll view and pinned to the bottom edge. In the list it
          scrolled away, which put the one control answering "is there more?"
          behind the whole feed. */}
      {olderCount > 0 ? (
        <PullUpSleeve count={olderCount} onOpen={() => router.push("/notifications-older")} />
      ) : null}
    </View>
  );
}

/**
 * Mark-all-read, always on screen.
 *
 * <p>It used to render only while something was unread, which meant the control
 * vanished the instant it worked — and reappeared later somewhere the reader
 * was not looking. Greyed and inert says the same thing without moving.
 */
function MarkAllReadButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const tint = disabled ? colors.muted : colors.primary;

  return (
    <AnimatedPressable
      accessibilityLabel="Mark all alerts as read"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: disabled ? colors.border : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <ArchiveRestore color={tint} size={13} strokeWidth={2.2} />
      <Text style={{ color: tint, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.4 }}>
        Mark read
      </Text>
    </AnimatedPressable>
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
        // Height matched to BackButton. It used to carry BackButton's negative
        // bottom margin too, to line the two up as centred siblings — but the
        // row is flex-start now and the pill sits above Mark read, so that -10
        // was eating the 6px column gap and overlapping the button below it.
        height: 30,
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
