import { View } from "react-native";

import { CodeField, LinkButton, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/** PIN recovery, step 2: validate the OTP that was texted. */
export function ResetOtpStep({
  otp,
  onOtpChange,
  cooldownSeconds,
  busy,
  onResendOtp,
  onVerifyOtp,
  onBackToLogin,
}: {
  otp: string;
  onOtpChange: (value: string) => void;
  cooldownSeconds: number;
  busy: boolean;
  onResendOtp: () => void;
  onVerifyOtp: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <StepBadge text="Reset PIN / OTP" />
      <CodeField label="OTP" value={otp} onChangeText={onOtpChange} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <PrimaryButton
          label={cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : "Resend OTP"}
          onPress={onResendOtp}
          busy={busy}
          disabled={cooldownSeconds > 0}
          muted
          grow
        />
        <PrimaryButton label="Validate OTP" onPress={onVerifyOtp} busy={busy} grow />
      </View>
      <LinkButton label="Back to login" onPress={onBackToLogin} center />
    </>
  );
}
