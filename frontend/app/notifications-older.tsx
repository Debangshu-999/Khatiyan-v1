import { useEffect, useState } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { View } from "react-native";
import { BellOff } from "lucide-react-native";

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
import {
  NOTIFICATION_REFETCH_OPTIONS,
  useGetOlderNotificationsQuery,
  useMarkNotificationReadMutation,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";

const PAGE_SIZE = 6;

export default function NotificationsOlderScreen() {
  const router = useGuardedRouter();
  const { activeAccount, inPropertyScope, isManagement, selectedProperty } = usePropertyAlertScope();
  const olderQuery = useGetOlderNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();

  const [topic, setTopic] = useState<AlertTopic>("all");
  const [page, setPage] = useState(0);

  const scopedOlder = (olderQuery.data ?? []).filter(inPropertyScope);
  const topicCounts = countByTopic(scopedOlder);
  const olderItems = topic === "all" ? scopedOlder : scopedOlder.filter((notification) => notificationSource(notification) === topic);
  const pagedOlder = paginateAlerts(olderItems, page, PAGE_SIZE);

  // Property switches re-scope the list; start from the first page again.
  useEffect(() => {
    setPage(0);
    setTopic("all");
  }, [selectedProperty?.id]);

  const isLoading = olderQuery.isLoading;
  const isError = olderQuery.isError;

  function changeTopic(next: AlertTopic) {
    setTopic(next);
    setPage(0);
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
    <ScreenScrollView>
      <ScreenHeader
        onBack={() => router.back()}
        eyebrow="On record"
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
          eyebrow="Backend unreachable"
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
              eyebrow="Empty"
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
                {pagedOlder.pageItems.map((notification) => (
                  <NotificationRow
                    key={notification.recipientId}
                    notification={notification}
                    onPress={() => void handlePress(notification.recipientId, Boolean(notification.readAt))}
                  />
                ))}
              </View>
              {pagedOlder.totalPages > 1 ? (
                <PaginationBar
                  hasNext={pagedOlder.hasNext}
                  hasPrevious={pagedOlder.hasPrevious}
                  onNext={() => setPage(pagedOlder.page + 1)}
                  onPrevious={() => setPage(Math.max(0, pagedOlder.page - 1))}
                  page={pagedOlder.page}
                  totalElements={pagedOlder.totalElements}
                  totalPages={pagedOlder.totalPages}
                />
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

