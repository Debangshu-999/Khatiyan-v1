import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { retryAfterSeconds } from "@/features/forms/server-error";
import { useRouter } from "expo-router";
import { BackHandler, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Info, X } from "lucide-react-native";

import { emailProblem } from "@/features/forms/email-validation";
import { SessionLimitModal } from "@/features/auth/session-limit-modal";

import { AnimatedPressable } from "@/components/animated-pressable";
import { saveSession } from "@/auth/session-storage";
import { FadeInView } from "@/components/fade-in-view";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { loadThemeModeForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { AUTH_SHEET_OVERLAP, AuthHero, authHeroCopy, type AuthMode, type AuthStep } from "@/features/auth/auth-hero";
import { LinearGradient } from "expo-linear-gradient";
import { queueWelcome } from "@/features/auth/pending-welcome";
import {
  AuthAlertModal,
  AuthBackground,
  AuthCard,
  AuthTextField,
  errorBody,
  errorCode,
  errorMessage,
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
  useOtpWaitMutation,
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
/** What a send pressed too soon, or refused for it, says (user, 2026-11-14). */
const TOO_MANY_OTP_REQUESTS = "Too many OTP requests. Try again after some time.";

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
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("entry");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [emailLoginOtpRequested, setEmailLoginOtpRequested] = useState(false);
  const [signupPhone, setSignupPhone] = useState("");
  // The provisioned-account door's own number. It shared signupPhone, so a
  // number typed on Create account showed up already filled in here
  // (user, 2026-10-02): every door keeps its own field.
  const [activatePhone, setActivatePhone] = useState("");
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
  // When the next code may be sent, from the server's database (user,
  // 2026-11-14): asked on every screen that sends one, and again after each send
  // or refusal. Never worked out on the device.
  const [otpWaitUntil, setOtpWaitUntil] = useState(0);
  const [otpWaitAsk, setOtpWaitAsk] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  const [loginWithPin, loginState] = useLoginWithPinMutation();
  const [otpWait] = useOtpWaitMutation();
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

  // No toasts on the auth screens (user, 2026-11-14): the only one left is the
  // welcome after signing in, shown on the next screen. The screen's message
  // calls stay, and say nothing.
  const setMessage = useCallback((_value: string | null) => {}, []);

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
    if (otpWaitUntil <= Date.now()) {
      return;
    }
    setCurrentTimeMs(Date.now());
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [otpWaitUntil]);

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

  /** The number the setup steps act on: whichever door opened them. */
  const setupPhone = setupOrigin === "activate" ? activatePhone : signupPhone;

  const otpCooldownSeconds = otpWaitUntil > currentTimeMs ? Math.ceil((otpWaitUntil - currentTimeMs) / 1000) : 0;

  // Which number or address the current screen would send a code to, once it is
  // complete enough to ask about.
  const otpTarget = useMemo((): { email?: string; phone?: string; purpose: "LOGIN" | "PIN_RESET" | "EMAIL_LOGIN" } | null => {
    if (step === "emailLogin") {
      const email = loginEmail.trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email, purpose: "EMAIL_LOGIN" } : null;
    }
    const phone = step === "resetRequest" || step === "resetOtp" ? resetPhone : step === "activate" ? activatePhone : step === "setupOtp" ? setupPhone : "";
    if (!isValidPhone(phone)) return null;
    return { phone, purpose: step === "resetRequest" || step === "resetOtp" ? "PIN_RESET" : "LOGIN" };
  }, [activatePhone, loginEmail, resetPhone, setupPhone, step]);
  const otpTargetKey = otpTarget ? `${otpTarget.purpose}:${otpTarget.phone ?? otpTarget.email}` : "";

  // Ask the server for the wait whenever the target changes, and after every send.
  useEffect(() => {
    if (!otpTarget) {
      setOtpWaitUntil(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void otpWait(otpTarget)
        .unwrap()
        .then((answer) => {
          if (!cancelled) setOtpWaitUntil(answer.retryAfterSeconds > 0 ? Date.now() + answer.retryAfterSeconds * 1000 : 0);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The target object is rebuilt each render; its key is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpTargetKey, otpWaitAsk]);

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
   * Three rules follow. The cosmetic extras are best-effort: a theme that would
   * not load is not a reason to bounce someone back to the login screen, so they
   * sit in their own try and cannot stop the session being saved.
   *
   * <p>
   * The resets run BEFORE the session is set, never after. Setting the session
   * is what starts everything downstream: this screen's redirect, the account
   * check, and account select choosing the only account and opening Home. With
   * the resets after it, `clearActiveAccount()` landed once Home was already up
   * and wiped the account account select had just chosen. Home dropped back to
   * the loading screen, then played its entrance again with the welcome toast.
   *
   * <p>
   * Navigation is left to the redirect effect above, which fires the moment the
   * session exists. A second `router.replace` here could land after it and play
   * the transition twice.
   */
  async function persistTokenSession(response: TokenResponse) {
    const firstName = response.user?.fullName?.trim().split(/\s+/)[0];
    // Queued, not shown: Home shows it once it is on screen. Shown here it landed
    // over the loading screen, before Home had appeared.
    queueWelcome(firstName ? `Welcome back, ${firstName}!` : "Welcome back!");

    try {
      dispatch(clearActiveAccount());
      dispatch(setPinnedOwnerModules([]));
      await saveActiveAccount(null);
      const savedThemeMode = response.user?.id ? await loadThemeModeForUser(response.user.id) : undefined;
      dispatch(setThemeMode(savedThemeMode ?? "light"));
    } catch (error) {
      console.warn("Post-login setup failed; continuing with the session", error);
    }

    const session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    };

    dispatch(setSession(session));
    await saveSession(session);
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

  /** After a code goes out: ask the server for the new wait. */
  function startOtpCooldown() {
    setOtpWaitAsk((ask) => ask + 1);
  }

  /**
   * A refusal for coming too soon carries the server's wait: the Resend countdown
   * takes it, and the person is told in the error popup (user, 2026-11-14).
   * Returns true when it was that refusal.
   */
  function noteOtpRefusal(error: unknown) {
    const wait = retryAfterSeconds(error);
    if (wait > 0) {
      setCurrentTimeMs(Date.now());
      setOtpWaitUntil(Date.now() + wait * 1000);
      setAlertMessage(TOO_MANY_OTP_REQUESTS);
      return true;
    }
    return false;
  }

  /**
   * The send buttons have no timer and stay pressable (user, 2026-11-14). Pressed
   * while the server's wait is still running, they open the error popup instead
   * of sending. Returns true when the press was stopped.
   */
  function blockedByOtpWait() {
    if (otpCooldownSeconds > 0) {
      setAlertMessage(TOO_MANY_OTP_REQUESTS);
      return true;
    }
    return false;
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
  async function attemptPinLogin(pin: string, signOutSessionId?: string, signOutAll = false) {
    try {
      const response = await loginWithPin({ phone: loginPhone, pin, signOutAll, signOutSessionId }).unwrap();
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
    const signupEmailIssue = emailProblem(signupEmail, null);
    if (signupEmailIssue) {
      showFieldErrors({ email: signupEmailIssue });
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
      if (!noteOtpRefusal(error)) {
        setAlertMessage(errorMessage(error));
      }
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
    if (!validatePhone(activatePhone)) {
      return;
    }
    if (blockedByOtpWait()) {
      return;
    }

    try {
      await requestOtp({ phone: activatePhone, purpose: "LOGIN", channel: "SMS_AND_EMAIL" }).unwrap();
      setOtp("");
      setNewPin("");
      setConfirmPin("");
      setSetupOrigin("activate");
      startOtpCooldown();
      setStep("setupOtp");
      setMessage("If that number is waiting to be set up, we've sent it a code.");
    } catch (error) {
      if (!noteOtpRefusal(error)) {
        setAlertMessage(errorMessage(error));
      }
    }
  }

  async function handleRequestSetupOtp() {
    clearFieldErrors();
    if (!validatePhone(setupPhone)) {
      return;
    }

    try {
      await requestOtp({ phone: setupPhone, purpose: "LOGIN", channel: "SMS_AND_EMAIL" }).unwrap();
      startOtpCooldown();
      setMessage("PIN setup OTP requested.");
    } catch (error) {
      if (!noteOtpRefusal(error)) {
        setAlertMessage(errorMessage(error));
      }
    }
  }

  /**
   * Takes the code directly: the six-box entry verifies on its sixth digit,
   * before the state update carrying that digit has rendered.
   */
  async function handleVerifySetupOtp(code: string = otp) {
    if (verifyOtpState.isLoading) {
      return;
    }
    clearFieldErrors();
    if (code.length !== 6) {
      showFieldErrors({ otp: code.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }

    try {
      await verifyOtp({ phone: setupPhone, otp: code, purpose: "LOGIN" }).unwrap();
      setNewPin("");
      setConfirmPin("");
      setStep("setupPin");
      setMessage("OTP verified. Choose your PIN.");
    } catch (error) {
      // Empty the boxes for the next attempt, as the wallet PIN sheet does.
      setOtp("");
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
      // The name and email ride along with the PIN rather than being written at
      // registration. Sent only from the signup door: someone arriving through
      // the provisioned-account door typed neither, and blank values must not
      // overwrite what the property owner recorded.
      const response = await setPinMutation({
        phone: setupPhone,
        otp,
        pin: newPin,
        ...(setupOrigin === "signup"
          ? { email: signupEmail.trim() || undefined, fullName: fullName.trim() || undefined }
          : {}),
      }).unwrap();
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
    if (blockedByOtpWait()) {
      return;
    }

    try {
      await requestPinReset({ phone: resetPhone, channel: "SMS" }).unwrap();
      setOtp("");
      startOtpCooldown();
      setStep("resetOtp");
      setMessage("If that number has an account, we've sent it a reset code.");
    } catch (error) {
      if (!noteOtpRefusal(error)) {
        setAlertMessage(errorMessage(error));
      }
    }
  }

  async function handleVerifyResetOtp(code: string = otp) {
    if (verifyOtpState.isLoading) {
      return;
    }
    clearFieldErrors();
    if (code.length !== 6) {
      showFieldErrors({ otp: code.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }

    try {
      await verifyOtp({ phone: resetPhone, otp: code, purpose: "PIN_RESET" }).unwrap();
      setNewPin("");
      setConfirmPin("");
      setStep("resetPin");
      setMessage("OTP verified. Choose a new PIN.");
    } catch (error) {
      setOtp("");
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
      // The reset no longer signs in (user, 2026-10-02): the session it returns
      // is dropped and the person signs in with the new PIN, which also proves
      // they remember it.
      await confirmPinReset({ phone: resetPhone, otp, newPin }).unwrap();
      goToLogin();
    } catch (error) {
      setAlertMessage(errorMessage(error));
    }
  }

  async function handleEmailLoginRequest() {
    clearFieldErrors();
    const loginEmailIssue = emailProblem(loginEmail, "Enter your email address.");
    if (loginEmailIssue) {
      showFieldErrors({ email: loginEmailIssue });
      return;
    }
    if (blockedByOtpWait()) {
      return;
    }
    try {
      await requestEmailLogin({ email: loginEmail.trim() }).unwrap();
      setOtp("");
      setEmailLoginOtpRequested(true);
      startOtpCooldown();
    } catch (error) {
      if (!noteOtpRefusal(error)) {
        setAlertMessage(errorMessage(error));
      }
    }
  }

  async function handleEmailLoginConfirm(code?: string) {
    clearFieldErrors();
    // The boxes hand over the code as the sixth digit lands, before state has caught up.
    const entered = code ?? otp;
    if (entered.length !== 6) {
      showFieldErrors({ otp: entered.trim() ? "Enter all 6 digits." : "Enter the code we sent you." });
      return;
    }
    try {
      const response = await confirmEmailLogin({ email: loginEmail.trim(), otp: entered }).unwrap();
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
    setOtpWaitUntil(0);
  }

  /**
   * Empties every field on the flow (user, 2026-10-02). No input carries a
   * value into another door: leaving a screen, or backing out of a
   * process, starts the next one blank. The one exception is the OTP screen's
   * edit-phone pencil, whose whole point is to correct the number it kept.
   */
  function clearAllInputs() {
    resetTransientState();
    setLoginPhone("");
    setPin("");
    setLoginEmail("");
    setEmailLoginOtpRequested(false);
    setSignupPhone("");
    setSignupEmail("");
    setFullName("");
    setActivatePhone("");
    setResetPhone("");
  }

  function goToLogin() {
    setMode("login");
    setStep("entry");
    clearAllInputs();
  }

  /**
   * Opens the provisioned-account door, with an empty phone field.
   *
   * <p>It used to be seeded with whatever the login field held (owner's call,
   * 2026-09-27: it should not be). A number typed to sign in is not a claim
   * that the account was provisioned, and finding it already filled in on a
   * different door read as the app deciding for them.
   */
  function goToActivate() {
    setMode("login");
    setStep("activate");
    clearAllInputs();
  }

  /** Pencil target for activation. Keeps the number so they can correct it. */
  function backToActivate() {
    setStep("activate");
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setOtpWaitUntil(0);
  }

  function goToSignup() {
    setMode("signup");
    setStep("entry");
    clearAllInputs();
  }

  /** Pencil target for signup: back to the form with what was typed intact. */
  function backToSignup() {
    setMode("signup");
    setStep("entry");
    resetTransientState();
  }

  /**
   * The device back button.
   *
   * <p>
   * This screen is eight steps behind one route, so the navigator has nothing to
   * pop — without this, back left the app entirely.
   *
   * <p>
   * <b>Blocked inside the two-step processes</b> (user, 2026-10-02): the OTP
   * and PIN steps of signup, activation and PIN reset swallow the press. Their
   * "Back to login" control is the way out, and the OTP screen's edit-phone
   * pencil the way back, so a stray press never discards a verified code.
   * Elsewhere it returns to sign-in, clearing what was typed.
   *
   * <p>
   * Returning false on the sign-in screen hands back to the system, which is the
   * only step where leaving is the right answer. A visible Modal takes the press
   * before this ever sees it, so an open dialog still closes first.
   *
   * <p>
   * Android only in practice. {@code BackHandler} is a no-op on web, where the
   * browser's own back button is the thing that moves.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      switch (step) {
        case "entry":
          if (mode === "signup") {
            goToLogin();
            return true;
          }
          // Sign-in is the front door. Back from here leaves the app.
          return false;
        case "activate":
        case "emailLogin":
        case "resetRequest":
          goToLogin();
          return true;
        case "setupOtp":
        case "setupPin":
        case "resetOtp":
        case "resetPin":
          return true;
        default:
          return false;
      }
    });

    return () => subscription.remove();
    // The handler closes over the step it is answering for, so it is rebuilt
    // whenever that changes. The nav helpers are stable within a render and
    // deliberately left out — listing them would re-register on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step]);

  const heroCopy = authHeroCopy(step, mode, { resetPhone, signupPhone: setupPhone });
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
      <AuthHero copy={heroCopy} screen={`${step}:${mode}`} />

      {alertMessage ? (
        <AuthAlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />
      ) : null}

      {sessionLimit ? (
        <SessionLimitModal
          busy={loginState.isLoading}
          message={sessionLimit.message}
          onCancel={() => setSessionLimit(null)}
          onSignOut={(session) => void attemptPinLogin(sessionLimit.pin, session.id)}
          onSignOutAll={() => void attemptPinLogin(sessionLimit.pin, undefined, true)}
          sessions={sessionLimit.sessions}
        />
      ) : null}

      {activateInfoOpen ? (
        <InfoModal bottomUp onClose={() => setActivateInfoOpen(false)} title="How it works"><Text style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 20, color: colors.muted }}>
                If your property owner added you as a tenant or a manager, your account already exists — it just has no
                PIN yet.
              </Text>
<Text style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 20, color: colors.muted }}>
                That is why signing up says the account is taken, and signing in says the details are wrong. Confirm the
                number they registered and we will text you a code to set one.
              </Text></InfoModal>
      ) : null}

      {/* Content sheet: overlaps the band with rounded corners and fills the
          rest of the screen. Fields flow from the top; each step pins its
          actions to the bottom via marginTop:"auto" inside this stretched column. */}
      {/* The form sheet (user, 2026-11-14): a deep continuous curve over the picture,
          no grab handle, a tight top, and a wash of the theme's blue that deepens towards the
          bottom so the card reads as part of the app, not a white slab. */}
      <LinearGradient
        colors={[colors.authSurface, mixColor(colors.authSurface, colors.primary, 0.05), mixColor(colors.authSurface, colors.primary, 0.13)]}
        locations={[0, 0.45, 1]}
        style={{
          borderCurve: "continuous",
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          flexGrow: 1,
          marginTop: -AUTH_SHEET_OVERLAP,
          paddingBottom: insets.bottom + spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          shadowColor: "#0B1533",
          shadowOffset: { height: -6, width: 0 },
          shadowOpacity: 0.14,
          shadowRadius: 16,
        }}
      >
      <FadeInView index={1} style={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, gap: spacing.md }}>
          {/* The column gap centres two-step indicators between the description
              and the next line. Entry screens keep their field-label clearance. */}
          <View style={{ gap: 4, marginBottom: ["setupOtp", "setupPin", "resetOtp", "resetPin"].includes(step) ? 0 : spacing.lg }}>
            {/* Display face, not the serif: a step heading inside the sheet is a
                working label, not a brand moment. The serif stays on the wordmark
                and the screen headers. */}
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              {/* Two-tone (user, 2026-11-14): the title in the display face, its last
                  word in the serif italic and the theme's blue. Two Texts side by
                  side, not one nested in the other: Android measured the nested
                  italic in the outer face and cut the word off. */}
              <View style={{ alignItems: "baseline", flexDirection: "row", flexShrink: 1, flexWrap: "wrap" }}>
                {titleLead(heroCopy.title) ? (
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.6, lineHeight: 36 }}>
                    {titleLead(heroCopy.title)}
                  </Text>
                ) : null}
                <Text style={{ color: colors.primary, fontFamily: fonts.fancyItalic, fontSize: 29, lineHeight: 36, paddingRight: 4 }}>
                  {titleTail(heroCopy.title)}
                </Text>
              </View>
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
        <CircleHelp color={colors.kicker} size={17} strokeWidth={2.2} style={{ marginTop: 6 }} />
                </AnimatedPressable>
              ) : null}
            </View>
            {/* No line under the title (user, 2026-11-14): the band above already says it. */}
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
                clearAllInputs();
                setStep("resetRequest");
              }}
              onActivateAccount={() => goToActivate()}
              onEmailLogin={() => {
                clearAllInputs();
                setStep("emailLogin");
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
              phone={activatePhone}
              onPhoneChange={setActivatePhone}
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
              onConfirm={(code) => void handleEmailLoginConfirm(code)}
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
              phone={setupPhone}
              otp={otp}
              onOtpChange={setOtp}
              cooldownSeconds={otpCooldownSeconds}
              resendBusy={requestOtpState.isLoading}
              verifyBusy={verifyOtpState.isLoading}
              onResendOtp={() => void handleRequestSetupOtp()}
              onVerifyOtp={(code) => void handleVerifySetupOtp(code)}
              onEditPhone={setupOrigin === "activate" ? backToActivate : backToSignup}
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
              onBackToLogin={goToLogin}
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
              onVerifyOtp={(code) => void handleVerifyResetOtp(code)}
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

      </LinearGradient>
    </ScreenScrollView>
  );
}
import { CircleHelp } from "lucide-react-native";
import { InfoModal } from "@/components/info-modal";

/** `a` moved `t` of the way to `b` (both #RRGGBB): a solid tint, no see-through. */
function mixColor(a: string, b: string, t: number) {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [from, to] = [channels(a), channels(b)];
  return `#${from.map((c, k) => Math.round(c + (to[k] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Everything up to the title's last word, a space kept apart by the row's gap. */
function titleLead(title: string) {
  const cut = title.lastIndexOf(" ");
  return cut < 0 ? "" : `${title.slice(0, cut)} `;
}

/** The title's last word, drawn in the accent. */
function titleTail(title: string) {
  return title.slice(title.lastIndexOf(" ") + 1);
}
