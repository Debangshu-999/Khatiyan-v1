import type { ReactNode } from "react";
import { View } from "react-native";

import { KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react-native";

import { AuthChipLink, CodeField, FieldError, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * Phone + PIN sign-in — the default screen.
 * Sheet layout: fields flow under the hero; actions pin to the screen bottom.
 */
export function LoginStep({
  phone,
  onPhoneChange,
  pin,
  onPinChange,
  busy,
  onLogin,
  onForgotPin,
  onEmailLogin,
  onActivateAccount,
  onGoToSignup,
  phoneError,
  pinError,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  pin: string;
  onPinChange: (value: string) => void;
  busy: boolean;
  onLogin: () => void;
  onForgotPin: () => void;
  onEmailLogin: () => void;
  onActivateAccount: () => void;
  onGoToSignup: () => void;
  phoneError?: string;
  pinError?: string;
}) {
  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} error={phoneError} hideErrorText />
      {/* The alternative to the phone sits directly under the phone field: it is
          a choice about HOW you identify yourself, so it belongs next to the
          identifier, not stranded among the submit actions.

          The validation line shares this row rather than sitting under the field.
          Under it, appearing on a failed submit pushed the chip — and everything
          below it — down a line, so the form jumped at the exact moment the
          reader was looking for what went wrong. These messages are short enough
          to sit beside the chip without meeting it. */}
      <FieldRowWithChip error={phoneError}>
        <AuthChipLink align="auto" icon={Mail} label="Use verified email" onPress={onEmailLogin} />
      </FieldRowWithChip>
      <CodeField label="PIN" value={pin} onChangeText={onPinChange} secureTextEntry error={pinError} hideErrorText />
      <FieldRowWithChip error={pinError}>
        <AuthChipLink align="auto" icon={KeyRound} label="Forgot or reset PIN" onPress={onForgotPin} />
      </FieldRowWithChip>
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Log in" onPress={onLogin} busy={busy} />
        {/* Both are ways OUT of this form, so they sit together on one row
            rather than stacking as two more things to read past the button. */}
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center" }}>
          <AuthChipLink align="auto" icon={UserPlus} label="New User?" onPress={onGoToSignup} />
          <AuthChipLink align="auto" icon={ShieldCheck} label="Account provisioned?" onPress={onActivateAccount} />
        </View>
      </View>
    </>
  );
}

/**
 * One row holding a field's validation line and the chip link that follows it.
 *
 * <p>The chip keeps its place whether or not there is an error, so a failed
 * submit changes the text on screen without moving anything. The message takes
 * the remaining width and wraps rather than shoving the chip off the edge.
 */
function FieldRowWithChip({ children, error }: { children: ReactNode; error?: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <View style={{ flex: 1 }}>
        <FieldError message={error} />
      </View>
      {children}
    </View>
  );
}
