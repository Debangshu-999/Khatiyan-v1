import { Text, View } from "react-native";

import { CodeField, otpTimerLabel, PhoneSummaryRow, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

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
  activating = false,
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
  // True when the person got here from the provisioned-account door. Only they
  // can be waiting on a code that will never come, because that request stays
  // silent when the number has no account — everyone else was told outright.
  activating?: boolean;
}) {
  const { colors, type } = useTheme();

  return (
    <>
      <StepBadge text="Step 1/2" />
      {/* Shows where the code went; Edit returns to signup with values intact. */}
      <PhoneSummaryRow phone={phone} onEdit={onEditPhone} />
      <CodeField label="OTP" value={otp} onChangeText={onOtpChange} />
      {activating ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          No code? Contact Provisioner.
        </Text>
      ) : null}
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
