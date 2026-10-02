import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, CodeField, FieldSpacer, PrimaryButton, StepProgress } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * PIN recovery, final step: choose and confirm the new PIN. Resetting returns
 * to the sign-in screen rather than signing in (user, 2026-10-02).
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
      <StepProgress step={2} total={2} />
      {/* Spread into the room above the buttons, as on signup. */}
      <View style={{ flexGrow: 1, gap: spacing.md }}>
        <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry error={newPinError} />
        <FieldSpacer />
        <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry error={confirmPinError} />
      </View>
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Reset PIN" onPress={onResetPin} busy={busy} />
        <AuthChipLink icon={ArrowLeft} label="Back to login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
