import { Children, type ReactNode } from "react";
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
      {/* The alternative to the phone sits directly under the phone field: it is
          a choice about HOW you identify yourself, so it belongs next to the
          identifier, not stranded among the submit actions. */}
      <FieldWithError error={phoneError}>
        <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} error={phoneError} hideErrorText />
        <AuthChipLink align="auto" icon={Mail} label="Use verified email" onPress={onEmailLogin} />
      </FieldWithError>
      <FieldWithError error={pinError}>
        <CodeField label="PIN" value={pin} onChangeText={onPinChange} secureTextEntry error={pinError} hideErrorText />
        <AuthChipLink align="auto" icon={KeyRound} label="Forgot or reset PIN" onPress={onForgotPin} />
      </FieldWithError>
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
 * A field, its validation line, and the chip link that belongs to it.
 *
 * <p>
 * <b>The error and the chip share one row, tucked close under the input.</b>
 * The row's height comes from the chip, which is taller than a line of text, so
 * the message appears into space that already exists and nothing on the screen
 * moves — not the chip, not the buttons below it. That matters at exactly the
 * moment it happens: a failed submit is when the reader is looking for what
 * went wrong, and a form that jumps then is a form that hides its own answer.
 *
 * <p>
 * The gap is 6 rather than the form's usual 14, which is what puts the message
 * under the box it belongs to instead of floating between two fields.
 *
 * <p>
 * The message takes the remaining width and wraps rather than pushing the chip
 * off the edge. All four this screen can produce fit one line at any phone
 * width.
 */
function FieldWithError({ children, error }: { children: ReactNode; error?: string }) {
  const [field, chip] = Children.toArray(children);

  return (
    <View style={{ gap: spacing.xs }}>
      {field}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <FieldError message={error} />
        </View>
        {chip}
      </View>
    </View>
  );
}
