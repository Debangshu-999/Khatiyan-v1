import { View } from "react-native";
import { ArrowLeft, Mail } from "lucide-react-native";

import { AuthChipLink, AuthTextField, EmailSummaryRow, OtpBoxes, otpTimerLabel, PrimaryButton } from "@/features/auth/auth-ui";
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
  cooldownSeconds,
  resendBusy,
  busy,
  onRequestOtp,
  onConfirm,
  onBackToLogin,
  emailError,
  otpError,
  onEditEmail,
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
  /** The code from the boxes when they fill, or nothing to use the one typed. */
  onConfirm: (code?: string) => void;
  onBackToLogin: () => void;
  emailError?: string;
  otpError?: string;
  onEditEmail: () => void;
}) {
  // Once the code is on its way, the same screen as verifying a phone (user,
  // 2026-11-14): where it went with Edit, the six boxes that verify themselves,
  // then Resend OTP (counting down) beside Verify.
  if (otpRequested) {
    return (
      <>
        <EmailSummaryRow email={email} onEdit={onEditEmail} />
        <OtpBoxes value={otp} onChangeText={onOtpChange} onComplete={onConfirm} busy={busy} error={otpError} />
        <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <PrimaryButton
              label={cooldownSeconds > 0 ? otpTimerLabel(cooldownSeconds) : "Resend OTP"}
              onPress={onRequestOtp}
              busy={resendBusy}
              disabled={cooldownSeconds > 0}
              muted
              grow
            />
            <PrimaryButton label="Verify" onPress={() => onConfirm()} busy={busy} grow />
          </View>
          <AuthChipLink icon={ArrowLeft} label="Back to PIN login" onPress={onBackToLogin} />
        </View>
      </>
    );
  }

  return (
    <>
      <AuthTextField label="Verified email" value={email} onChangeText={onEmailChange} placeholder="you@example.com" icon={Mail} error={emailError} locked={otpRequested} onEdit={onEditEmail} />

      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        {/* No timer here (user, 2026-11-14): pressed during the wait, it says so in a popup. */}
        <PrimaryButton label="Send email OTP" onPress={onRequestOtp} busy={busy} />
        <AuthChipLink icon={ArrowLeft} label="Back to PIN login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
