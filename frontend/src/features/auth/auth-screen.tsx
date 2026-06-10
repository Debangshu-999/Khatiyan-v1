import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Switch, Text, TextInput, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { saveSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { saveThemeMode } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  useConfirmPinResetMutation,
  useLoginWithPinMutation,
  useRegisterOwnerMutation,
  useRegisterUserMutation,
  useRequestOtpMutation,
  useRequestPinResetMutation,
  useSetPinMutation,
  useVerifyOtpMutation,
  type TokenResponse,
} from "@/store/services/auth-api";
import { resetApiBaseUrl, setApiBaseUrl, toggleThemeMode } from "@/store/slices/app-config-slice";
import { setSession } from "@/store/slices/auth-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type AccountType = "USER" | "OWNER";
type AuthMode = "login" | "signup";
type AuthStep = "entry" | "setupOtp" | "resetRequest" | "resetOtp" | "resetPin";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
  }

  if (typeof error === "object" && error && "status" in error) {
    const queryError = error as { status?: unknown; error?: unknown; data?: unknown };
    if (queryError.status === "FETCH_ERROR") {
      return "Could not reach the backend. If you are on Expo Go, use the detected laptop URL.";
    }
    if (queryError.status === "PARSING_ERROR") {
      return "Backend responded, but the app could not read the response.";
    }
    if (typeof queryError.status === "number") {
      if (typeof queryError.data === "object" && queryError.data && "message" in queryError.data) {
        const message = (queryError.data as { message?: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
      }
      return `Request failed with HTTP ${queryError.status}.`;
    }
    if (typeof queryError.error === "string") {
      return queryError.error;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function isValidPhone(value: string) {
  return /^(\+91)?\d{10}$/.test(value.trim());
}

function isValidPin(value: string) {
  return /^\d{6}$/.test(value);
}

function successMessage(value: string) {
  const loweredValue = value.toLowerCase();
  return loweredValue.includes("created") || loweredValue.includes("requested") || loweredValue.includes("verified");
}

export function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, isDark, type } = useTheme();
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl);
  const auth = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("entry");
  const [loginPhone, setLoginPhone] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupOtpVerified, setSetupOtpVerified] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("USER");
  const [message, setMessage] = useState<string | null>(null);
  const [otpRequestedAt, setOtpRequestedAt] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  const [loginWithPin, loginState] = useLoginWithPinMutation();
  const [registerUser, registerUserState] = useRegisterUserMutation();
  const [registerOwner, registerOwnerState] = useRegisterOwnerMutation();
  const [requestOtp, requestOtpState] = useRequestOtpMutation();
  const [verifyOtp, verifyOtpState] = useVerifyOtpMutation();
  const [setPinMutation, setPinState] = useSetPinMutation();
  const [requestPinReset, requestPinResetState] = useRequestPinResetMutation();
  const [confirmPinReset, confirmPinResetState] = useConfirmPinResetMutation();

  useEffect(() => {
    if (auth.hydrated && auth.accessToken) {
      router.replace("/(tabs)");
    }
  }, [auth.accessToken, auth.hydrated, router]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setMessage(null);
    }, 4500);

    return () => clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (!otpRequestedAt) {
      return;
    }

    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [otpRequestedAt]);

  const busy = useMemo(
    () =>
      loginState.isLoading ||
      registerUserState.isLoading ||
      registerOwnerState.isLoading ||
      requestOtpState.isLoading ||
      verifyOtpState.isLoading ||
      setPinState.isLoading ||
      requestPinResetState.isLoading ||
      confirmPinResetState.isLoading,
    [
      confirmPinResetState.isLoading,
      loginState.isLoading,
      registerOwnerState.isLoading,
      registerUserState.isLoading,
      requestOtpState.isLoading,
      requestPinResetState.isLoading,
      setPinState.isLoading,
      verifyOtpState.isLoading,
    ],
  );
  const otpCooldownSeconds = otpRequestedAt
    ? Math.max(0, 30 - Math.floor((currentTimeMs - otpRequestedAt) / 1000))
    : 0;

  const title =
    step === "setupOtp"
      ? "Set your PIN"
      : step === "resetRequest"
        ? "Reset PIN"
        : step === "resetOtp"
          ? "Verify reset OTP"
          : step === "resetPin"
            ? "Choose new PIN"
            : mode === "login"
              ? "Welcome back"
              : "Create account";

  const subtitle =
    step === "setupOtp"
      ? "We requested an OTP. Verify it, then choose a secure 6 digit PIN."
      : step === "resetRequest"
        ? "Request a reset OTP for your registered phone number."
        : step === "resetOtp"
          ? "Enter the OTP sent by the backend auth provider."
          : step === "resetPin"
            ? "Create and confirm your new 6 digit PIN."
            : mode === "login"
              ? "Use your phone number and 6 digit PIN."
              : "Users and owners can sign up. Managers are provisioned by owners.";

  async function persistTokenSession(response: TokenResponse) {
    const session = {
      accessToken: response.accessToken,
      user: response.user,
    };
    dispatch(setSession(session));
    await saveSession(session);
    router.replace("/(tabs)");
  }

  function validatePhone(value: string) {
    if (!isValidPhone(value)) {
      setMessage("Enter a valid 10 digit phone number, e.g. 9876543210.");
      return false;
    }
    return true;
  }

  function validatePinPair() {
    if (!isValidPin(newPin)) {
      setMessage("PIN must be exactly 6 digits.");
      return false;
    }
    if (newPin !== confirmPin) {
      setMessage("Both PIN entries must match.");
      return false;
    }
    return true;
  }

  async function handleLogin() {
    setMessage(null);
    if (!validatePhone(loginPhone)) {
      return;
    }
    if (!isValidPin(pin)) {
      setMessage("PIN must be exactly 6 digits.");
      return;
    }

    try {
      const response = await loginWithPin({ phone: loginPhone, pin }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleRegister() {
    setMessage(null);
    if (!validatePhone(signupPhone)) {
      return;
    }
    if (!fullName.trim()) {
      setMessage("Enter your full name.");
      return;
    }

    try {
      if (accountType === "OWNER") {
        await registerOwner({ phone: signupPhone, fullName: fullName.trim() }).unwrap();
      } else {
        await registerUser({ phone: signupPhone, fullName: fullName.trim() }).unwrap();
      }

      setOtp("");
      setNewPin("");
      setConfirmPin("");
      setSetupOtpVerified(false);
      const now = Date.now();
      setCurrentTimeMs(now);
      setOtpRequestedAt(now);
      setStep("setupOtp");
      setMessage("Account created. Setup OTP requested.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleRequestSetupOtp() {
    setMessage(null);
    if (!validatePhone(signupPhone)) {
      return;
    }

    try {
      await requestOtp({ phone: signupPhone, purpose: "LOGIN", channel: "SMS" }).unwrap();
      setSetupOtpVerified(false);
      const now = Date.now();
      setCurrentTimeMs(now);
      setOtpRequestedAt(now);
      setMessage("PIN setup OTP requested.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleVerifySetupOtp() {
    setMessage(null);
    if (otp.length !== 6) {
      setMessage("Enter the 6 digit OTP.");
      return;
    }

    try {
      await verifyOtp({ phone: signupPhone, otp, purpose: "LOGIN" }).unwrap();
      setSetupOtpVerified(true);
      setMessage("OTP verified. Choose your PIN.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleSetPin() {
    setMessage(null);
    if (otp.length !== 6) {
      setMessage("Enter the 6 digit OTP first.");
      return;
    }
    if (!validatePinPair()) {
      return;
    }

    try {
      const response = await setPinMutation({ phone: signupPhone, otp, pin: newPin }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleRequestResetOtp() {
    setMessage(null);
    if (!validatePhone(resetPhone)) {
      return;
    }

    try {
      await requestPinReset({ phone: resetPhone, channel: "SMS" }).unwrap();
      setOtp("");
      const now = Date.now();
      setCurrentTimeMs(now);
      setOtpRequestedAt(now);
      setStep("resetOtp");
      setMessage("PIN reset OTP requested.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleVerifyResetOtp() {
    setMessage(null);
    if (otp.length !== 6) {
      setMessage("Enter the 6 digit OTP.");
      return;
    }

    try {
      await verifyOtp({ phone: resetPhone, otp, purpose: "PIN_RESET" }).unwrap();
      setNewPin("");
      setConfirmPin("");
      setStep("resetPin");
      setMessage("OTP verified. Choose a new PIN.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleResetPin() {
    setMessage(null);
    if (otp.length !== 6) {
      setMessage("Enter the 6 digit OTP first.");
      return;
    }
    if (!validatePinPair()) {
      return;
    }

    try {
      const response = await confirmPinReset({ phone: resetPhone, otp, newPin }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function goToLogin() {
    setMode("login");
    setStep("entry");
    setMessage(null);
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setSetupOtpVerified(false);
    setOtpRequestedAt(null);
  }

  function goToSignup() {
    setMode("signup");
    setStep("entry");
    setMessage(null);
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setSetupOtpVerified(false);
    setOtpRequestedAt(null);
  }

  return (
    <ScreenScrollView centerContent>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderColor: colors.primary,
              borderRadius: 12,
              borderWidth: 1,
              height: 52,
              justifyContent: "center",
              width: 52,
            }}
          >
            <Text
              style={{
                color: colors.primary,
                fontFamily: fonts.display,
                fontSize: 28,
                fontStyle: "italic",
                fontWeight: "500",
                letterSpacing: -1,
              }}
              selectable
            >
              K
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
              Khatiyan · खतियान
            </Text>
            <Text style={[type.caption, { color: colors.kicker }]} selectable>
              A modern ledger for PG & rental life
            </Text>
          </View>
        </View>

        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 36,
            fontWeight: "500",
            letterSpacing: -0.8,
            lineHeight: 42,
          }}
          selectable
        >
          Property living,
          <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }} selectable>
            {" "}
            on the record.
          </Text>
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 480 }]} selectable>
          Sign in to manage stays, bills, concerns, notices and discovery — all from one quiet workspace.
        </Text>
      </View>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
              {step === "entry" ? (mode === "login" ? "Step · sign in" : "Step · register") : "Verify"}
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 22,
                fontWeight: "500",
                letterSpacing: -0.3,
              }}
              selectable
            >
              {title}
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 14 }]} selectable>
              {subtitle}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]} selectable>
              Dark
            </Text>
            <Switch
              value={isDark}
              onValueChange={() => {
                const nextThemeMode = isDark ? "light" : "dark";
                dispatch(toggleThemeMode());
                void saveThemeMode(nextThemeMode);
              }}
              trackColor={{ false: colors.neutralSoft, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        {step === "entry" ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SegmentButton active={mode === "login"} label="Login" onPress={goToLogin} />
            <SegmentButton active={mode === "signup"} label="Signup" onPress={goToSignup} />
          </View>
        ) : null}

        {step === "entry" && mode === "login" ? (
          <>
            <FormInput label="Phone" value={loginPhone} onChangeText={setLoginPhone} placeholder="9876543210" />
            <CodeInput label="PIN" value={pin} onChangeText={setPin} secureTextEntry />
            <View style={{ alignItems: "flex-end" }}>
              <LinkButton
                label="Forgot or reset PIN?"
                onPress={() => {
                  setStep("resetRequest");
                  setMessage(null);
                  setOtp("");
                  setNewPin("");
                  setConfirmPin("");
                }}
              />
            </View>
            <PrimaryButton label="Login with PIN" onPress={handleLogin} busy={busy} />
          </>
        ) : null}

        {step === "entry" && mode === "signup" ? (
          <>
            <FormInput label="Phone" value={signupPhone} onChangeText={setSignupPhone} placeholder="9876543210" />
            <FormInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your name" />
            <View style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }} selectable>
                Account type
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SegmentButton active={accountType === "USER"} label="User" onPress={() => setAccountType("USER")} />
                <SegmentButton active={accountType === "OWNER"} label="Owner" onPress={() => setAccountType("OWNER")} />
              </View>
            </View>
            <PrimaryButton label={`Create ${accountType.toLowerCase()} account`} onPress={handleRegister} busy={busy} />
          </>
        ) : null}

        {step === "setupOtp" ? (
          <>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Step 2 of 2
            </Text>
            <CodeInput label="OTP" value={otp} onChangeText={setOtp} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <PrimaryButton
                label={otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}
                onPress={handleRequestSetupOtp}
                busy={busy}
                disabled={otpCooldownSeconds > 0}
                muted
                grow
              />
              <PrimaryButton label="Verify OTP" onPress={handleVerifySetupOtp} busy={busy} grow />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }} selectable>
              After OTP verification, enter and retype your PIN below.
            </Text>
            {setupOtpVerified ? (
              <>
                <CodeInput label="New PIN" value={newPin} onChangeText={setNewPin} secureTextEntry />
                <CodeInput label="Retype PIN" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry />
                <PrimaryButton label="Set PIN and enter app" onPress={handleSetPin} busy={busy} />
              </>
            ) : null}
            <LinkButton label="Back to signup" onPress={goToSignup} />
          </>
        ) : null}

        {step === "resetRequest" ? (
          <>
            <FormInput label="Phone" value={resetPhone} onChangeText={setResetPhone} placeholder="9876543210" />
            <PrimaryButton label="Request reset OTP" onPress={handleRequestResetOtp} busy={busy} />
            <LinkButton label="Back to login" onPress={goToLogin} />
          </>
        ) : null}

        {step === "resetOtp" ? (
          <>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Reset PIN / OTP
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
              Enter the OTP sent to {resetPhone}.
            </Text>
            <CodeInput label="OTP" value={otp} onChangeText={setOtp} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <PrimaryButton
                label={otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}
                onPress={handleRequestResetOtp}
                busy={busy}
                disabled={otpCooldownSeconds > 0}
                muted
                grow
              />
              <PrimaryButton label="Validate OTP" onPress={handleVerifyResetOtp} busy={busy} grow />
            </View>
            <LinkButton label="Back to login" onPress={goToLogin} />
          </>
        ) : null}

        {step === "resetPin" ? (
          <>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Reset PIN / Final step
            </Text>
            <CodeInput label="New PIN" value={newPin} onChangeText={setNewPin} secureTextEntry />
            <CodeInput label="Retype PIN" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry />
            <PrimaryButton label="Reset PIN and enter app" onPress={handleResetPin} busy={busy} />
            <LinkButton label="Back to login" onPress={goToLogin} />
          </>
        ) : null}

        {message ? (
          <Text
            style={{
              color: successMessage(message) ? colors.primary : colors.danger,
              lineHeight: 21,
            }}
            selectable
          >
            {message}
          </Text>
        ) : null}
      </Card>

      <Card tone="sunken">
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Developer · backend
        </Text>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 18,
            fontWeight: "500",
          }}
          selectable
        >
          Connection
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
          Auto-detected from the Expo dev server. Override only if your backend runs elsewhere.
        </Text>
        <FormInput
          label="API base URL"
          value={apiBaseUrl}
          onChangeText={(value) => dispatch(setApiBaseUrl(value))}
          placeholder="http://192.168.1.10:8080"
        />
        <PrimaryButton label="Use detected URL" onPress={() => dispatch(resetApiBaseUrl())} muted />
      </Card>
    </ScreenScrollView>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: 10,
          borderWidth: 1,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: "500",
          padding: spacing.md,
        }}
      />
    </View>
  );
}

function CodeInput({
  label,
  value,
  onChangeText,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const { colors, fonts, type } = useTheme();
  const digits = digitsOnly(value).slice(0, 6);
  const [showValue, setShowValue] = useState(false);
  const hideValue = Boolean(secureTextEntry && !showValue);

  function updateValue(nextValue: string) {
    onChangeText(digitsOnly(nextValue).slice(0, 6));
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <AnimatedPressable
          onPress={() => inputRef.current?.focus()}
          style={{
            flex: 1,
            flexDirection: "row",
            gap: spacing.xs,
            justifyContent: "space-between",
            position: "relative",
          }}
        >
        {Array.from({ length: 6 }).map((_, index) => {
          const digit = digits[index];
          const active = index === digits.length;
          const filled = Boolean(digit);
          return (
            <View
              key={`${label}-${index}`}
              style={{
                alignItems: "center",
                backgroundColor: active ? colors.primarySoft : filled ? colors.surface : colors.surfaceRaised,
                borderColor: active ? colors.primary : filled ? colors.borderStrong : colors.border,
                borderRadius: 10,
                borderWidth: active ? 1.5 : 1,
                flex: 1,
                height: 52,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontVariant: ["tabular-nums"],
                  fontWeight: "500",
                }}
                selectable
              >
                {digit ? (hideValue ? "•" : digit) : ""}
              </Text>
            </View>
          );
        })}
          <TextInput
            ref={inputRef}
            value={digits}
            onChangeText={updateValue}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            caretHidden
            style={{
              bottom: 0,
              color: "transparent",
              left: 0,
              opacity: 0.01,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          />
        </AnimatedPressable>
        {secureTextEntry ? (
          <AnimatedPressable
            accessibilityLabel={showValue ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            onPress={() => setShowValue((currentValue) => !currentValue)}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              borderRadius: 10,
              borderWidth: 1,
              height: 52,
              justifyContent: "center",
              width: 52,
            }}
          >
            {showValue ? (
              <EyeOff color={colors.kicker} size={20} strokeWidth={2.1} />
            ) : (
              <Eye color={colors.kicker} size={20} strokeWidth={2.1} />
            )}
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primary : "transparent",
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 50,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Text
        style={{
          color: active ? colors.onPrimary : colors.inkSoft,
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: "700",
          letterSpacing: 0.5,
        }}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  muted,
  grow,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  muted?: boolean;
  grow?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const backgroundColor = disabled ? colors.neutralSoft : muted ? "transparent" : colors.primary;
  const textColor = disabled ? colors.neutralText : muted ? colors.primary : colors.onPrimary;
  const borderColor = muted ? colors.border : "transparent";

  return (
    <AnimatedPressable
      onPress={busy || disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        alignSelf: "stretch",
        backgroundColor,
        borderColor,
        borderRadius: 12,
        borderWidth: muted ? 1 : 0,
        flex: grow ? 1 : undefined,
        justifyContent: "center",
        minHeight: 54,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        width: grow ? undefined : "100%",
      }}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={{
            color: textColor,
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: "700",
            letterSpacing: 0.6,
          }}
          selectable
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable onPress={onPress} style={{ alignSelf: "center", padding: spacing.xs }}>
      <Text
        style={{
          color: colors.primary,
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.3,
          textDecorationLine: "underline",
          textDecorationStyle: "dotted",
        }}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
