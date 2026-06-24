import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Eye, EyeOff, KeyRound, Lock, Mail, Moon, Phone, Server, ShieldCheck, Sun, User, type LucideProps } from "lucide-react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, LinearGradient as SvgLinearGradient } from "react-native-svg";

import { saveSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { FadeInView } from "@/components/fade-in-view";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { loadThemeModeForUser, saveActiveAccount, saveThemeMode } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  useConfirmEmailLoginMutation,
  useConfirmPinResetMutation,
  useLoginWithPinMutation,
  useRegisterOwnerMutation,
  useRegisterUserMutation,
  useRequestEmailLoginMutation,
  useRequestOtpMutation,
  useRequestPinResetMutation,
  useSetPinMutation,
  useVerifyOtpMutation,
  type TokenResponse,
} from "@/store/services/auth-api";
import { resetApiBaseUrl, setApiBaseUrl, setThemeMode, toggleThemeMode } from "@/store/slices/app-config-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type AccountType = "USER" | "OWNER";
type AuthMode = "login" | "signup";
type AuthStep = "entry" | "setupOtp" | "resetRequest" | "resetOtp" | "resetPin" | "emailLogin";

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPin(value: string) {
  return /^\d{6}$/.test(value);
}

function successMessage(value: string) {
  const loweredValue = value.toLowerCase();
  return loweredValue.includes("created") || loweredValue.includes("requested");
}

export function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { colors, fonts, isDark, type } = useTheme();
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl);
  const auth = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("entry");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [emailLoginOtpRequested, setEmailLoginOtpRequested] = useState(false);
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupOtpVerified, setSetupOtpVerified] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("USER");
  const [otpRequestedAt, setOtpRequestedAt] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [showDev, setShowDev] = useState(false);

  const [loginWithPin, loginState] = useLoginWithPinMutation();
  const [registerUser, registerUserState] = useRegisterUserMutation();
  const [registerOwner, registerOwnerState] = useRegisterOwnerMutation();
  const [requestOtp, requestOtpState] = useRequestOtpMutation();
  const [verifyOtp, verifyOtpState] = useVerifyOtpMutation();
  const [setPinMutation, setPinState] = useSetPinMutation();
  const [requestPinReset, requestPinResetState] = useRequestPinResetMutation();
  const [confirmPinReset, confirmPinResetState] = useConfirmPinResetMutation();
  const [requestEmailLogin, requestEmailLoginState] = useRequestEmailLoginMutation();
  const [confirmEmailLogin, confirmEmailLoginState] = useConfirmEmailLoginMutation();

  useEffect(() => {
    if (auth.hydrated && auth.accessToken) {
      router.replace("/account-select");
    }
  }, [auth.accessToken, auth.hydrated, router]);

  // Bridge the screen's existing message calls to the global toast system.
  // null clears are no-ops now; type is inferred from the copy.
  const setMessage = useCallback(
    (value: string | null) => {
      if (value) {
        toast.show(value, successMessage(value) ? "success" : "error");
      }
    },
    [toast],
  );

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
      requestEmailLoginState.isLoading ||
      verifyOtpState.isLoading ||
      setPinState.isLoading ||
      requestPinResetState.isLoading ||
      confirmEmailLoginState.isLoading ||
      confirmPinResetState.isLoading,
    [
      confirmEmailLoginState.isLoading,
      confirmPinResetState.isLoading,
      loginState.isLoading,
      registerOwnerState.isLoading,
      registerUserState.isLoading,
      requestEmailLoginState.isLoading,
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
      ? "Verify the code we sent, then choose a 6-digit PIN."
      : step === "resetRequest"
        ? "We'll text a one-time code to reset your PIN."
        : step === "resetOtp"
          ? `Enter the code sent to +91 ${resetPhone}.`
          : step === "resetPin"
            ? "Pick a new 6-digit PIN to secure your account."
            : mode === "login"
              ? "Sign in to manage your stays and properties."
              : "Join Khatiyan to manage tenancies the simple way.";

  async function persistTokenSession(response: TokenResponse) {
    const firstName = response.user.fullName?.trim().split(/\s+/)[0];
    // Fired here so the toast survives the redirect and greets the user on Home.
    toast.success(firstName ? `Welcome back, ${firstName}!` : "Welcome back!");
    const session = {
      accessToken: response.accessToken,
      user: response.user,
    };
    dispatch(clearActiveAccount());
    dispatch(setPinnedOwnerModules([]));
    await saveActiveAccount(null);
    const savedThemeMode = await loadThemeModeForUser(response.user.id);
    dispatch(setThemeMode(savedThemeMode ?? "light"));
    dispatch(setSession(session));
    await saveSession(session);
    router.replace("/account-select");
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
    if (!isValidEmail(signupEmail)) {
      setMessage("Enter a valid recovery email address.");
      return;
    }
    if (!fullName.trim()) {
      setMessage("Enter your full name.");
      return;
    }

    try {
      if (accountType === "OWNER") {
        await registerOwner({ phone: signupPhone, email: signupEmail.trim(), fullName: fullName.trim() }).unwrap();
      } else {
        await registerUser({ phone: signupPhone, email: signupEmail.trim(), fullName: fullName.trim() }).unwrap();
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
      await requestOtp({ phone: signupPhone, purpose: "LOGIN", channel: "SMS_AND_EMAIL" }).unwrap();
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

  async function handleEmailLoginRequest() {
    if (!isValidEmail(loginEmail)) {
      setMessage("Enter a valid verified email address.");
      return;
    }
    try {
      await requestEmailLogin({ email: loginEmail.trim() }).unwrap();
      setOtp("");
      setEmailLoginOtpRequested(true);
      toast.show("Email OTP sent. Check your verified email.", "info");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleEmailLoginConfirm() {
    if (otp.length !== 6) {
      setMessage("Enter the 6 digit OTP.");
      return;
    }
    try {
      const response = await confirmEmailLogin({ email: loginEmail.trim(), otp }).unwrap();
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

  function toggleTheme() {
    const nextThemeMode = isDark ? "light" : "dark";
    dispatch(toggleThemeMode());
    void saveThemeMode(nextThemeMode);
  }

  return (
    <ScreenScrollView centerContent background={<AuthBackground />} contentContainerStyle={{ gap: spacing.xl }}>
      <FadeInView index={0}>
        <View style={{ alignItems: "flex-end" }}>
          <AnimatedPressable
            accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
            accessibilityRole="button"
            onPress={toggleTheme}
            style={{
              alignItems: "center",
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(63,110,216,0.18)",
              borderCurve: "continuous",
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 7,
              paddingLeft: spacing.sm,
              paddingRight: spacing.md,
              paddingVertical: 7,
            }}
          >
            {isDark ? (
              <Moon color={colors.primary} size={15} strokeWidth={2.4} />
            ) : (
              <Sun color={colors.accent} size={15} strokeWidth={2.4} />
            )}
            <Text
              style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 }}
              selectable
            >
              {isDark ? "Dark" : "Light"}
            </Text>
          </AnimatedPressable>
        </View>

        <View style={{ alignItems: "center", gap: spacing.lg, paddingTop: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              borderCurve: "continuous",
              borderRadius: 26,
              elevation: 12,
              height: 84,
              justifyContent: "center",
              overflow: "hidden",
              shadowColor: colors.primary,
              shadowOffset: { height: 14, width: 0 },
              shadowOpacity: 0.45,
              shadowRadius: 24,
              width: 84,
            }}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDeep]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={{ alignItems: "center", height: "100%", justifyContent: "center", width: "100%" }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontFamily: fonts.display,
                  fontSize: 44,
                  fontStyle: "italic",
                  fontWeight: "500",
                  letterSpacing: -1.5,
                }}
                selectable
              >
                K
              </Text>
            </LinearGradient>
          </View>
          <View style={{ alignItems: "center", gap: spacing.xs }}>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 36,
                fontWeight: "600",
                letterSpacing: -1,
                lineHeight: 42,
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontFamily: fonts.sans,
                fontSize: 14.5,
                lineHeight: 21,
                maxWidth: 300,
                textAlign: "center",
              }}
              selectable
            >
              {subtitle}
            </Text>
          </View>
        </View>
      </FadeInView>

      <FadeInView index={1}>
        <AuthCard>
          {step === "entry" && mode === "login" ? (
            <>
              <PhoneInput label="Phone number" value={loginPhone} onChangeText={setLoginPhone} />
              <CodeInput label="PIN" value={pin} onChangeText={setPin} secureTextEntry />
              <View style={{ alignItems: "flex-end", marginTop: -spacing.xs }}>
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
              <PrimaryButton label="Log in" onPress={handleLogin} busy={busy} />
              <LinkButton
                label="Sign in with verified email"
                onPress={() => {
                  setStep("emailLogin");
                  setOtp("");
                  setEmailLoginOtpRequested(false);
                }}
                center
              />
              <AuthModeFooter actionLabel="Create account" label="Don't have an account?" onPress={goToSignup} />
            </>
          ) : null}

          {step === "emailLogin" ? (
            <>
              <FormInput label="Verified email" value={loginEmail} onChangeText={setLoginEmail} placeholder="you@example.com" icon={Mail} />
              {emailLoginOtpRequested ? (
                <>
                  <CodeInput label="Email OTP" value={otp} onChangeText={setOtp} />
                  <PrimaryButton label="Sign in with email" onPress={handleEmailLoginConfirm} busy={busy} />
                  <LinkButton label="Resend email OTP" onPress={handleEmailLoginRequest} center muted />
                </>
              ) : (
                <PrimaryButton label="Send email OTP" onPress={handleEmailLoginRequest} busy={busy} muted />
              )}
              <LinkButton label="Back to PIN login" onPress={goToLogin} center />
            </>
          ) : null}

          {step === "entry" && mode === "signup" ? (
            <>
              <PhoneInput label="Phone number" value={signupPhone} onChangeText={setSignupPhone} />
              <FormInput label="Recovery email" value={signupEmail} onChangeText={setSignupEmail} placeholder="you@example.com" icon={Mail} />
              <FormInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Enter your name" autoCapitalize="words" icon={User} />
              <View style={{ gap: spacing.sm }}>
                <FieldLabel>I am a</FieldLabel>
                <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: spacing.xxs, padding: spacing.xxs }}>
                  <SegmentButton active={accountType === "USER"} label="Tenant" onPress={() => setAccountType("USER")} />
                  <SegmentButton active={accountType === "OWNER"} label="Owner" onPress={() => setAccountType("OWNER")} />
                </View>
              </View>
              <PrimaryButton label={accountType === "OWNER" ? "Create owner account" : "Create tenant account"} onPress={handleRegister} busy={busy} />
              <AuthModeFooter actionLabel="Sign in" label="Already have an account?" onPress={goToLogin} />
            </>
          ) : null}

          {step === "setupOtp" ? (
            <>
              <StepBadge text="Step 2 of 2" />
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
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 }} selectable>
                After OTP verification, enter and retype your PIN below.
              </Text>
              {setupOtpVerified ? (
                <>
                  <CodeInput label="New PIN" value={newPin} onChangeText={setNewPin} secureTextEntry />
                  <CodeInput label="Retype PIN" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry />
                  <PrimaryButton label="Set PIN and enter app" onPress={handleSetPin} busy={busy} />
                </>
              ) : null}
              <LinkButton label="Back to signup" onPress={goToSignup} center />
            </>
          ) : null}

          {step === "resetRequest" ? (
            <>
              <PhoneInput label="Phone number" value={resetPhone} onChangeText={setResetPhone} />
              <PrimaryButton label="Request reset OTP" onPress={handleRequestResetOtp} busy={busy} />
              <LinkButton label="Back to login" onPress={goToLogin} center />
            </>
          ) : null}

          {step === "resetOtp" ? (
            <>
              <StepBadge text="Reset PIN · OTP" />
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
              <LinkButton label="Back to login" onPress={goToLogin} center />
            </>
          ) : null}

          {step === "resetPin" ? (
            <>
              <StepBadge text="Reset PIN · Final step" />
              <CodeInput label="New PIN" value={newPin} onChangeText={setNewPin} secureTextEntry />
              <CodeInput label="Retype PIN" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry />
              <PrimaryButton label="Reset PIN and enter app" onPress={handleResetPin} busy={busy} />
              <LinkButton label="Back to login" onPress={goToLogin} center />
            </>
          ) : null}
        </AuthCard>
      </FadeInView>

      <View style={{ alignItems: "center" }}>
        <LinkButton label={showDev ? "Hide developer options" : "Developer options"} onPress={() => setShowDev((value) => !value)} center muted />
      </View>

      {showDev ? (
        <AuthCard tone="sunken">
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Server color={colors.kicker} size={16} strokeWidth={2.2} />
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Developer · backend
            </Text>
          </View>
          <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
            Auto-detected from the Expo dev server. Override only if your backend runs elsewhere.
          </Text>
          <FormInput
            label="API base URL"
            value={apiBaseUrl}
            onChangeText={(value) => dispatch(setApiBaseUrl(value))}
            placeholder="http://192.168.1.10:8080"
            icon={Server}
          />
          <PrimaryButton label="Use detected URL" onPress={() => dispatch(resetApiBaseUrl())} muted />
        </AuthCard>
      ) : null}
    </ScreenScrollView>
  );
}

function AuthCard({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "sunken" }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tone === "sunken" ? colors.surfaceSunken : colors.surface,
        borderColor: isDark ? colors.border : "rgba(63,110,216,0.12)",
        borderCurve: "continuous",
        borderRadius: 30,
        borderWidth: 1,
        elevation: tone === "sunken" ? 0 : 8,
        gap: spacing.md,
        padding: spacing.xl,
        shadowColor: isDark ? "#000000" : "rgba(30,58,120,1)",
        shadowOffset: { height: 20, width: 0 },
        shadowOpacity: tone === "sunken" ? 0 : isDark ? 0.5 : 0.16,
        shadowRadius: 34,
      }}
    >
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.3 }} selectable>
      {children}
    </Text>
  );
}

function StepBadge({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.primarySoft,
        borderCurve: "continuous",
        borderRadius: 999,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
      }}
    >
      <ShieldCheck color={colors.primary} size={13} strokeWidth={2.4} />
      <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sans, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" }} selectable>
        {text}
      </Text>
    </View>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  icon: Icon,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  icon?: ComponentType<LucideProps>;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        {Icon ? <Icon color={focused ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sans,
            fontSize: 16,
            fontWeight: "600",
            paddingVertical: spacing.md,
          }}
        />
      </View>
    </View>
  );
}

function AuthBackground() {
  const { isDark } = useTheme();
  const { height, width } = useWindowDimensions();

  const base = isDark ? ["#0A0B10", "#070708", "#050505"] : ["#EAF0FF", "#F4F7FE", "#FCFDFF"];
  const primaryGlow = isDark ? "#3F6ED8" : "#3F6ED8";
  const accentGlow = isDark ? "#1E293B" : "#F6C667";

  return (
    <View style={{ flex: 1 }}>
      <Svg height={height} width={width}>
        <Defs>
          <SvgLinearGradient id="auth-base" x1="0" x2="0.4" y1="0" y2="1">
            <Stop offset="0" stopColor={base[0]} />
            <Stop offset="0.5" stopColor={base[1]} />
            <Stop offset="1" stopColor={base[2]} />
          </SvgLinearGradient>
          <RadialGradient id="auth-orb-primary" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={primaryGlow} stopOpacity={isDark ? 0.32 : 0.34} />
            <Stop offset="1" stopColor={primaryGlow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="auth-orb-accent" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={accentGlow} stopOpacity={isDark ? 0.22 : 0.3} />
            <Stop offset="1" stopColor={accentGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#auth-base)" height={height} width={width} x="0" y="0" />
        <Circle cx={width * 0.18} cy={height * 0.1} fill="url(#auth-orb-primary)" r={width * 0.62} />
        <Circle cx={width * 1.0} cy={height * 0.32} fill="url(#auth-orb-accent)" r={width * 0.5} />
        <Circle cx={width * 0.85} cy={height * 1.02} fill="url(#auth-orb-primary)" r={width * 0.6} />
      </Svg>
    </View>
  );
}

// Phone entry with a fixed India country-code chip. This is a single, real
// TextInput so the caret, selection and Android autofill all behave natively.
// autoComplete="tel" + importantForAutofill="no" stop the keyboard from
// offering "save a password" on what is plainly a phone field.
function PhoneInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1.5,
            flexDirection: "row",
            gap: 6,
            justifyContent: "center",
            minHeight: 56,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ fontSize: 18 }}>🇮🇳</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
            +91
          </Text>
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: focused ? colors.primary : colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1.5,
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 56,
            paddingHorizontal: spacing.lg,
          }}
        >
          <Phone color={focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
          <TextInput
            value={value}
            onChangeText={(next) => onChangeText(digitsOnly(next).slice(0, 10))}
            autoCapitalize="none"
            autoComplete="tel"
            autoCorrect={false}
            importantForAutofill="no"
            keyboardType="phone-pad"
            maxLength={10}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            placeholder="Enter phone number"
            placeholderTextColor={colors.muted}
            textContentType="telephoneNumber"
            style={{
              color: colors.ink,
              flex: 1,
              fontFamily: fonts.sans,
              fontSize: 16,
              fontWeight: "700",
              letterSpacing: 0.6,
              paddingVertical: spacing.md,
            }}
          />
        </View>
      </View>
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
  const { colors, fonts } = useTheme();
  const [showValue, setShowValue] = useState(false);
  const [focused, setFocused] = useState(false);
  const hideValue = Boolean(secureTextEntry && !showValue);
  const Icon = secureTextEntry ? Lock : KeyRound;
  const placeholderText = secureTextEntry ? "Enter 6-digit PIN" : "Enter 6-digit code";

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Icon color={focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
        <View style={{ flex: 1, justifyContent: "center", minHeight: 56 }}>
          {!value ? (
            <Text
              pointerEvents="none"
              style={{
                color: colors.muted,
                fontFamily: fonts.sans,
                fontSize: 15,
                fontWeight: "700",
                left: 4,
                position: "absolute",
              }}
            >
              {placeholderText}
            </Text>
          ) : null}
          <TextInput
            value={value}
            onChangeText={(next) => onChangeText(digitsOnly(next).slice(0, 6))}
            autoComplete={secureTextEntry ? "off" : "sms-otp"}
            importantForAutofill="no"
            keyboardType="number-pad"
            maxLength={6}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            secureTextEntry={hideValue}
            textContentType={secureTextEntry ? "password" : "oneTimeCode"}
            style={{
              color: colors.ink,
              fontFamily: value ? fonts.mono : fonts.sans,
              fontSize: value ? 21 : 15,
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              letterSpacing: value ? 9 : 0,
              minHeight: 56,
              paddingVertical: 0,
            }}
          />
        </View>
        {secureTextEntry ? (
          <AnimatedPressable
            accessibilityLabel={showValue ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setShowValue((currentValue) => !currentValue)}
            style={{ alignItems: "center", justifyContent: "center", paddingLeft: spacing.xs }}
          >
            {showValue ? (
              <EyeOff color={colors.muted} size={20} strokeWidth={2.1} />
            ) : (
              <Eye color={colors.muted} size={20} strokeWidth={2.1} />
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
        backgroundColor: active ? colors.surface : "transparent",
        borderColor: active ? colors.border : "transparent",
        borderCurve: "continuous",
        borderRadius: 13,
        borderWidth: 1,
        elevation: active ? 2 : 0,
        flex: 1,
        justifyContent: "center",
        minHeight: 46,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: active ? 1 : 0,
        shadowRadius: 6,
      }}
    >
      <Text
        style={{
          color: active ? colors.primary : colors.muted,
          fontFamily: fonts.sans,
          fontSize: 14.5,
          fontWeight: "800",
          letterSpacing: 0.3,
        }}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function AuthModeFooter({ actionLabel, label, onPress }: { actionLabel: string; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xxs, paddingTop: spacing.md }}>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 5,
          justifyContent: "center",
          minHeight: 32,
          paddingHorizontal: spacing.sm,
        }}
      >
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13.5 }}>{label}</Text>
        <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "800" }}>{actionLabel}</Text>
      </AnimatedPressable>
    </View>
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
  const filled = !muted && !disabled;
  const textColor = disabled ? colors.neutralText : muted ? colors.primary : "#FFFFFF";

  const content = busy ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <Text
      style={{
        color: textColor,
        fontFamily: fonts.sans,
        fontSize: 15.5,
        fontWeight: "800",
        letterSpacing: 0.4,
      }}
      selectable
    >
      {label}
    </Text>
  );

  const innerStyle = {
    alignItems: "center" as const,
    borderCurve: "continuous" as const,
    borderRadius: 16,
    justifyContent: "center" as const,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  };

  return (
    <AnimatedPressable
      onPress={busy || disabled ? undefined : onPress}
      style={{
        alignSelf: "stretch",
        borderCurve: "continuous",
        borderRadius: 16,
        elevation: filled ? 6 : 0,
        flex: grow ? 1 : undefined,
        shadowColor: colors.primary,
        shadowOffset: { height: 8, width: 0 },
        shadowOpacity: filled ? 0.36 : 0,
        shadowRadius: 14,
        width: grow ? undefined : "100%",
      }}
    >
      {filled ? (
        <LinearGradient colors={[colors.primary, colors.primaryDeep]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={innerStyle}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={{
            ...innerStyle,
            backgroundColor: disabled ? colors.neutralSoft : "transparent",
            borderColor: colors.border,
            borderWidth: 1.5,
          }}
        >
          {content}
        </View>
      )}
    </AnimatedPressable>
  );
}

function LinkButton({ label, onPress, center, muted }: { label: string; onPress: () => void; center?: boolean; muted?: boolean }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable onPress={onPress} style={{ alignSelf: center ? "center" : "auto", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}>
      <Text
        style={{
          color: muted ? colors.muted : colors.primary,
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.2,
        }}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
