import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Bell, BellOff, ChevronRight } from "lucide-react-native";
import { useGetNudgeUnreadCountQuery, NUDGE_REFETCH_OPTIONS } from "@/store/services/nudge-api";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";

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

const CONCERN_EMPTY_ILLUSTRATION = require("../../assets/workspace/concern-empty_state.png");

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

  /**
   * Which alerts were unread when this visit began.
   *
   * <p>
   * Opening the screen marks everything read, so without this snapshot the
   * ring would clear before the reader's eyes had reached it and there would
   * be no way to tell what had arrived since last time. The server is told
   * immediately; the ring is drawn from what WAS unread on arrival, and is
   * gone by the next visit. That is the whole model: the bell carries "there
   * is something new", and opening the screen answers it.
   */
  const [unreadOnArrival, setUnreadOnArrival] = useState<Set<string>>(new Set());
  /**
   * Bumped on every focus, so the capture below re-runs per VISIT.
   *
   * <p>Keying it off `loading` alone was not enough: the second visit reads
   * from cache, so `isLoading` never flips and the effect never fired — the
   * previous visit's snapshot survived and its rings came back on a queue that
   * had been read minutes ago.
   */
  const [visitId, setVisitId] = useState(0);
  // Guards the capture to once per visit, since the effect also has to wait
  // for a first load that may finish after focus.
  const arrivalCaptured = useRef(false);

  useFocusEffect(
    useCallback(() => {
      arrivalCaptured.current = false;
      setVisitId((current) => current + 1);
      void recentQuery.refetch();
      void olderQuery.refetch();
      // Refetch identities are stable for this hook instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const scopedRecent = (recentQuery.data ?? []).filter(inPropertyScope);
  const scopedOlder = (olderQuery.data ?? []).filter(inPropertyScope);

  const topicCounts = countByTopic(scopedRecent);
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

  /**
   * Marks the whole visible queue read.
   *
   * <p>No longer a button. "Mark read" was a control that existed only to
   * undo a state the act of looking had already resolved — and it vanished
   * the instant it worked, reflowing the header around itself.
   */
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

  useEffect(() => {
    if (loading || arrivalCaptured.current) {
      return;
    }
    arrivalCaptured.current = true;

    const unread = [...scopedRecent, ...scopedOlder].filter((notification) => !notification.readAt);
    if (unread.length === 0) {
      setUnreadOnArrival(new Set());
      return;
    }
    setUnreadOnArrival(new Set(unread.map((notification) => notification.recipientId)));
    void handleMarkAllRead();
    // Once per visit, and not keyed off the arrays — those are rebuilt on
    // every render and would re-capture forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visitId]);

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
      {/* Nudges sits beside the title, in the slot Mark read used to hold.
          Its own row above the header was a strip of nothing with one pill in
          it, and the pill is a sibling of the heading rather than a thing that
          happens before it. */}
      <ScreenHeader
        title="Notifications"
        trailing={<NudgesPill isManagement={isManagement} />}
        subtitle={
          isManagement && selectedProperty
            ? `Notifications for ${selectedProperty.name}.`
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
              artwork={CONCERN_EMPTY_ILLUSTRATION}
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
                    unread={unreadOnArrival.has(notification.recipientId)}
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
        height: 30,
        // Nudged down to sit on the title's baseline rather than its cap line.
        // A pill top-aligned with a display-size heading reads as floating
        // above it.
        marginTop: spacing.xs,
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
