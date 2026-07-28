import { View } from "react-native";

import { CodeField, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * Post-signup step 2: choose the login PIN. The OTP was already verified in
 * step 1, so there is intentionally no "back" here — returning to re-verify a
 * consumed code serves no purpose and only invites confusion.
 * Sheet layout: fields flow under the hero; the action pins to the bottom.
 */
export function SetupPinStep({
  newPin,
  onNewPinChange,
  confirmPin,
  onConfirmPinChange,
  busy,
  onSetPin,
}: {
  newPin: string;
  onNewPinChange: (value: string) => void;
  confirmPin: string;
  onConfirmPinChange: (value: string) => void;
  busy: boolean;
  onSetPin: () => void;
}) {
  return (
    <>
      <StepBadge text="Step 2/2" />
      <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry />
      <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry />
      <View style={{ marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Set PIN and enter app" onPress={onSetPin} busy={busy} />
      </View>
    </>
  );
}
