import { Text, View } from "react-native";

import { KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AuthChipLink, CodeField, LinkButton, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

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
}) {
  const { colors, fonts } = useTheme();

  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} />
      {/* The alternative to the phone sits directly under the phone field: it is
          a choice about HOW you identify yourself, so it belongs next to the
          identifier, not stranded among the submit actions. */}
      <AuthChipLink align="end" icon={Mail} label="Use verified email" onPress={onEmailLogin} />
      <CodeField label="PIN" value={pin} onChangeText={onPinChange} secureTextEntry />
      <AuthChipLink align="end" icon={KeyRound} label="Forgot or reset PIN" onPress={onForgotPin} />
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
