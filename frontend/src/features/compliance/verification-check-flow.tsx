import { useState } from "react";
import { Text, View } from "react-native";
import { ShieldCheck, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { StatusIcon } from "@/components/status-icon";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { VERIFICATION_SERVICES } from "@/features/compliance/verification-services";
import { useGetProfileQuery } from "@/store/services/auth-api";
import {
  useStartVerificationOtpMutation,
  useSubmitVerificationOtpMutation,
  type VerificationGrant,
  type VerificationResult,
} from "@/store/services/verification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One identity check, start to finish, in the card that opened it.
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

export function VerificationCheckFlow({
  grant,
  onClose,
  onVerified,
}: {
  grant: VerificationGrant;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { colors, fonts, type } = useTheme();
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
  const canRetry = outcome !== null && !outcome.verified && attemptsLeft > 0;

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
      {/* The mark leads, the way out closes. No back control at any step: it
          would promise a previous one that no longer exists. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <ShieldCheck color={colors.muted} size={18} strokeWidth={2} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>
          {serviceLabel}
        </Text>
        <AnimatedPressable
          accessibilityLabel={`Close ${serviceLabel.toLowerCase()}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderCurve: "continuous",
            borderRadius: 999,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <X color={colors.ink} size={17} strokeWidth={2.4} />
        </AnimatedPressable>
      </View>

      {stage === "INSTRUCTIONS" ? (
        <>
          {/* Only the name is compared. Saying "these must match" about three
              fields would be false: the date of birth and the address are not
              checked against anything the account holds — they are read from
              the Aadhaar record, the date is used for the 18+ test, and both
              then REPLACE what was there. Which is the point of verifying at
              all, since the government's copy is the better one. */}
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
            body="Your date of birth and address are taken from your Aadhaar. Your age should be 18+, and both replace what is in your account. They are locked afterwards and cannot be changed thereafter."
            number={2}
            title="Date of Birth and Address"
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
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
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
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
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
        <View style={{ alignItems: "center", gap: spacing.md, paddingTop: spacing.xs }}>
          {/* The app's one status mark: a filled disc with the glyph knocked
              out, the same shape a toast and a refusal use. */}
          <StatusIcon size={38} tone={outcome.verified ? "success" : "error"} />

          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: "center" }}>
            {outcome.verified ? "Identity verified" : attemptsLeft > 0 ? "Not verified" : "No attempts left"}
          </Text>

          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.sansMedium,
              fontSize: 14,
              lineHeight: 21,
              textAlign: "center",
            }}
          >
            {outcome.verified
              ? "Your name, date of birth and address now come from your Aadhaar record. They are fixed from here and cannot be edited in the app."
              : (outcome.message ?? "That did not work.")}
          </Text>

          {/* Said plainly, because it is what decides whether they try now or
              go and get the owner to fix something first. */}
          {!outcome.verified ? (
            <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
              {attemptsLeft > 0
                ? `${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left`
                : "Ask the property owner to add more attempts."}
            </Text>
          ) : null}

          <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
            {canRetry ? <ActionButton label="Try again" onPress={retry} /> : null}

            {/* Quiet when it sits under a retry — a second solid button would
                make the two look like equal choices when one is the point. */}
            <AnimatedPressable
              accessibilityRole="button"
              onPress={outcome.verified ? onVerified : onClose}
              style={{
                alignItems: "center",
                backgroundColor: canRetry ? "transparent" : colors.ink,
                borderColor: canRetry ? colors.borderStrong : colors.ink,
                borderCurve: "continuous",
                borderRadius: 14,
                borderWidth: 1,
                paddingVertical: spacing.md,
              }}
            >
              <Text
                style={{
                  color: canRetry ? colors.ink : colors.surface,
                  fontFamily: fonts.sansBold,
                  fontSize: 15,
                }}
              >
                {outcome.verified ? "Done" : canRetry ? "Not now" : "Close"}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

/** One numbered point, in the shared filled-badge style. */
function InstructionPoint({
  body,
  number,
  title,
}: {
  body: string;
  number: number;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.borderStrong,
          borderRadius: 999,
          height: 22,
          justifyContent: "center",
          marginTop: 1,
          width: 22,
        }}
      >
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>{number}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{title}</Text>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * The server's sentence, when it sent one.
 *
 * <p>Its refusals are written for the person reading them — "there is no mobile
 * number linked to this Aadhaar" is something a tenant can act on, where a
 * generic fallback is not.
 */
function errorMessage(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: string } } | undefined)?.data;
  return data?.message && data.message.trim().length > 0 ? data.message : fallback;
}
