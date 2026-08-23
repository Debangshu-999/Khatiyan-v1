import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, CodeField, LinkButton, PrimaryButton, StepProgress } from "@/features/auth/auth-ui";
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
  newPinError,
  confirmPinError,
}: {
  newPin: string;
  onNewPinChange: (value: string) => void;
  confirmPin: string;
  onConfirmPinChange: (value: string) => void;
  busy: boolean;
  onResetPin: () => void;
  onBackToLogin: () => void;
  newPinError?: string;
  confirmPinError?: string;
}) {
  return (
    <>
      <StepProgress step={2} total={2} label="Choose a new PIN" />
      <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry error={newPinError} />
      <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry error={confirmPinError} />
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Reset PIN and enter app" onPress={onResetPin} busy={busy} />
        <AuthChipLink icon={ArrowLeft} label="Back to login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
