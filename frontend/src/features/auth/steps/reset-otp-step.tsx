import { View } from "react-native";

import { CodeField, LinkButton, otpTimerLabel, PhoneSummaryRow, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * PIN recovery, step 2: validate the OTP that was texted.
 * Sheet layout: fields flow under the hero; actions pin to the screen bottom.
 */
export function ResetOtpStep({
  phone,
  otp,
  onOtpChange,
  cooldownSeconds,
  busy,
  onResendOtp,
  onVerifyOtp,
  onEditPhone,
  onBackToLogin,
}: {
  phone: string;
  otp: string;
  onOtpChange: (value: string) => void;
  cooldownSeconds: number;
  busy: boolean;
  onResendOtp: () => void;
  onVerifyOtp: () => void;
  onEditPhone: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <StepBadge text="Reset PIN / OTP" />
      {/* Shows where the code went; Edit returns to the phone-entry step. */}
      <PhoneSummaryRow phone={phone} onEdit={onEditPhone} />
      <CodeField label="OTP" value={otp} onChangeText={onOtpChange} />
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <PrimaryButton
            label={cooldownSeconds > 0 ? otpTimerLabel(cooldownSeconds) : "Resend OTP"}
            onPress={onResendOtp}
            busy={busy}
            disabled={cooldownSeconds > 0}
            muted
            grow
          />
          <PrimaryButton label="Validate" onPress={onVerifyOtp} busy={busy} grow />
        </View>
        <LinkButton label="Back to login" onPress={onBackToLogin} center />
      </View>
    </>
  );
}
