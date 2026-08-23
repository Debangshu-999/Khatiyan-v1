import { View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AuthChipLink, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * First sign-in for an account somebody else created.
 *
 * <p>
 * Onboarding a tenant, or assigning a manager, provisions a user with a phone
 * but no PIN. Both other doors refuse them: signing up fails because the account
 * exists, and signing in fails with the deliberately vague "Invalid phone or
 * PIN" — so they are told their credentials are wrong when the truth is they
 * never had any. That vagueness is correct and should stay (it stops anyone
 * probing which numbers hold accounts), which is why the way through has to be
 * a door of its own rather than a better error message.
 *
 * <p>
 * Its own screen rather than a link that acts on the login form: sending a code
 * is a real side effect, and firing it from a field the person filled in for a
 * different purpose gives them no chance to check the number first.
 */
export function ActivateStep({
  phone,
  onPhoneChange,
  busy,
  onSendCode,
  onBackToLogin,
  phoneError,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  busy: boolean;
  onSendCode: () => void;
  onBackToLogin: () => void;
  phoneError?: string;
}) {
  return (
    <>
      <PhoneField label="Registered phone number" value={phone} onChangeText={onPhoneChange} error={phoneError} />

      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Send setup code" onPress={onSendCode} busy={busy} />
        <AuthChipLink icon={ArrowLeft} label="Back to PIN login" onPress={onBackToLogin} />
      </View>
    </>
  );
}
