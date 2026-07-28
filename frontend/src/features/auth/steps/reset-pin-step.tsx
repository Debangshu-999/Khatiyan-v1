import { View } from "react-native";

import { CodeField, LinkButton, PrimaryButton, StepBadge } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * PIN recovery, final step: choose and confirm the new PIN.
 * Sheet layout: fields flow under the hero; actions pin to the bottom.
 */
export function ResetPinStep({
  newPin,
  onNewPinChange,
  confirmPin,
  onConfirmPinChange,
  busy,
  onResetPin,
  onBackToLogin,
}: {
  newPin: string;
  onNewPinChange: (value: string) => void;
  confirmPin: string;
  onConfirmPinChange: (value: string) => void;
  busy: boolean;
  onResetPin: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <StepBadge text="Reset PIN / Final step" />
      <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry />
      <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry />
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Reset PIN and enter app" onPress={onResetPin} busy={busy} />
        <LinkButton label="Back to login" onPress={onBackToLogin} center />
      </View>
    </>
  );
}
