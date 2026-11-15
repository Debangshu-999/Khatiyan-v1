import { ModalTitle } from "@/components/modal-title";
import { CenterModal } from "@/components/center-modal";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { requestNotificationDeviceRegistration } from "@/features/notifications/device-registration";
import {
  dismissNotificationPrompt,
  hasDismissedNotificationPrompt,
} from "@/features/notifications/notification-prompt-storage";
import { YellowBell3D } from "@/features/tenant-home/tenant-status-bar";
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
    <CenterModal animationType="fade" statusBarTranslucent transparent visible={visible} navigationBarTranslucent onRequestClose={() => void closePrompt()}>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        {/* The alerts ask, the way most apps put it (user, 2026-11-14): a big bell in
            the middle, a title and one line under it, then Later and Enable side by side. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 28,
            gap: spacing.md,
            maxWidth: 380,
            paddingBottom: spacing.lg,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", height: 124, justifyContent: "center", width: 124 }}>
            <View style={{ backgroundColor: "#FFD12E", borderRadius: 62, height: 124, opacity: 0.12, position: "absolute", width: 124 }} />
            <View style={{ backgroundColor: "#FFD12E", borderRadius: 46, height: 92, opacity: 0.2, position: "absolute", width: 92 }} />
            <View style={{ marginTop: 4 }}>
              <YellowBell3D size={74} />
            </View>
            <Sparkle color="#F5B400" left={10} size={11} top={22} />
            <Sparkle color="#3F6ED8" left={102} size={9} top={14} />
            <Sparkle color="#F0663A" left={104} size={12} top={88} />
          </View>

          <View style={{ alignItems: "center", gap: 6 }}>
            <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.4, textAlign: "center" }}>
              Enable alerts
            </ModalTitle>
            <Text style={[type.modalDescription, { color: colors.muted, textAlign: "center" }]}>
              Get bill, concern, notice and tenancy updates on this device.
            </Text>
          </View>

          {message ? (
            <Text style={[type.caption, { color: colors.danger, textAlign: "center" }]}>
              {message}
            </Text>
          ) : null}

          {/* Side by side (user, 2026-11-14): the way out on the left, the action on the right. */}
          <View style={{ alignSelf: "stretch", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => void closePrompt()}
              style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.primary, borderCurve: "continuous", borderRadius: 14, borderWidth: 1.5, flex: 1, justifyContent: "center", minHeight: 50 }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 15.5 }}>Later</Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityRole="button"
              disabled={registerDeviceState.isLoading}
              onPress={() => void enableNotifications()}
              style={{ alignItems: "center", backgroundColor: colors.primary, borderCurve: "continuous", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 50 }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15.5 }}>
                {registerDeviceState.isLoading ? "Enabling..." : "Enable"}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </CenterModal>
  );
}

/** A small four-point star around the bell. */
function Sparkle({ color, left, size, top }: { color: string; left: number; size: number; top: number }) {
  return (
    <Svg height={size} style={{ left, position: "absolute", top }} viewBox="-10 -10 20 20" width={size}>
      <Path d="M0,-10 Q1.4,-1.4 10,0 Q1.4,1.4 0,10 Q-1.4,1.4 -10,0 Q-1.4,-1.4 0,-10 Z" fill={color} />
    </Svg>
  );
}
