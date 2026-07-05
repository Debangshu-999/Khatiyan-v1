import { Text, View } from "react-native";

import { CodeField, LinkButton, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Post-signup: verify the setup OTP, then choose the login PIN. */
export function SetupPinStep({
  otp,
  onOtpChange,
  newPin,
  onNewPinChange,
  confirmPin,
  onConfirmPinChange,
  otpVerified,
  cooldownSeconds,
  busy,
  onResendOtp,
  onVerifyOtp,
  onSetPin,
  onBackToSignup,
}: {
  otp: string;
  onOtpChange: (value: string) => void;
  newPin: string;
  onNewPinChange: (value: string) => void;
  confirmPin: string;
  onConfirmPinChange: (value: string) => void;
  otpVerified: boolean;
  cooldownSeconds: number;
  busy: boolean;
  onResendOtp: () => void;
  onVerifyOtp: () => void;
  onSetPin: () => void;
  onBackToSignup: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <>
      <StepBadge text="Step 2 of 2" />
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
        <PrimaryButton label="Verify OTP" onPress={onVerifyOtp} busy={busy} grow />
      </View>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 }} selectable>
        After OTP verification, enter and retype your PIN below.
      </Text>
      {otpVerified ? (
        <>
          <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry />
          <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry />
          <PrimaryButton label="Set PIN and enter app" onPress={onSetPin} busy={busy} />
        </>
      ) : null}
      <LinkButton label="Back to signup" onPress={onBackToSignup} center />
    </>
  );
}
