import { View } from "react-native";
import { Mail, User } from "lucide-react-native";

import { AuthModeFooter, AuthTextField, PhoneField, PrimaryButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";

/**
 * Account creation: phone, recovery email and name. The owner/tenant role is
 * NOT chosen here — new accounts start role-less and pick their path from the
 * post-login landing. Sheet layout: fields flow under the hero; actions pin to
 * the screen bottom.
 */
export function SignupStep({
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  fullName,
  onFullNameChange,
  busy,
  onRegister,
  onGoToLogin,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  fullName: string;
  onFullNameChange: (value: string) => void;
  busy: boolean;
  onRegister: () => void;
  onGoToLogin: () => void;
}) {
  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} />
      <AuthTextField
        label="Recovery email (optional)"
        value={email}
        onChangeText={onEmailChange}
        placeholder="you@example.com"
        icon={Mail}
      />
      <AuthTextField label="Full name" value={fullName} onChangeText={onFullNameChange} placeholder="Enter your name" autoCapitalize="words" icon={User} />
      <View style={{ gap: spacing.sm, marginTop: "auto", paddingTop: spacing.lg }}>
        <PrimaryButton label="Create account" onPress={onRegister} busy={busy} />
        <AuthModeFooter actionLabel="Sign in" label="Already have an account?" onPress={onGoToLogin} />
      </View>
    </>
  );
}
