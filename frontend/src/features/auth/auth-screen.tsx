import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Server } from "lucide-react-native";

import { saveSession } from "@/auth/session-storage";
import { FadeInView } from "@/components/fade-in-view";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { loadThemeModeForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { AUTH_SHEET_OVERLAP, AuthHero, authHeroCopy, type AuthMode, type AuthStep } from "@/features/auth/auth-hero";
import {
  AuthBackground,
  AuthCard,
  AuthTextField,
  errorMessage,
  isValidEmail,
  isValidPhone,
  isValidPin,
  LinkButton,
  PrimaryButton,
} from "@/features/auth/auth-ui";
import { EmailLoginStep } from "@/features/auth/steps/email-login-step";
import { LoginStep } from "@/features/auth/steps/login-step";
import { ResetOtpStep } from "@/features/auth/steps/reset-otp-step";
import { ResetPinStep } from "@/features/auth/steps/reset-pin-step";
import { ResetRequestStep } from "@/features/auth/steps/reset-request-step";
import { SetupOtpStep } from "@/features/auth/steps/setup-otp-step";
import { SetupPinStep } from "@/features/auth/steps/setup-pin-step";
import { SignupStep } from "@/features/auth/steps/signup-step";
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
import { resetApiBaseUrl, setApiBaseUrl, setThemeMode } from "@/store/slices/app-config-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

function successMessage(value: string) {
  const loweredValue = value.toLowerCase();
  return (
    loweredValue.includes("created") ||
    loweredValue.includes("requested") ||
    loweredValue.includes("verified") ||
    loweredValue.includes("sent")
  );
}

/**
 * Auth flow orchestrator: owns the step state machine, all mutations and
 * navigation. Each step's UI lives in its own file under ./steps; shared
 * fields and buttons in ./auth-ui; hero art and copy in ./auth-hero.
 */
export function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
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

  function startOtpCooldown() {
    const now = Date.now();
    setCurrentTimeMs(now);
    setOtpRequestedAt(now);
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
    // Recovery email is optional now that every account starts role-less (the
    // owner/tenant choice moves to the post-login landing); a typed value must
    // still be a valid email.
    if (signupEmail.trim() && !isValidEmail(signupEmail)) {
      setMessage("Enter a valid recovery email, or leave it blank.");
      return;
    }
    if (!fullName.trim()) {
      setMessage("Enter your full name.");
      return;
    }

    try {
      await registerUser({ phone: signupPhone, email: signupEmail.trim(), fullName: fullName.trim() }).unwrap();

      setOtp("");
      setNewPin("");
      setConfirmPin("");
      startOtpCooldown();
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
      startOtpCooldown();
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
      setNewPin("");
      setConfirmPin("");
      setStep("setupPin");
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
      startOtpCooldown();
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

  function resetTransientState() {
    setMessage(null);
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setOtpRequestedAt(null);
  }

  function goToLogin() {
    setMode("login");
    setStep("entry");
    resetTransientState();
  }

  function goToSignup() {
    setMode("signup");
    setStep("entry");
    resetTransientState();
  }

  const heroCopy = authHeroCopy(step, mode, { resetPhone, signupPhone });

  return (
    <ScreenScrollView
      background={<AuthBackground />}
      bounces={false}
      // No padding / safe-area here: the hero band goes full-bleed to the top
      // edge (self-managing the status-bar inset) and the sheet below owns its
      // own padding. flexGrow makes the sheet fill the viewport so short screens
      // show no dead space (tall content still scrolls via scrollOnlyWhenNeeded).
      contentContainerStyle={{ flexGrow: 1, gap: 0, paddingBottom: 0, paddingHorizontal: 0, paddingTop: 0 }}
      overScrollMode="never"
      refreshable={false}
      safeAreaEdges={[]}
      scrollOnlyWhenNeeded
    >
      {/* Full-bleed brand band running edge-to-edge under the status bar. */}
      <AuthHero copy={heroCopy} />

      {/* Content sheet: overlaps the band with rounded corners and fills the
          rest of the screen. Fields flow from the top; each step pins its
          actions to the bottom via marginTop:"auto" inside this stretched column. */}
      <View
        style={{
          backgroundColor: colors.background,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          flexGrow: 1,
          marginTop: -AUTH_SHEET_OVERLAP,
          paddingBottom: insets.bottom + spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
        }}
      >
      <FadeInView index={1} style={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, gap: spacing.md }}>
          {/* Step heading inside the sheet (Swiggy-style "Enter your number"). */}
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }} selectable>
              {heroCopy.title}
            </Text>
            {heroCopy.subtitle ? (
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: "500", lineHeight: 20 }} selectable>
                {heroCopy.subtitle}
              </Text>
            ) : null}
          </View>

          {step === "entry" && mode === "login" ? (
            <LoginStep
              phone={loginPhone}
              onPhoneChange={setLoginPhone}
              pin={pin}
              onPinChange={setPin}
              busy={busy}
              onLogin={() => void handleLogin()}
              onForgotPin={() => {
                setStep("resetRequest");
                setMessage(null);
                setOtp("");
                setNewPin("");
                setConfirmPin("");
              }}
              onEmailLogin={() => {
                setStep("emailLogin");
                setOtp("");
                setEmailLoginOtpRequested(false);
              }}
              onGoToSignup={goToSignup}
            />
          ) : null}

          {step === "entry" && mode === "signup" ? (
            <SignupStep
              phone={signupPhone}
              onPhoneChange={setSignupPhone}
              email={signupEmail}
              onEmailChange={setSignupEmail}
              fullName={fullName}
              onFullNameChange={setFullName}
              busy={busy}
              onRegister={() => void handleRegister()}
              onGoToLogin={goToLogin}
            />
          ) : null}

          {step === "emailLogin" ? (
            <EmailLoginStep
              email={loginEmail}
              onEmailChange={setLoginEmail}
              otp={otp}
              onOtpChange={setOtp}
              otpRequested={emailLoginOtpRequested}
              busy={busy}
              onRequestOtp={() => void handleEmailLoginRequest()}
              onConfirm={() => void handleEmailLoginConfirm()}
              onBackToLogin={goToLogin}
            />
          ) : null}

          {step === "setupOtp" ? (
            <SetupOtpStep
              phone={signupPhone}
              otp={otp}
              onOtpChange={setOtp}
              cooldownSeconds={otpCooldownSeconds}
              resendBusy={requestOtpState.isLoading}
              verifyBusy={verifyOtpState.isLoading}
              onResendOtp={() => void handleRequestSetupOtp()}
              onVerifyOtp={() => void handleVerifySetupOtp()}
              onEditPhone={goToSignup}
            />
          ) : null}

          {step === "setupPin" ? (
            <SetupPinStep
              newPin={newPin}
              onNewPinChange={setNewPin}
              confirmPin={confirmPin}
              onConfirmPinChange={setConfirmPin}
              busy={setPinState.isLoading}
              onSetPin={() => void handleSetPin()}
            />
          ) : null}

          {step === "resetRequest" ? (
            <ResetRequestStep
              phone={resetPhone}
              onPhoneChange={setResetPhone}
              busy={busy}
              onRequestOtp={() => void handleRequestResetOtp()}
              onBackToLogin={goToLogin}
            />
          ) : null}

          {step === "resetOtp" ? (
            <ResetOtpStep
              phone={resetPhone}
              otp={otp}
              onOtpChange={setOtp}
              cooldownSeconds={otpCooldownSeconds}
              busy={busy}
              onResendOtp={() => void handleRequestResetOtp()}
              onVerifyOtp={() => void handleVerifyResetOtp()}
              onEditPhone={() => {
                setStep("resetRequest");
                resetTransientState();
              }}
              onBackToLogin={goToLogin}
            />
          ) : null}

          {step === "resetPin" ? (
            <ResetPinStep
              newPin={newPin}
              onNewPinChange={setNewPin}
              confirmPin={confirmPin}
              onConfirmPinChange={setConfirmPin}
              busy={busy}
              onResetPin={() => void handleResetPin()}
              onBackToLogin={goToLogin}
            />
          ) : null}
        </View>
      </FadeInView>

      <View style={{ alignItems: "center", marginTop: spacing.sm }}>
        <LinkButton label={showDev ? "Hide developer options" : "Developer options"} onPress={() => setShowDev((value) => !value)} center muted />
      </View>

      {showDev ? (
        <AuthCard tone="sunken">
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Server color={colors.kicker} size={16} strokeWidth={2.2} />
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Developer / backend
            </Text>
          </View>
          <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
            Auto-detected from the Expo dev server. Override only if your backend runs elsewhere.
          </Text>
          <AuthTextField
            label="API base URL"
            value={apiBaseUrl}
            onChangeText={(value) => dispatch(setApiBaseUrl(value))}
            placeholder="http://192.168.1.10:8080"
            icon={Server}
          />
          <PrimaryButton label="Use detected URL" onPress={() => dispatch(resetApiBaseUrl())} muted />
        </AuthCard>
      ) : null}
      </View>
    </ScreenScrollView>
  );
}
