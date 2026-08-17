import { Text, View } from "react-native";
import { ArrowLeft, Mail } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AuthChipLink, AuthTextField, CodeField, LinkButton, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * OTP sign-in via a verified email — the phoneless fallback.
 * Sheet layout: fields flow under the hero; actions pin to the bottom.
 */
export function EmailLoginStep({
  email,
  onEmailChange,
  otp,
  onOtpChange,
  otpRequested,
  cooldownSeconds,
  resendBusy,
  busy,
  onRequestOtp,
  onConfirm,
  onBackToLogin,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  otp: string;
  onOtpChange: (value: string) => void;
  otpRequested: boolean;
  cooldownSeconds: number;
  resendBusy: boolean;
  busy: boolean;
  onRequestOtp: () => void;
  onConfirm: () => void;
  onBackToLogin: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <>
      <AuthTextField label="Verified email" value={email} onChangeText={onEmailChange} placeholder="you@example.com" icon={Mail} />

      {/* Resend sits with the address it will send to rather than among the
          submit actions: it is a fact about the email just entered. It counts
          down before it can be tapped, so the cooldown is the visible half of
          the server's rate limit instead of a refusal after the fact. */}
      {otpRequested ? (
        <View style={{ alignItems: "flex-start", marginTop: -spacing.xs }}>
          {cooldownSeconds > 0 ? (
            <Text style={[type.caption, { color: colors.muted }]}>
              Resend in {cooldownSeconds}s
            </Text>
          ) : resendBusy ? (
            <Text style={[type.caption, { color: colors.muted }]}>
              Sending…
            </Text>
          ) : (
            // Deliberately not LinkButton: its own font size is larger, so the
            // row would jump as the countdown flipped to the link. Same caption
            // style, primary colour — only the colour changes on swap.
            <AnimatedPressable accessibilityRole="button" onPress={onRequestOtp} tapLockMs={0}>
              <Text style={[type.caption, { color: colors.primary, fontWeight: "800" }]}>
                Resend
              </Text>
            </AnimatedPressable>
          )}
        </View>
      ) : null}

      {otpRequested ? <CodeField label="Email OTP" value={otp} onChangeText={onOtpChange} /> : null}

      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        {otpRequested ? (
          <PrimaryButton label="Sign in with email" onPress={onConfirm} busy={busy} />
        ) : (
          <PrimaryButton label="Send email OTP" onPress={onRequestOtp} busy={busy} />
        )}
        <AuthChipLink icon={ArrowLeft} label="Back to PIN login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
