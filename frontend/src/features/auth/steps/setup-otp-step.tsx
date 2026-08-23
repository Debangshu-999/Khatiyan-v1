import { Text, View } from "react-native";

import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, CodeField, otpTimerLabel, PhoneSummaryRow, PrimaryButton, StepProgress } from "@/features/auth/auth-ui";
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
  otpError,
  onBackToLogin,
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
  otpError?: string;
  onBackToLogin: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <>
      <StepProgress step={1} total={2} label="Verify your number" />
      {/* Shows where the code went; Edit returns to signup with values intact. */}
      <PhoneSummaryRow phone={phone} onEdit={onEditPhone} />
      <CodeField label="OTP" value={otp} onChangeText={onOtpChange} error={otpError} />
      {activating ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          No code? Contact Provisioner.
        </Text>
      ) : null}
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
        {/* Every other step offers a way back to sign-in; this one stranded
            anyone who opened it by mistake, or whose code never arrived. */}
        <AuthChipLink icon={ArrowLeft} label="Back to login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
