import { useState } from "react";
import { Text } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { AadhaarAppCheckFlow } from "@/features/compliance/aadhaar-app-check-flow";
import {
  CheckHeader,
  CheckResult,
  InstructionPoint,
  errorMessage,
} from "@/features/compliance/verification-flow-parts";
import { VERIFICATION_SERVICES } from "@/features/compliance/verification-services";
import { useGetProfileQuery } from "@/store/services/auth-api";
import {
  useStartVerificationOtpMutation,
  useSubmitVerificationOtpMutation,
  type VerificationGrant,
  type VerificationResult,
} from "@/store/services/verification-api";
import { useTheme } from "@/theme/use-theme";

/**
 * One identity check, start to finish, in the card that opened it.
 *
 * <p>The Aadhaar App check is the one owners order now (2026-09-27). The OTP
 * check below stays for grants ordered before it, which still run.
 */
export function VerificationCheckFlow(props: {
  grant: VerificationGrant;
  onClose: () => void;
  onVerified: () => void;
}) {
  return props.grant.serviceCode === "AADHAAR" ? <AadhaarAppCheckFlow {...props} /> : <OtpCheckFlow {...props} />;
}

/**
 * The retired OTP check, for grants that carry its code.
 *
 * <p>Four steps in one card: what has to match, the number, the code, and how
 * it ended. Separate steps rather than one long form because they are answered
 * at different moments — the first before the tenant has done anything, the
 * last after the owner has already been charged.
 *
 * <p><b>Nothing here goes backwards.</b> There is no back control on any step.
 * A code cannot be un-sent and an attempt cannot be un-spent, so a button
 * offering to return to the previous step would be lying about what it does.
 * The ways out are forward, or out entirely.
 *
 * <p><b>Reopening starts from the beginning.</b> The whole flow unmounts when
 * it closes, so the instructions are read again next time rather than dropping
 * somebody back into a half-finished attempt whose code has since expired.
 */
type Stage = "INSTRUCTIONS" | "AADHAAR" | "OTP" | "RESULT";

function OtpCheckFlow({
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

  const service = VERIFICATION_SERVICES.find((entry) => entry.key === grant.serviceCode) ?? null;
  const serviceLabel = service?.label ?? "Identity check";

  const [startOtp, startState] = useStartVerificationOtpMutation();
  const [submitOtp, submitState] = useSubmitVerificationOtpMutation();

  const [stage, setStage] = useState<Stage>("INSTRUCTIONS");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [mobileHint, setMobileHint] = useState<string | null>(null);
  // Two channels, deliberately. `error` is what the tenant typed wrong and can
  // fix by retyping, so it sits under the field. `refusal` is the server or the
  // provider saying no — nothing on this screen will fix it, so it interrupts
  // rather than waiting to be noticed beside an input.
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerificationResult | null>(null);

  const busy = startState.isLoading || submitState.isLoading;
  const attemptsLeft = outcome?.grant?.attemptsRemaining ?? grant.attemptsRemaining;

  async function sendCode() {
    setError(null);
    if (!/^[0-9]{12}$/.test(aadhaarNumber)) {
      setError("Enter the 12 digits on your Aadhaar card");
      return;
    }
    try {
      const challenge = await startOtp({
        aadhaarNumber,
        consent: true,
        grantId: grant.id,
      }).unwrap();
      setAttemptId(challenge.attemptId);
      setMobileHint(challenge.linkedMobileHint);
      // Cleared the moment it has been sent. It is of no further use to this
      // screen, and the shortest life it can have is the right one.
      setAadhaarNumber("");
      setStage("OTP");
    } catch (e) {
      setRefusal(errorMessage(e, "The verification service could not be reached. Try again in a moment."));
    }
  }

  async function confirmCode() {
    setError(null);
    if (!/^[0-9]{6}$/.test(otp)) {
      setError("The code is 6 digits");
      return;
    }
    if (!attemptId) {
      return;
    }
    try {
      setOutcome(await submitOtp({ attemptId, otp }).unwrap());
      setStage("RESULT");
    } catch (e) {
      setRefusal(errorMessage(e, "The verification service could not be reached. Try again in a moment."));
    }
  }

  /** A fresh attempt from the number, because the old code is dead. */
  function retry() {
    setOutcome(null);
    setAttemptId(null);
    setOtp("");
    setError(null);
    setStage("AADHAAR");
  }

  return (
    <Card>
      <CheckHeader label={serviceLabel} onClose={onClose} />

      {stage === "INSTRUCTIONS" ? (
        <>
          {/* Only the name is compared. The date of birth is not checked
              against anything the account holds: it is read from the Aadhaar
              record, used for the 18+ test, and then REPLACES what was there.
              The address is not taken at all (owner's decision, 2026-09-27). */}
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
            body="Your date of birth is taken from your Aadhaar and replaces what is in your account. You must be 18 or older. It is locked afterwards."
            number={2}
            title="Date of birth"
          />
          <InstructionPoint
            body="Keep the phone with your Aadhaar-linked number nearby. A code is sent to it and lasts 10 minutes."
            number={3}
            title="You will get a code"
          />

          <ActionButton label="Continue" onPress={() => setStage("AADHAAR")} />
        </>
      ) : null}

      {stage === "AADHAAR" ? (
        <>
          <FormInput
            error={error ?? undefined}
            keyboardType="number-pad"
            label="Aadhaar number"
            maxLength={12}
            onChangeText={(next) => {
              setAadhaarNumber(next.replace(/[^0-9]/g, ""));
              setError(null);
            }}
            placeholder="12 digits"
            value={aadhaarNumber}
          />
          <Text style={[type.description, { color: colors.muted }]}>
            Nobody at the property sees this number. Only the result and its last four digits are
            kept.
          </Text>
          <ActionButton disabled={busy} label={busy ? "Please wait…" : "Send OTP"} onPress={sendCode} />
        </>
      ) : null}

      {stage === "OTP" ? (
        <>
          <FormInput
            error={error ?? undefined}
            keyboardType="number-pad"
            label={
              mobileHint
                ? `Code sent to the number ending ${mobileHint}`
                : "Code sent to your Aadhaar-linked phone"
            }
            maxLength={6}
            onChangeText={(next) => {
              setOtp(next.replace(/[^0-9]/g, ""));
              setError(null);
            }}
            placeholder="6 digits"
            value={otp}
          />
          <Text style={[type.description, { color: colors.muted }]}>
            The code lasts 10 minutes. Nobody at the property sees it.
          </Text>
          <ActionButton disabled={busy} label={busy ? "Please wait…" : "Verify"} onPress={confirmCode} />
        </>
      ) : null}

      {/* A refusal interrupts. It is never something retyping fixes, and under
          the field it would sit unread beside an input the tenant is about to
          try again. */}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}

      {stage === "RESULT" && outcome ? (
        <CheckResult
          attemptsLeft={attemptsLeft}
          message={
            outcome.verified
              ? "Your name and date of birth now come from your Aadhaar record. They are fixed from here and cannot be edited in the app."
              : (outcome.message ?? "That did not work.")
          }
          onClose={onClose}
          onRetry={retry}
          onVerified={onVerified}
          verified={outcome.verified}
        />
      ) : null}
    </Card>
  );
}
