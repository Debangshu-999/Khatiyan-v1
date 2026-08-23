import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Info, X } from "lucide-react-native";

import { SessionLimitModal } from "@/features/auth/session-limit-modal";

import { AnimatedPressable } from "@/components/animated-pressable";
import { saveSession } from "@/auth/session-storage";
import { FadeInView } from "@/components/fade-in-view";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { loadThemeModeForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { AUTH_SHEET_OVERLAP, AuthHero, authHeroCopy, type AuthMode, type AuthStep } from "@/features/auth/auth-hero";
import {
  AuthAlertModal,
  AuthBackground,
  AuthCard,
  AuthTextField,
  errorBody,
  errorCode,
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
import { ActivateStep } from "@/features/auth/steps/activate-step";
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
  type UserSession,
  useRegisterOwnerMutation,
  useRegisterUserMutation,
  useRequestEmailLoginMutation,
  useRequestOtpMutation,
  useRequestPinResetMutation,
  useSetPinMutation,
  useVerifyOtpMutation,
  type TokenResponse,
} from "@/store/services/auth-api";
import { setThemeMode } from "@/store/slices/app-config-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** How long a validation line stays under its field before clearing itself. */
const FIELD_ERROR_TIMEOUT_MS = 3000;

/** Every input on the auth flow that can carry its own validation line. */
type AuthField = "phone" | "pin" | "otp" | "email" | "fullName" | "newPin" | "confirmPin";

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
  const auth = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("entry");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [emailLoginOtpRequested, setEmailLoginOtpRequested] = useState(false);
  const [signupPhone, setSignupPhone] = useState("");
  // setupOtp/setupPin are shared by signup and activation, so the "edit phone"
  // pencil has to know which door the person came through — sending an
  // activating tenant to Create account strands them on a form that will refuse
  // them, because their account already exists.
  const [setupOrigin, setSetupOrigin] = useState<"signup" | "activate">("signup");
  const [signupEmail, setSignupEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otpRequestedAt, setOtpRequestedAt] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  const [loginWithPin, loginState] = useLoginWithPinMutation();
  // Set when the account is at its device cap. Holds the PIN so "sign out other
  // devices" can complete the sign-in it interrupted.
  const [sessionLimit, setSessionLimit] = useState<
    { message: string; pin: string; sessions: UserSession[] } | null
  >(null);
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
        toast.show(value);
      }
    },
    [toast],
  );

  /**
   * Errors split two ways, by whether the reader can act on the field.
   *
   * <p>Shape problems — empty, too short, mismatched — go under the input in
   * red and clear themselves, because the fix is right there and the field is
   * what you are looking at. Refusals from the server — wrong PIN, wrong OTP,
   * locked out — go to a modal with an OK, because they end the attempt and a
   * toast that slides away leaves someone who glanced at the keypad with no
   * idea why nothing happened.
   */
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({});
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const fieldErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFieldErrors = useCallback((errors: Partial<Record<AuthField, string>>) => {
    setFieldErrors(errors);
    if (fieldErrorTimer.current) {
      clearTimeout(fieldErrorTimer.current);
    }
    fieldErrorTimer.current = setTimeout(() => setFieldErrors({}), FIELD_ERROR_TIMEOUT_MS);
  }, []);

  const clearFieldErrors = useCallback(() => {
    if (fieldErrorTimer.current) {
      clearTimeout(fieldErrorTimer.current);
    }
    setFieldErrors({});
  }, []);

  // The timer outlives the screen if a validation error is showing when the
  // person signs in, and firing setState after unmount is a warning at best.
  useEffect(() => () => {
    if (fieldErrorTimer.current) {
      clearTimeout(fieldErrorTimer.current);
    }
  }, []);

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

  /**
   * Establishes the session after any successful authentication.
   *
   * <p>
   * Everything here runs AFTER the server has already accepted the credentials,
   * so nothing in it may report an authentication failure. It used to: the
   * caller wrapped this and the network call in one try, and
   * {@code errorMessage} ends by returning {@code error.message} for a plain
   * Error — so a storage hiccup or a missing field surfaced as a raw JS
   * TypeError in the login toast, on a login that had in fact succeeded.
   * Retrying then "worked", because the transient failure did not recur.
   *
   * <p>
   * Two rules follow. The session is written before anything that can throw, so
   * a later failure cannot leave the person authenticated-but-not-persisted.
   * And the cosmetic extras are best-effort: a theme that would not load is not
   * a reason to bounce someone back to the login screen.
   */
  async function persistTokenSession(response: TokenResponse) {
    const firstName = response.user?.fullName?.trim().split(/\s+/)[0];
    // Fired here so the toast survives the redirect and greets the user on Home.
    toast.success(firstName ? `Welcome back, ${firstName}!` : "Welcome back!");

    const session = {
      accessToken: response.accessToken,
      user: response.user,
    };

    dispatch(setSession(session));
    await saveSession(session);

    try {
      dispatch(clearActiveAccount());
      dispatch(setPinnedOwnerModules([]));
      await saveActiveAccount(null);
      const savedThemeMode = response.user?.id ? await loadThemeModeForUser(response.user.id) : undefined;
      dispatch(setThemeMode(savedThemeMode ?? "light"));
    } catch (error) {
      console.warn("Post-login setup failed; continuing with the session", error);
    }

    router.replace("/account-select");
  }

  function validatePhone(value: string) {
    if (!value.trim()) {
      showFieldErrors({ phone: "Enter your phone number." });
      return false;
    }
    if (!isValidPhone(value)) {
      showFieldErrors({ phone: "Enter a valid 10 digit phone number." });
      return false;
    }
    return true;
  }

  function validatePinPair() {
    if (!newPin.trim()) {
      showFieldErrors({ newPin: "Enter a PIN." });
      return false;
    }
    if (!isValidPin(newPin)) {
      showFieldErrors({ newPin: "PIN must be exactly 6 digits." });
      return false;
    }
    if (newPin !== confirmPin) {
      showFieldErrors({ confirmPin: "Both PIN entries must match." });
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
    clearFieldErrors();
    if (!validatePhone(loginPhone)) {
      return;
    }
    if (!pin.trim()) {
      showFieldErrors({ pin: "Enter your PIN." });
      return;
    }
    if (!isValidPin(pin)) {
      showFieldErrors({ pin: "PIN must be exactly 6 digits." });
      return;
    }

    await attemptPinLogin(pin);
  }

  /**
   * One PIN sign-in attempt.
   *
   * <p>{@code signOutOthers} is the second pass, taken only after someone has
   * been told they are at the device cap and chosen to make room. The PIN is
   * sent again rather than the first attempt being held open: the server
   * verifies credentials on the same call that does the revoking, so nothing is
   * signed out on the strength of a request that was already refused.
   */
  async function attemptPinLogin(pin: string, signOutSessionId?: string) {
    try {
      const response = await loginWithPin({ phone: loginPhone, pin, signOutSessionId }).unwrap();
      setSessionLimit(null);
      await persistTokenSession(response);
    } catch (error) {
      if (errorCode(error) === "SESSION_LIMIT_REACHED") {
        // A warning, not an error: nothing is wrong and the PIN was right —
        // there is simply a decision to make about which device to end. The PIN
        // is held so the retry does not ask for it a second time, and the
        // devices come from the refusal because the sessions endpoint is closed
        // to someone who is not signed in yet.
        const sessions = (errorBody(error)?.sessions ?? []) as UserSession[];
        setSessionLimit({ message: errorMessage(error), pin, sessions });
        return;
      }
      setSessionLimit(null);
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleRegister() {
    clearFieldErrors();
    if (!validatePhone(signupPhone)) {
      return;
    }
    // Recovery email is optional now that every account starts role-less (the
    // owner/tenant choice moves to the post-login landing); a typed value must
    // still be a valid email.
    if (signupEmail.trim() && !isValidEmail(signupEmail)) {
      showFieldErrors({ email: "Enter a valid recovery email, or leave it blank." });
      return;
    }
    if (!fullName.trim()) {
      showFieldErrors({ fullName: "Enter your full name." });
      return;
    }

    try {
      await registerUser({ phone: signupPhone, email: signupEmail.trim(), fullName: fullName.trim() }).unwrap();

      setOtp("");
      setNewPin("");
      setConfirmPin("");
      setSetupOrigin("signup");
      startOtpCooldown();
      setStep("setupOtp");
      setMessage("Account created. Setup OTP requested.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  /**
   * Activation for an account an owner created.
   *
   * <p>
   * Onboarding a tenant or assigning a manager provisions a user with a phone
   * but NO PIN and an unverified phone. Signing up is refused (the account
   * exists) and signing in is refused too — and worse, the login error is the
   * deliberately vague "Invalid phone or PIN", so the person is told their
   * credentials are wrong when the truth is they never had any. That message is
   * intentionally vague and should stay that way (it stops anyone probing which
   * numbers hold accounts), so the way out has to be an explicit door rather
   * than a better error.
   *
   * <p>
   * No new endpoint is needed: a LOGIN-purpose OTP followed by {@code pin/set}
   * is exactly what the signup flow does after registering, and {@code setPIN}
   * already refuses anyone who has a PIN. So this reuses the existing
   * setupOtp → setupPin steps and simply skips registration.
   */
  async function handleActivateAccount() {
    clearFieldErrors();
    if (!validatePhone(signupPhone)) {
      return;
    }

    try {
      await requestOtp({ phone: signupPhone, purpose: "LOGIN", channel: "SMS_AND_EMAIL" }).unwrap();
      setOtp("");
      setNewPin("");
      setConfirmPin("");
      setSetupOrigin("activate");
      startOtpCooldown();
      setStep("setupOtp");
      setMessage("If that number is waiting to be set up, we've sent it a code.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleRequestSetupOtp() {
    clearFieldErrors();
    if (!validatePhone(signupPhone)) {
      return;
    }

    try {
      await requestOtp({ phone: signupPhone, purpose: "LOGIN", channel: "SMS_AND_EMAIL" }).unwrap();
      startOtpCooldown();
      setMessage("PIN setup OTP requested.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleVerifySetupOtp() {
    clearFieldErrors();
    if (otp.length !== 6) {
      showFieldErrors({ otp: otp.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }

    try {
      await verifyOtp({ phone: signupPhone, otp, purpose: "LOGIN" }).unwrap();
      setNewPin("");
      setConfirmPin("");
      setStep("setupPin");
      setMessage("OTP verified. Choose your PIN.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleSetPin() {
    clearFieldErrors();
    if (otp.length !== 6) {
      showFieldErrors({ otp: otp.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }
    if (!validatePinPair()) {
      return;
    }

    try {
      const response = await setPinMutation({ phone: signupPhone, otp, pin: newPin }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleRequestResetOtp() {
    clearFieldErrors();
    if (!validatePhone(resetPhone)) {
      return;
    }

    try {
      await requestPinReset({ phone: resetPhone, channel: "SMS" }).unwrap();
      setOtp("");
      startOtpCooldown();
      setStep("resetOtp");
      setMessage("If that number has an account, we've sent it a reset code.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleVerifyResetOtp() {
    clearFieldErrors();
    if (otp.length !== 6) {
      showFieldErrors({ otp: otp.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }

    try {
      await verifyOtp({ phone: resetPhone, otp, purpose: "PIN_RESET" }).unwrap();
      setNewPin("");
      setConfirmPin("");
      setStep("resetPin");
      setMessage("OTP verified. Choose a new PIN.");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleResetPin() {
    clearFieldErrors();
    if (otp.length !== 6) {
      showFieldErrors({ otp: otp.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }
    if (!validatePinPair()) {
      return;
    }

    try {
      const response = await confirmPinReset({ phone: resetPhone, otp, newPin }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleEmailLoginRequest() {
    clearFieldErrors();
    if (!loginEmail.trim()) {
      showFieldErrors({ email: "Enter your email address." });
      return;
    }
    if (!isValidEmail(loginEmail)) {
      showFieldErrors({ email: "Enter a valid verified email address." });
      return;
    }
    try {
      await requestEmailLogin({ email: loginEmail.trim() }).unwrap();
      setOtp("");
      setEmailLoginOtpRequested(true);
      startOtpCooldown();
      toast.show("Email OTP sent. Check your verified email.", "info");
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleEmailLoginConfirm() {
    clearFieldErrors();
    if (otp.length !== 6) {
      showFieldErrors({ otp: otp.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }
    try {
      const response = await confirmEmailLogin({ email: loginEmail.trim(), otp }).unwrap();
      await persistTokenSession(response);
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  function resetTransientState() {
    clearFieldErrors();
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

  /** Opens the provisioned-account door. Seeds the number already typed. */
  function goToActivate() {
    setMode("login");
    setStep("activate");
    resetTransientState();
    // signupPhone is what setupOtp/setupPin read, so activation binds to it too
    // rather than adding a fourth phone field that means the same thing.
    setSignupPhone(loginPhone);
  }

  /** Pencil target for activation. Keeps the number so they can correct it. */
  function backToActivate() {
    setStep("activate");
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setOtpRequestedAt(null);
  }

  function goToSignup() {
    setMode("signup");
    setStep("entry");
    resetTransientState();
  }

  const heroCopy = authHeroCopy(step, mode, { resetPhone, signupPhone });
  const [activateInfoOpen, setActivateInfoOpen] = useState(false);

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

      {alertMessage ? (
        <AuthAlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />
      ) : null}

      {sessionLimit ? (
        <SessionLimitModal
          busy={loginState.isLoading}
          message={sessionLimit.message}
          onCancel={() => setSessionLimit(null)}
          onSignOut={(session) => void attemptPinLogin(sessionLimit.pin, session.id)}
          sessions={sessionLimit.sessions}
        />
      ) : null}

      {activateInfoOpen ? (
        <Modal animationType="fade" onRequestClose={() => setActivateInfoOpen(false)} transparent visible>
          <Pressable
            onPress={() => setActivateInfoOpen(false)}
            style={{
              alignItems: "center",
              backgroundColor: colors.overlay,
              flex: 1,
              justifyContent: "center",
              padding: spacing.lg,
            }}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 18,
                borderWidth: 1,
                gap: spacing.sm,
                padding: spacing.lg,
                width: "100%",
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>Why set a PIN?</Text>
                <Pressable accessibilityLabel="Close" hitSlop={8} onPress={() => setActivateInfoOpen(false)}>
                  <X color={colors.ink} size={18} strokeWidth={2.2} />
                </Pressable>
              </View>
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 }}>
                If your property owner added you as a tenant or a manager, your account already exists — it just has no
                PIN yet.
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 }}>
                That is why signing up says the account is taken, and signing in says the details are wrong. Confirm the
                number they registered and we will text you a code to set one.
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

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
            {/* Display face, not the serif: a step heading inside the sheet is a
                working label, not a brand moment. The serif stays on the wordmark
                and the screen headers. */}
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5 }}>
                {heroCopy.title}
              </Text>
              {/* Only the provisioned door needs explaining, and only to someone
                  confused about why the other two doors refused them. Beside the
                  heading, not above the field, so the form stays a form. */}
              {step === "activate" ? (
                <AnimatedPressable
                  accessibilityLabel="Why am I setting a PIN?"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setActivateInfoOpen(true)}
                  style={{
                    alignItems: "center",
                    height: 28,
                    justifyContent: "center",
                    width: 28,
                  }}
                >
                  {/* A couple of px down: the display face sits high in its line
                      box, so an optically centred icon has to follow it. */}
                  <Info color={colors.kicker} size={17} strokeWidth={2.2} style={{ marginTop: 3 }} />
                </AnimatedPressable>
              ) : null}
            </View>
            {heroCopy.subtitle ? (
              <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 }}>
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
                clearFieldErrors();
                setOtp("");
                setNewPin("");
                setConfirmPin("");
              }}
              onActivateAccount={() => goToActivate()}
              onEmailLogin={() => {
                setStep("emailLogin");
                setOtp("");
                setEmailLoginOtpRequested(false);
              }}
              phoneError={fieldErrors.phone}
              pinError={fieldErrors.pin}
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
              phoneError={fieldErrors.phone}
              emailError={fieldErrors.email}
              fullNameError={fieldErrors.fullName}
              onGoToLogin={goToLogin}
            />
          ) : null}

          {step === "activate" ? (
            <ActivateStep
              phone={signupPhone}
              onPhoneChange={setSignupPhone}
              busy={busy}
              onSendCode={() => void handleActivateAccount()}
              phoneError={fieldErrors.phone}
              onBackToLogin={goToLogin}
            />
          ) : null}

          {/* `busy` here is the step's OWN call, not the screen-wide flag: that
              one ORs every mutation, so resending a code spun the sign-in
              button as well. */}
          {step === "emailLogin" ? (
            <EmailLoginStep
              email={loginEmail}
              onEmailChange={setLoginEmail}
              otp={otp}
              onOtpChange={setOtp}
              otpRequested={emailLoginOtpRequested}
              cooldownSeconds={otpCooldownSeconds}
              resendBusy={requestEmailLoginState.isLoading}
              busy={emailLoginOtpRequested ? confirmEmailLoginState.isLoading : requestEmailLoginState.isLoading}
              onRequestOtp={() => void handleEmailLoginRequest()}
              onConfirm={() => void handleEmailLoginConfirm()}
              emailError={fieldErrors.email}
              otpError={fieldErrors.otp}
              onEditEmail={() => {
                // Back to the address step. The cooldown deliberately keeps
                // running: it mirrors a server-side limit that does not reset
                // because the reader changed their mind.
                setEmailLoginOtpRequested(false);
                setOtp("");
                clearFieldErrors();
              }}
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
              onEditPhone={setupOrigin === "activate" ? backToActivate : goToSignup}
              otpError={fieldErrors.otp}
              onBackToLogin={goToLogin}
              activating={setupOrigin === "activate"}
            />
          ) : null}

          {step === "setupPin" ? (
            <SetupPinStep
              newPin={newPin}
              onNewPinChange={setNewPin}
              confirmPin={confirmPin}
              onConfirmPinChange={setConfirmPin}
              busy={setPinState.isLoading}
              newPinError={fieldErrors.newPin}
              confirmPinError={fieldErrors.confirmPin}
              onSetPin={() => void handleSetPin()}
            />
          ) : null}

          {step === "resetRequest" ? (
            <ResetRequestStep
              phone={resetPhone}
              onPhoneChange={setResetPhone}
              busy={busy}
              phoneError={fieldErrors.phone}
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
              otpError={fieldErrors.otp}
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
              newPinError={fieldErrors.newPin}
              confirmPinError={fieldErrors.confirmPin}
              onResetPin={() => void handleResetPin()}
              onBackToLogin={goToLogin}
            />
          ) : null}
        </View>
      </FadeInView>

      </View>
    </ScreenScrollView>
  );
}
