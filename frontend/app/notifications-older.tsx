import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowLeft, BellOff, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { NotificationRow } from "@/features/notifications/notification-row";
import {
  NOTIFICATION_REFETCH_OPTIONS,
  useGetOlderNotificationsQuery,
  useMarkNotificationReadMutation,
} from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function NotificationsOlderScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const olderQuery = useGetOlderNotificationsQuery(undefined, NOTIFICATION_REFETCH_OPTIONS);
  const [markRead] = useMarkNotificationReadMutation();

  const older = olderQuery.data ?? [];
  const isLoading = olderQuery.isLoading;
  const isError = olderQuery.isError;

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

  function handleClose() {
    // Pop the entire notifications stack back to where the bell was tapped.
    router.dismissAll();
  }

  return (
    <ScreenScrollView>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
        <CloseButton onPress={handleClose} />
      </View>

      <ScreenHeader
        eyebrow="On record"
        title="Older"
        italicTail="notifications."
        subtitle="Items older than seven days from your current scope. Read them, then they stay archived."
      />

      {isLoading ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : null}

      {isError ? (
        <EmptyState
          icon={BellOff}
          eyebrow="Backend unreachable"
          title="Couldn't load older notifications"
          description="Try again from Account once the backend is reachable."
        />
      ) : null}

      {!isLoading && !isError && older.length === 0 ? (
        <EmptyState
          icon={BellOff}
          eyebrow="Empty"
          title="No older notifications"
          description="Everything from your current scope fits within the last seven days."
        />
      ) : null}

      {older.map((notification) => (
        <NotificationRow
          key={notification.recipientId}
          notification={notification}
          onPress={() => void handlePress(notification.recipientId, Boolean(notification.readAt))}
        />
      ))}
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
        selectable
      >
        Back
      </Text>
    </AnimatedPressable>
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
