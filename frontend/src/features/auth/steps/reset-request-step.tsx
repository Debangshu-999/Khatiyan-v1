import { LinkButton, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";

/** PIN recovery, step 1: request the reset OTP by phone. */
export function ResetRequestStep({
  phone,
  onPhoneChange,
  busy,
  onRequestOtp,
  onBackToLogin,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  busy: boolean;
  onRequestOtp: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} />
      <PrimaryButton label="Request reset OTP" onPress={onRequestOtp} busy={busy} />
      <LinkButton label="Back to login" onPress={onBackToLogin} center />
    </>
  );
}
