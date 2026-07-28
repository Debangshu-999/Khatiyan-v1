import { View } from "react-native";

import { CodeField, otpTimerLabel, PhoneSummaryRow, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * Post-signup step 1: verify the setup OTP before choosing a PIN.
 * Sheet layout: fields flow under the hero; actions pin to the screen bottom.
 */
export function SetupOtpStep({
  phone,
  otp,
  onOtpChange,
  cooldownSeconds,
  resendBusy,
  verifyBusy,
  onResendOtp,
  onVerifyOtp,
  onEditPhone,
}: {
  phone: string;
  otp: string;
  onOtpChange: (value: string) => void;
  cooldownSeconds: number;
  resendBusy: boolean;
  verifyBusy: boolean;
  onResendOtp: () => void;
  onVerifyOtp: () => void;
  onEditPhone: () => void;
}) {
  return (
    <>
      <StepBadge text="Step 1/2" />
      {/* Shows where the code went; Edit returns to signup with values intact. */}
      <PhoneSummaryRow phone={phone} onEdit={onEditPhone} />
      <CodeField label="OTP" value={otp} onChangeText={onOtpChange} />
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton
          label={cooldownSeconds > 0 ? otpTimerLabel(cooldownSeconds) : "Resend OTP"}
          onPress={onResendOtp}
          busy={resendBusy}
          disabled={cooldownSeconds > 0}
          muted
          grow
        />
        <PrimaryButton label="Verify" onPress={onVerifyOtp} busy={verifyBusy} grow />
      </View>
    </>
  );
}
