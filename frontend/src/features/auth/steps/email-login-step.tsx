import { View } from "react-native";
import { Mail } from "lucide-react-native";

import { AuthTextField, CodeField, LinkButton, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

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
  busy: boolean;
  onRequestOtp: () => void;
  onConfirm: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <AuthTextField label="Verified email" value={email} onChangeText={onEmailChange} placeholder="you@example.com" icon={Mail} />
      {otpRequested ? <CodeField label="Email OTP" value={otp} onChangeText={onOtpChange} /> : null}
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        {otpRequested ? (
          <>
            <PrimaryButton label="Sign in with email" onPress={onConfirm} busy={busy} />
            <LinkButton label="Resend email OTP" onPress={onRequestOtp} center muted />
          </>
        ) : (
          <PrimaryButton label="Send email OTP" onPress={onRequestOtp} busy={busy} />
        )}
        <LinkButton label="Back to PIN login" onPress={onBackToLogin} center />
      </View>
    </>
  );
}
