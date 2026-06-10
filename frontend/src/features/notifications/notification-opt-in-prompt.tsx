import { useEffect, useMemo, useState } from "react";
import { Modal, Text, View } from "react-native";
import { BellRing, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { requestNotificationDeviceRegistration } from "@/features/notifications/device-registration";
import {
  dismissNotificationPrompt,
  hasDismissedNotificationPrompt,
} from "@/features/notifications/notification-prompt-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  useListMyDevicesQuery,
  useRegisterDeviceMutation,
} from "@/store/services/notification-api";
import { setRegisteredDeviceTokenId } from "@/store/slices/auth-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function NotificationOptInPrompt() {
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const hasSession = useAppSelector((state) => Boolean(state.auth.accessToken));
  const devicesQuery = useListMyDevicesQuery(undefined, { skip: !hasSession });
  const [registerDevice, registerDeviceState] = useRegisterDeviceMutation();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissCheckedForUserId, setDismissCheckedForUserId] = useState<string | null>(null);

  const hasActiveDevice = useMemo(() => {
    return (devicesQuery.data ?? []).some((device) => device.active);
  }, [devicesQuery.data]);

  useEffect(() => {
    let cancelled = false;

    async function checkDismissedState() {
      if (!user?.id || !hasSession || devicesQuery.isLoading || hasActiveDevice) {
        setVisible(false);
        return;
      }

      const dismissed = await hasDismissedNotificationPrompt(user.id);
      if (!cancelled) {
        setDismissCheckedForUserId(user.id);
        setVisible(!dismissed);
      }
    }

    void checkDismissedState();

    return () => {
      cancelled = true;
    };
  }, [devicesQuery.isLoading, hasActiveDevice, hasSession, user?.id]);

  async function closePrompt() {
    if (user?.id) {
      await dismissNotificationPrompt(user.id);
    }
    setVisible(false);
  }

  async function enableNotifications() {
    setMessage(null);

    try {
      const registration = await requestNotificationDeviceRegistration();
      const response = await registerDevice(registration).unwrap();
      dispatch(setRegisteredDeviceTokenId(response.id));
      if (user?.id) {
        await dismissNotificationPrompt(user.id);
      }
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to enable notifications.");
    }
  }

  if (!user || dismissCheckedForUserId !== user.id) {
    return null;
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={() => void closePrompt()}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: "rgba(0, 0, 0, 0.38)",
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.primarySoft,
                borderRadius: 12,
                height: 44,
                justifyContent: "center",
                width: 44,
              }}
            >
              <BellRing color={colors.primary} size={20} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 24,
                  fontWeight: "500",
                }}
                selectable
              >
                Enable alerts
              </Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>
                Get bill, concern, notice and tenancy updates on this device.
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Dismiss notification prompt"
              onPress={() => void closePrompt()}
              style={{
                alignItems: "center",
                borderColor: colors.border,
                borderRadius: 10,
                borderWidth: 1,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <X color={colors.muted} size={17} strokeWidth={2} />
            </AnimatedPressable>
          </View>

          {message ? (
            <Text style={[type.caption, { color: colors.danger }]} selectable>
              {message}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <AnimatedPressable
              onPress={() => void closePrompt()}
              style={{
                alignItems: "center",
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
                justifyContent: "center",
                minHeight: 48,
              }}
            >
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontWeight: "700" }} selectable>
                Later
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void enableNotifications()}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 12,
                flex: 1,
                justifyContent: "center",
                minHeight: 48,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontWeight: "800" }} selectable>
                {registerDeviceState.isLoading ? "Enabling..." : "Enable"}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
