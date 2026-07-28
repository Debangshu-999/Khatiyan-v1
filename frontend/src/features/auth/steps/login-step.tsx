import { View } from "react-native";

import { AuthModeFooter, CodeField, LinkButton, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
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
  onGoToSignup: () => void;
}) {
  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} />
      <CodeField label="PIN" value={pin} onChangeText={onPinChange} secureTextEntry />
      <View style={{ alignItems: "flex-end", marginTop: -spacing.xs }}>
        <LinkButton label="Forgot or reset PIN?" onPress={onForgotPin} />
      </View>
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Log in" onPress={onLogin} busy={busy} />
        <LinkButton label="Sign in with verified email" onPress={onEmailLogin} center />
        <AuthModeFooter actionLabel="Create account" label="Don't have an account?" onPress={onGoToSignup} />
      </View>
    </>
  );
}
