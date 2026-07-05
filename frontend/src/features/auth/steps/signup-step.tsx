import { View } from "react-native";
import { Mail, User } from "lucide-react-native";

import { AuthModeFooter, AuthTextField, FieldLabel, PhoneField, PrimaryButton, SegmentButton } from "@/features/auth/auth-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type SignupAccountType = "USER" | "OWNER";

/** Account creation: phone, recovery email, name and the tenant/owner choice. */
export function SignupStep({
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  fullName,
  onFullNameChange,
  accountType,
  onAccountTypeChange,
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
  accountType: SignupAccountType;
  onAccountTypeChange: (value: SignupAccountType) => void;
  busy: boolean;
  onRegister: () => void;
  onGoToLogin: () => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      <PhoneField label="Phone number" value={phone} onChangeText={onPhoneChange} />
      <AuthTextField label="Recovery email" value={email} onChangeText={onEmailChange} placeholder="you@example.com" icon={Mail} />
      <AuthTextField label="Full name" value={fullName} onChangeText={onFullNameChange} placeholder="Enter your name" autoCapitalize="words" icon={User} />
      <View style={{ gap: spacing.sm }}>
        <FieldLabel>I am a</FieldLabel>
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.xxs,
            padding: spacing.xxs,
          }}
        >
          <SegmentButton active={accountType === "USER"} label="Tenant" onPress={() => onAccountTypeChange("USER")} />
          <SegmentButton active={accountType === "OWNER"} label="Owner" onPress={() => onAccountTypeChange("OWNER")} />
        </View>
      </View>
      <PrimaryButton label={accountType === "OWNER" ? "Create owner account" : "Create tenant account"} onPress={onRegister} busy={busy} />
      <AuthModeFooter actionLabel="Sign in" label="Already have an account?" onPress={onGoToLogin} />
    </>
  );
}
