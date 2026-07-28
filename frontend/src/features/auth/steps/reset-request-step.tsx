import { View } from "react-native";

import { LinkButton, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * PIN recovery, step 1: request the reset OTP by phone.
 * Sheet layout: the field flows under the hero; actions pin to the bottom.
 */
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
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Request reset OTP" onPress={onRequestOtp} busy={busy} />
        <LinkButton label="Back to login" onPress={onBackToLogin} center />
      </View>
    </>
  );
}
