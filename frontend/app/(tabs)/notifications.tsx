import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { ArchiveRestore, Bell, BellOff, Building2, ChevronRight, CreditCard, KeyRound, Megaphone, ShieldAlert, UserRound } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { NotificationRow } from "@/features/notifications/notification-row";
import { useAppSelector } from "@/store/hooks";
import {
  NOTIFICATION_REFETCH_OPTIONS,
  type NotificationItem,
  useGetOlderNotificationsQuery,
  useGetRecentNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type AlertSource = "billing" | "concern" | "tenancy" | "notice" | "property" | "account" | "other";

const ALERT_SECTIONS: Array<{
  empty: string;
  key: AlertSource;
  title: string;
}> = [
  { empty: "No billing alerts right now.", key: "billing", title: "Billing" },
  { empty: "No concern alerts right now.", key: "concern", title: "Concerns" },
  { empty: "No tenancy alerts right now.", key: "tenancy", title: "Tenancy" },
  { empty: "No notice alerts right now.", key: "notice", title: "Notices" },
  { empty: "No property alerts right now.", key: "property", title: "Property" },
  { empty: "No account alerts right now.", key: "account", title: "Account" },
  { empty: "No other alerts right now.", key: "other", title: "Other" },
];

const ALERT_ICONS = {
  account: UserRound,
  billing: CreditCard,
  concern: ShieldAlert,
  notice: Megaphone,
  other: Bell,
  property: Building2,
  tenancy: KeyRound,
} as const;

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const recentQuery = useGetRecentNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const olderQuery = useGetOlderNotificationsQuery(activeAccount, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  useFocusEffect(
    useCallback(() => {
      void recentQuery.refetch();
      void olderQuery.refetch();
      // Refetch identities are stable for this hook instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const recent = recentQuery.data ?? [];
  const olderCount = olderQuery.data?.length ?? 0;
  const unreadCount = recent.filter((notification) => !notification.readAt).length;
  const grouped = groupNotificationsBySource(recent);

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
      await markAllRead(activeAccount).unwrap();
    } catch {
      // Keep this quiet; stale unread state resolves on next successful refresh.
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Alert center"
        title="Alerts,"
        italicTail="by source."
        subtitle={
          user?.activeTenant
            ? "Tenant notifications grouped by billing, concerns, notices and tenancy updates."
            : user?.role === "OWNER"
              ? "Owner notifications grouped by billing, concerns, tenancy, notices and property operations."
              : "Alerts will appear here once your tenancy or property workspace is active."
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

      {recentQuery.isLoading ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : null}

      {recentQuery.isError ? (
        <EmptyState
          icon={BellOff}
          eyebrow="Backend unreachable"
          title="Couldn't load alerts"
          description="Check your backend connection, then pull down to try again."
        />
      ) : null}

      {!recentQuery.isLoading && !recentQuery.isError ? (
        <View style={{ gap: spacing.lg }}>
          {ALERT_SECTIONS.map((section) => (
            <AlertSourceSection
              empty={section.empty}
              key={section.key}
              notifications={grouped[section.key]}
              onPressNotification={handleNotificationPress}
              source={section.key}
              title={section.title}
            />
          ))}

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
                  Older alerts
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

function AlertSourceSection({
  empty,
  notifications,
  onPressNotification,
  source,
  title,
}: {
  empty: string;
  notifications: NotificationItem[];
  onPressNotification: (recipientId: string, alreadyRead: boolean) => Promise<void>;
  source: AlertSource;
  title: string;
}) {
  const { colors, type } = useTheme();
  const Icon = ALERT_ICONS[source];

  return (
    <Section eyebrow={`${notifications.length} alert${notifications.length === 1 ? "" : "s"}`} title={title}>
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          maxHeight: 340,
          overflow: "hidden",
        }}
      >
        <ScrollView contentContainerStyle={{ gap: spacing.sm, padding: spacing.md }} nestedScrollEnabled showsVerticalScrollIndicator>
          {notifications.length === 0 ? (
            <Card tone="sunken">
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <Icon color={colors.kicker} size={18} strokeWidth={2.2} />
                <Text style={[type.body, { color: colors.muted }]} selectable>
                  {empty}
                </Text>
              </View>
            </Card>
          ) : (
            notifications.map((notification) => (
              <NotificationRow
                key={notification.recipientId}
                notification={notification}
                onPress={() => void onPressNotification(notification.recipientId, Boolean(notification.readAt))}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Section>
  );
}

function groupNotificationsBySource(notifications: NotificationItem[]) {
  const grouped: Record<AlertSource, NotificationItem[]> = {
    account: [],
    billing: [],
    concern: [],
    notice: [],
    other: [],
    property: [],
    tenancy: [],
  };

  notifications.forEach((notification) => {
    grouped[notificationSource(notification)].push(notification);
  });

  return grouped;
}

function notificationSource(notification: NotificationItem): AlertSource {
  const category = notification.category.toUpperCase();
  const subtype = notification.subtype?.toUpperCase() ?? "";

  if (category === "BILLING" || category === "PAYMENT" || subtype.startsWith("BILLING_") || subtype.startsWith("PAYMENT_")) {
    return "billing";
  }
  if (category === "CONCERN" || subtype.startsWith("CONCERN_")) {
    return "concern";
  }
  if (category === "TENANCY" || subtype.startsWith("TENANCY_")) {
    return "tenancy";
  }
  if (category === "NOTICE" || subtype.startsWith("NOTICE_")) {
    return "notice";
  }
  if (category === "PROPERTY" || category === "MANAGER" || subtype.startsWith("MANAGER_")) {
    return "property";
  }
  if (category === "AUTH" || category === "ACCOUNT") {
    return "account";
  }
  return "other";
}
