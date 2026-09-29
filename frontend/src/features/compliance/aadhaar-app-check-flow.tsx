import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Text, View } from "react-native";
import { Settings, type LucideProps } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  isAadhaarAppInstalled,
  isDeveloperModeOn,
  openAadhaarApp,
  openAadhaarAppStore,
  openAadhaarSession,
  openDeveloperSettings,
} from "@/features/compliance/aadhaar-app";
import {
  CheckHeader,
  CheckResult,
  InstructionPoint,
  StepCaption,
  StepTitle,
  errorMessage,
} from "@/features/compliance/verification-flow-parts";
import { useGetProfileQuery } from "@/store/services/auth-api";
import {
  useCheckVerificationAttemptMutation,
  useStartAadhaarSessionMutation,
  type AadhaarSession,
  type VerificationAttempt,
  type VerificationGrant,
} from "@/store/services/verification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The Aadhaar App check, start to finish, in the card that opened it.
 *
 * <p>Opening a session charges the owner, so nothing billable happens until
 * the app has found the Aadhaar App on THIS phone (owner's rule, 2026-09-27:
 * never a second phone) and the tenant has said they are signed up in it. The
 * install step shows only when the Aadhaar App is missing.
 *
 * <p>Whether a session opened before signing up still works is untested with
 * Decentro. The signup step is here until that is known.
 *
 * <p><b>Developer options must be off.</b> The Aadhaar App refuses to run
 * while it is on (seen 2026-09-27), and a session opened then is charged and
 * wasted. So it is checked after the install check and again right before the
 * session opens (owner's decision, 2026-09-27).
 *
 * <p><b>Debug builds only:</b> a build without the native check (a dev client
 * built before the plugin, Expo Go) skips it with a visible note, so the DEV
 * provider can be exercised without a rebuild. A release build never skips:
 * there "cannot tell" stops the flow. The Developer options step still shows
 * in a debug build, with a "Continue anyway" so DEV testing over USB goes on.
 *
 * <p>Nothing goes backwards and reopening starts from the beginning, like the
 * OTP check. A tenant who reopens mid-session gets the same session back from
 * the server, not a second charge.
 */
type Stage =
  | "INSTRUCTIONS"
  | "CHECKING"
  | "INSTALL"
  | "UNSUPPORTED"
  | "DEV_OPTIONS"
  | "SIGNUP"
  | "WAITING"
  | "RESULT";

/** How often the result is asked for while the tenant is in the Aadhaar App and back. */
const POLL_MS = 4_000;

const GOOGLE_PLAY_ICON = require("../../../assets/icons/google-play.png");

/**
 * Found, or a debug build that cannot tell and skips the check. Release
 * builds are never let through on "cannot tell".
 */
function passesInstallCheck(installed: boolean | null) {
  return installed === true || (installed === null && __DEV__);
}

/** Google Play's own mark, in the button's icon slot. Keeps its colours on any button. */
function GooglePlayIcon({ size = 16 }: LucideProps) {
  const height = Number(size) + 2;
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      resizeMode="contain"
      source={GOOGLE_PLAY_ICON}
      style={{ flexShrink: 0, height, width: (height * 250) / 276 }}
    />
  );
}

export function AadhaarAppCheckFlow({
  grant,
  onClose,
  onVerified,
}: {
  grant: VerificationGrant;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { colors, type } = useTheme();
  const profileQuery = useGetProfileQuery();

  const [startSession, startState] = useStartAadhaarSessionMutation();
  const [checkAttempt] = useCheckVerificationAttemptMutation();

  const [stage, setStage] = useState<Stage>("INSTRUCTIONS");
  const [session, setSession] = useState<AadhaarSession | null>(null);
  const [attempt, setAttempt] = useState<VerificationAttempt | null>(null);
  // A refusal is the server, the provider or the phone saying no. Nothing on
  // this card fixes it, so it interrupts.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Debug build without the native check: said on screen, so a skipped check
  // is never mistaken for a passed one.
  const [checkSkipped, setCheckSkipped] = useState(false);
  // Debug builds only: the tester chose to go on with Developer options on.
  const [devOptionsWaived, setDevOptionsWaived] = useState(false);

  const attemptsLeft = attempt?.grant.attemptsRemaining ?? grant.attemptsRemaining;

  /**
   * Past the install check: the Developer options step when it is on, else
   * signup. A build that cannot tell goes on, since the install check has
   * already stopped a release build that lacks the native module.
   */
  const routeByDeveloperOptions = useCallback(async () => {
    const developerModeOn = await isDeveloperModeOn();
    setStage(developerModeOn === true && !devOptionsWaived ? "DEV_OPTIONS" : "SIGNUP");
  }, [devOptionsWaived]);

  /** Sends the tenant on when the Aadhaar App is here, to the install step when it is not. */
  const routeByInstall = useCallback(async () => {
    setStage("CHECKING");
    const installed = await isAadhaarAppInstalled();
    setCheckSkipped(installed === null && __DEV__);
    if (passesInstallCheck(installed)) {
      await routeByDeveloperOptions();
      return;
    }
    setStage(installed === false ? "INSTALL" : "UNSUPPORTED");
  }, [routeByDeveloperOptions]);

  async function recheckInstall() {
    if ((await isAadhaarAppInstalled()) === true) {
      await routeByDeveloperOptions();
      return;
    }
    setRefusal("The Aadhaar App is still not on this phone. Install it from the Play Store, then try again.");
  }

  async function recheckDeveloperOptions() {
    if ((await isDeveloperModeOn()) !== true) {
      setStage("SIGNUP");
      return;
    }
    setRefusal("Developer options is still on. Turn it off, then try again.");
  }

  async function openDeveloperOptions() {
    if (!(await openDeveloperSettings())) {
      setRefusal("Open Settings on this phone and turn off Developer options, then come back.");
    }
  }

  async function openForSignup() {
    if (checkSkipped) {
      setRefusal("This debug build cannot open the Aadhaar App. Rebuild the dev client to test it.");
      return;
    }
    if (!(await openAadhaarApp())) {
      // Uninstalled since the check, most likely. Say so rather than fail quietly.
      await routeByInstall();
    }
  }

  /** The billable step: opens the session and hands the tenant to the Aadhaar App. */
  async function verifyNow() {
    // Checked again right before spending: the tenant may have removed it.
    const installed = await isAadhaarAppInstalled();
    if (!passesInstallCheck(installed)) {
      setStage(installed === false ? "INSTALL" : "UNSUPPORTED");
      return;
    }
    // And Developer options, which may have been turned back on since.
    if ((await isDeveloperModeOn()) === true && !devOptionsWaived) {
      setStage("DEV_OPTIONS");
      return;
    }
    try {
      const opened = await startSession({ grantId: grant.id }).unwrap();
      setSession(opened);
      setStage("WAITING");
      await openAadhaarSession(opened.intentUrl);
    } catch (e) {
      setRefusal(errorMessage(e, "The verification service could not be reached. Try again in a moment."));
    }
  }

  // Coming back from the Play Store with the Aadhaar App installed moves on
  // without making the tenant press anything.
  useEffect(() => {
    if (stage !== "INSTALL") {
      return;
    }
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        return;
      }
      void isAadhaarAppInstalled().then((installed) => {
        if (installed === true) {
          void routeByDeveloperOptions();
        }
      });
    });
    return () => subscription.remove();
  }, [stage, routeByDeveloperOptions]);

  // Back from Settings with Developer options off moves on by itself too.
  useEffect(() => {
    if (stage !== "DEV_OPTIONS") {
      return;
    }
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        return;
      }
      void isDeveloperModeOn().then((on) => {
        if (on !== true) {
          setStage("SIGNUP");
        }
      });
    });
    return () => subscription.remove();
  }, [stage]);

  // The result arrives at our server, not here. Asked for whenever the app
  // comes back to the front, and every few seconds while it stays there.
  const inFlight = useRef(false);
  const poll = useCallback(async () => {
    if (!session || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const current = await checkAttempt({ attemptId: session.attemptId }).unwrap();
      if (current.status !== "AWAITING_CONSENT") {
        setAttempt(current);
        setStage("RESULT");
      }
    } catch {
      // The next tick asks again.
    } finally {
      inFlight.current = false;
    }
  }, [checkAttempt, session]);

  useEffect(() => {
    if (stage !== "WAITING") {
      return;
    }
    let active = AppState.currentState === "active";
    const timer = setInterval(() => {
      if (active) {
        void poll();
      }
    }, POLL_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      active = next === "active";
      if (active) {
        void poll();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [stage, poll]);

  function retry() {
    setSession(null);
    setAttempt(null);
    void routeByInstall();
  }

  const closesAt = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : null;
  const verified = attempt?.status === "SUCCEEDED";
  const expired = attempt?.status === "EXPIRED";

  return (
    <Card>
      <CheckHeader label="Aadhaar verification" onClose={onClose} />

      {stage === "INSTRUCTIONS" ? (
        <>
          <InstructionPoint
            body={
              profileQuery.data?.fullName
                ? `Your name here is "${profileQuery.data.fullName}". It must match your Aadhaar exactly, middle name included. If it does not, change it in your account.`
                : "Your name here must match your Aadhaar exactly, middle name included. If it does not, change it in your account."
            }
            number={1}
            title="Name matching"
          />
          <InstructionPoint
            body="Your date of birth and gender are taken from your Aadhaar and replace what is in your account. They are locked afterwards. You must be 18 or older."
            number={2}
            title="Details from your Aadhaar"
          />
          <InstructionPoint
            body="You approve sharing and do a face check in the Aadhaar App. It must be on this phone, not another one."
            number={3}
            title="Aadhaar App on this phone"
          />
          <ActionButton label="Continue" onPress={() => void routeByInstall()} />
        </>
      ) : null}

      {stage === "CHECKING" ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {stage === "INSTALL" ? (
        <>
          <StepTitle>Install the Aadhaar App</StepTitle>
          <StepCaption>It must be on this phone, not another one. It is free from UIDAI on the Play Store.</StepCaption>
          <ActionButton icon={GooglePlayIcon} label="Get the Aadhaar App" onPress={() => void openAadhaarAppStore()} />
          <ActionButton label="I've installed it" onPress={() => void recheckInstall()} variant="outline" />
        </>
      ) : null}

      {stage === "UNSUPPORTED" ? (
        <>
          <StepTitle>Update Khatiyan to verify</StepTitle>
          <StepCaption>
            This version of Khatiyan cannot check for the Aadhaar App. Update Khatiyan from the Play Store, then try
            again.
          </StepCaption>
          <ActionButton label="Close" onPress={onClose} variant="outline" />
        </>
      ) : null}

      {stage === "DEV_OPTIONS" ? (
        <>
          <StepTitle>Turn off Developer options</StepTitle>
          <StepCaption>
            The Aadhaar App won't open while Developer options is on. Turn it off in Settings, then come back here.
          </StepCaption>
          <ActionButton icon={Settings} label="Open Developer options" onPress={() => void openDeveloperOptions()} />
          <ActionButton label="I've turned it off" onPress={() => void recheckDeveloperOptions()} variant="outline" />
          {__DEV__ ? (
            <ActionButton
              compact
              label="Continue anyway (debug build)"
              onPress={() => {
                setDevOptionsWaived(true);
                setStage("SIGNUP");
              }}
              variant="secondary"
            />
          ) : null}
        </>
      ) : null}

      {stage === "SIGNUP" ? (
        <>
          <StepTitle>Have you signed up in the Aadhaar App?</StepTitle>
          <InstructionPoint body="A one-time signup inside the Aadhaar App" number={1} />
          <InstructionPoint body="Your Aadhaar number, then an OTP to your Aadhaar-linked mobile" number={2} />
          <InstructionPoint body="A face scan to finish" number={3} />
          <ActionButton label="Open Aadhaar App" onPress={() => void openForSignup()} variant="outline" />
          <ActionButton
            disabled={startState.isLoading}
            label={startState.isLoading ? "Please wait…" : "I'm signed up, verify now"}
            onPress={() => void verifyNow()}
          />
          <StepCaption>{`Verifying uses one attempt. ${attemptsLeft} left.`}</StepCaption>
          {checkSkipped ? (
            <StepCaption>Debug build without the Aadhaar App check. Skipped for testing.</StepCaption>
          ) : null}
          {devOptionsWaived ? (
            <StepCaption>Developer options is on, so the Aadhaar App will not open. Allowed in debug builds.</StepCaption>
          ) : null}
        </>
      ) : null}

      {stage === "WAITING" && session ? (
        <>
          <StepTitle>Finish in the Aadhaar App</StepTitle>
          <InstructionPoint body="Unlock the Aadhaar App" number={1} />
          <InstructionPoint body="Approve sharing with Khatiyan" number={2} />
          <InstructionPoint body="Do the face check" number={3} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
            <ActivityIndicator color={colors.muted} size="small" />
            <Text style={[type.caption, { color: colors.muted }]}>Checking for your result</Text>
          </View>
          <ActionButton
            label="Open Aadhaar App again"
            onPress={() => void openAadhaarSession(session.intentUrl)}
            variant="outline"
          />
          <StepCaption>
            {closesAt
              ? `This request closes at ${closesAt}. If it closes unanswered, you get the attempt back.`
              : "This request closes after a few minutes. If it closes unanswered, you get the attempt back."}
          </StepCaption>
        </>
      ) : null}

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}

      {stage === "RESULT" && attempt ? (
        <CheckResult
          attemptsLeft={attemptsLeft}
          message={
            verified
              ? "Your name, date of birth and gender now come from your Aadhaar. They are fixed from here and cannot be edited in the app."
              : expired
                ? "The request closed before it was finished in the Aadhaar App. You got the attempt back."
                : (attempt.failureReason ?? "That did not work.")
          }
          onClose={onClose}
          onRetry={retry}
          onVerified={onVerified}
          title={expired ? "Request closed" : undefined}
          verified={verified}
        />
      ) : null}
    </Card>
  );
}
