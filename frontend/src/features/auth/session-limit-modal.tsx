import { Modal, Text, View } from "react-native";
import { Globe, Laptop, Monitor, Smartphone, Tablet, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon } from "@/components/status-icon";
import type { UserSession } from "@/store/services/auth-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Shown when a sign-in would exceed the device cap: the devices already signed
 * in, and a choice of which one to end.
 *
 * <p>A WARNING, not an error. Nothing went wrong and the credentials were
 * correct — there is simply a decision to make, and the icon says so.
 *
 * <p>The devices arrive in the refusal itself rather than from the sessions
 * endpoint, because nobody is signed in yet and that endpoint is closed to
 * them. It is safe to show at this point and only at this point: the PIN or the
 * e-mail code has already been verified on the same request.
 */
export function SessionLimitModal({
  busy,
  message,
  onCancel,
  onSignOut,
  sessions,
}: {
  busy: boolean;
  message: string;
  onCancel: () => void;
  /** Ends that device, then completes the sign-in that was interrupted. */
  onSignOut: (session: UserSession) => void;
  sessions: UserSession[];
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: 380,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <StatusIcon tone="warning" />

          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.sansMedium,
              fontSize: 15,
              lineHeight: 22,
              textAlign: "center",
            }}
          >
            {message} Choose one to sign out.
          </Text>

          <View style={{ alignSelf: "stretch", gap: spacing.xs, marginTop: spacing.xs }}>
            {sessions.map((session) => (
              <DeviceChoice
                busy={busy}
                key={session.id}
                onPress={() => onSignOut(session)}
                session={session}
              />
            ))}
          </View>

          <AnimatedPressable
            accessibilityRole="button"
            onPress={onCancel}
            style={{
              alignItems: "center",
              alignSelf: "stretch",
              borderColor: colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1,
              marginTop: spacing.xs,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              Not now
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

/** One device, tappable to end it. The whole row is the target, not a button. */
function DeviceChoice({
  busy,
  onPress,
  session,
}: {
  busy: boolean;
  onPress: () => void;
  session: UserSession;
}) {
  const { colors, type } = useTheme();
  const Icon = iconFor(session.platform);

  return (
    <AnimatedPressable
      accessibilityLabel={`Sign out ${session.deviceLabel ?? "this device"}`}
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        opacity: busy ? 0.5 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, fontSize: 14 }]}>
          {session.deviceLabel ?? "Unknown device"}
        </Text>
        <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
          Signed in {formatSignedIn(session.createdAt)}
        </Text>
      </View>
      <Text style={[type.action, { color: colors.danger }]}>
        Sign Out
      </Text>
    </AnimatedPressable>
  );
}

function iconFor(platform: string | null): ComponentType<LucideProps> {
  switch (platform) {
    case "web":
      return Globe;
    case "tablet":
      return Tablet;
    case "desktop":
    case "tv":
      return Monitor;
    case "macos":
    case "windows":
      return Laptop;
    default:
      return Smartphone;
  }
}

function formatSignedIn(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}
