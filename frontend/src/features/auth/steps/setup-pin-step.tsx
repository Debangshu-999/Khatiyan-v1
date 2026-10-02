import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, CodeField, FieldSpacer, PrimaryButton, StepProgress } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * Post-signup step 2: choose the login PIN. The OTP was already verified in
 * step 1, so there is no way back to it. Device back is blocked across the
 * two steps, so "Back to login" is the one way out (user, 2026-10-02).
 * Sheet layout: fields flow under the hero; the action pins to the bottom.
 */
export function SetupPinStep({
  newPin,
  onNewPinChange,
  confirmPin,
  onConfirmPinChange,
  busy,
  onSetPin,
  onBackToLogin,
  newPinError,
  confirmPinError,
}: {
  newPin: string;
  onNewPinChange: (value: string) => void;
  confirmPin: string;
  onConfirmPinChange: (value: string) => void;
  busy: boolean;
  onSetPin: () => void;
  onBackToLogin: () => void;
  newPinError?: string;
  confirmPinError?: string;
}) {
  return (
    <>
      <StepProgress step={2} total={2} label="Choose your PIN" />
      <View style={{ flexGrow: 1, gap: spacing.md }}>
        <CodeField label="New PIN" value={newPin} onChangeText={onNewPinChange} secureTextEntry error={newPinError} />
        <FieldSpacer />
        <CodeField label="Retype PIN" value={confirmPin} onChangeText={onConfirmPinChange} secureTextEntry error={confirmPinError} />
      </View>
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Set PIN and enter app" onPress={onSetPin} busy={busy} />
        <AuthChipLink icon={ArrowLeft} label="Back to login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
