import { useEffect, useState } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { BellOff } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
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
import {
  NOTIFICATION_REFETCH_OPTIONS,
  useGetOlderNotificationsQuery,
  useMarkNotificationReadMutation,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** First screenful, and how many more arrive each time the reader reaches the end. */
const PAGE_SIZE = 6;

/** How close to the bottom counts as "reached the end", in px. */
const LOAD_MORE_THRESHOLD_PX = 240;

export default function NotificationsOlderScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const { activeAccount, inPropertyScope, isManagement, selectedProperty } = usePropertyAlertScope();
  const olderQuery = useGetOlderNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();

  const [topic, setTopic] = useState<AlertTopic>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const scopedOlder = (olderQuery.data ?? []).filter(inPropertyScope);
  const topicCounts = countByTopic(scopedOlder);
  const olderItems = topic === "all" ? scopedOlder : scopedOlder.filter((notification) => notificationSource(notification) === topic);
  const visibleOlder = olderItems.slice(0, visibleCount);
  const hasMore = visibleCount < olderItems.length;

  // Pages the RENDER, not the fetch: the older bucket arrives as one payload.
  // Mirrors the main feed so both lists end the same way.
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMore) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, olderItems.length));
    }
  }

  // Property switches re-scope the list; collapse back to one screenful.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setTopic("all");
  }, [selectedProperty?.id]);

  const isLoading = olderQuery.isLoading;
  const isError = olderQuery.isError;

  function changeTopic(next: AlertTopic) {
    setTopic(next);
    setVisibleCount(PAGE_SIZE);
  }

  async function handlePress(recipientId: string, alreadyRead: boolean) {
    if (alreadyRead) {
      return;
    }
    try {
      await markRead(recipientId).unwrap();
    } catch {
      // ignore — feed refetches
    }
  }

  return (
    <ScreenScrollView
      // The nested-screen top position, shared with every other back-button screen.
      contentContainerStyle={{ paddingTop: 0 }}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <ScreenHeader
        onBack={() => router.back()}
        eyebrow="Notifications"
        title="Older"
        italicTail="notifications."
        subtitle={
          isManagement && selectedProperty
            ? `Items older than seven days for ${selectedProperty.name}. Read them, then they stay archived.`
            : "Items older than seven days from your current scope. Read them, then they stay archived."
        }
      />

      {isLoading ? <SkeletonCard /> : null}

      {isError ? (
        <EmptyState
          icon={BellOff}
          title="Couldn't load older notifications"
          description="Try again from Account once the backend is reachable."
        />
      ) : null}

      {!isLoading && !isError ? (
        <View style={{ gap: spacing.lg }}>
          <TopicBubbleRow active={topic} counts={topicCounts} onChange={changeTopic} />

          {olderItems.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No older notifications"
              description={
                topic === "all"
                  ? "Everything from your current scope fits within the last seven days."
                  : "No older alerts under this topic."
              }
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.sm }}>
                {visibleOlder.map((notification) => (
                  <NotificationRow
                    key={notification.recipientId}
                    notification={notification}
                    onPress={() => void handlePress(notification.recipientId, Boolean(notification.readAt))}
                  />
                ))}
              </View>
              {hasMore ? (
                <ActivityIndicator color={colors.muted} />
              ) : olderItems.length > PAGE_SIZE ? (
                <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                  That&apos;s all for now
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

