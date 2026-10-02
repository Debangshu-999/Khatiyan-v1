import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, OtpBoxes, PhoneSummaryRow, PrimaryButton, StepProgress, otpTimerLabel } from "@/features/auth/auth-ui";
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
  otpError,
}: {
  phone: string;
  otp: string;
  onOtpChange: (value: string) => void;
  cooldownSeconds: number;
  busy: boolean;
  onResendOtp: () => void;
  onVerifyOtp: (code?: string) => void;
  onEditPhone: () => void;
  onBackToLogin: () => void;
  otpError?: string;
}) {
  return (
    <>
      <StepProgress step={1} total={2} />
      {/* Shows where the code went; Edit returns to the phone-entry step. */}
      <PhoneSummaryRow phone={phone} onEdit={onEditPhone} />
      {/* Verifies itself on the sixth digit; Validate below is the fallback. */}
      <OtpBoxes value={otp} onChangeText={onOtpChange} onComplete={onVerifyOtp} busy={busy} error={otpError} />
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
          <PrimaryButton label="Validate" onPress={() => onVerifyOtp()} busy={busy} grow />
        </View>
        <AuthChipLink icon={ArrowLeft} label="Back to login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
