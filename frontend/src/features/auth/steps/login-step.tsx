import { Children, type ReactNode } from "react";
import { View } from "react-native";

import { KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react-native";

import { AuthChipLink, CodeField, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
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
      <FieldWithLink>
        <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} error={phoneError} />
        <AuthChipLink align="auto" icon={Mail} label="Use verified email" onPress={onEmailLogin} />
      </FieldWithLink>
      <FieldWithLink>
        <CodeField label="PIN" value={pin} onChangeText={onPinChange} secureTextEntry error={pinError} />
        <AuthChipLink align="auto" icon={KeyRound} label="Forgot or reset PIN" onPress={onForgotPin} />
      </FieldWithLink>
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
 * A field and the chip link that belongs to it, tucked close under the box.
 *
 * <p>The field's label and validation message both sit in its top border, so
 * a failed submit never pushes the chip or the buttons below it.
 */
function FieldWithLink({ children }: { children: ReactNode }) {
  const [field, chip] = Children.toArray(children);

  return (
    <View style={{ gap: spacing.xs }}>
      {field}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
        </View>
        {chip}
      </View>
    </View>
  );
}
