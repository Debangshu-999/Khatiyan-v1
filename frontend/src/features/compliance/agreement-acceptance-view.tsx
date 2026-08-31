import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { FileSignature } from "lucide-react-native";

import { deviceFingerprint, primeInstallId } from "@/auth/device-fingerprint";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { ClickwrapConsent } from "@/features/compliance/clickwrap-consent";
import { OtpSigningSheet } from "@/features/compliance/otp-signing-sheet";
import { ActionButton, ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import {
  useAcceptMyAgreementMutation,
  useDeclineMyAgreementMutation,
  useGetLegalStatementQuery,
  useGetMyAgreementQuery,
  useStartAgreementSigningMutation,
  type AgreementSigningChallenge,
} from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Clickwrap gate a tenant sees on the tenancy tab while their tenancy is
 * PENDING_ACCEPTANCE: the full agreement, an explicit consent checkbox, and
 * Accept / Decline. Accepting activates the tenancy; declining cancels it.
 */
export function AgreementAcceptanceView({ propertyName }: { propertyName: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  // Accept and decline are one-tap operations — a refusal has no field to blame.
  const opErrors = useFormErrors<never>();
  const agreementQuery = useGetMyAgreementQuery();
  const statementQuery = useGetLegalStatementQuery("TENANCY_AGREEMENT_ACCEPTANCE");
  const [acceptAgreement, acceptState] = useAcceptMyAgreementMutation();
  const [declineAgreement, declineState] = useDeclineMyAgreementMutation();
  const [startSigning, startState] = useStartAgreementSigningMutation();
  const [consented, setConsented] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  /** The open signing challenge: what is being signed, and where the code went. */
  const [challenge, setChallenge] = useState<AgreementSigningChallenge | null>(null);
  /** Seconds until another code may be requested, from the server's own clock. */
  const [lockedFor, setLockedFor] = useState(0);

  const agreement = agreementQuery.data;

  // Read once on mount so the fingerprint can be assembled synchronously at the
  // moment of signing.
  useEffect(() => {
    void primeInstallId();
  }, []);

  // Counts the refusal down and then clears it. The message going away is what
  // says the button works again — leaving it up would need the reader to
  // interpret a zero.
  useEffect(() => {
    if (lockedFor <= 0) {
      return;
    }
    const timer = setTimeout(() => setLockedFor((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  /**
   * Sends the code, and holds on to what the server says is being signed.
   *
   * <p>The wording comes back with it rather than being shipped in this build,
   * so what the tenant agreed to is not decided by which version of the app
   * they happen to be running.
   */
  async function requestCode() {
    try {
      setChallenge(await startSigning().unwrap());
      setLockedFor(0);
    } catch (error) {
      // A refusal for asking too often is not an error to dismiss — it is a
      // wait. It gets a line under the buttons with the time on it rather than
      // a modal, which would have to be cleared before the button it is about
      // could be seen.
      const wait = retryAfterSeconds(error);
      if (wait) {
        setLockedFor(wait);
        return;
      }

      opErrors.failFromServer(
        errorMessage(error) || "Could not send the verification code. Please try again.");
    }
  }

  /**
   * Signs, with the code and the hash of the text that was on screen.
   *
   * <p>A mismatch on either is refused by the server — an expired code, or an
   * agreement the owner amended while it was being read. Both come back as a
   * refusal rather than a field error, because neither is something to correct
   * in the box.
   */
  async function handleAccept(otp: string) {
    if (!challenge) {
      return;
    }

    try {
      await acceptAgreement({
        contentHash: challenge.contentHash,
        device: deviceFingerprint(),
        otp,
        statementText: challenge.statementText,
      }).unwrap();
      setChallenge(null);
      toast.success("Agreement signed. Welcome home!");
    } catch (error) {
      opErrors.failFromServer(
        errorMessage(error) || "Could not record your acceptance. Please try again.");
    }
  }

  async function handleDecline() {
    setConfirmDecline(false);
    try {
      await declineAgreement().unwrap();
      toast.success("Agreement declined. The tenancy was cancelled.");
    } catch {
      opErrors.failFromServer("Could not decline the agreement. Please try again.");
    }
  }

  if (agreementQuery.isLoading) {
    return <ActivityIndicator color={colors.primary} />;
  }

  if (!agreement) {
    return (
      <EmptyState
        icon={FileSignature}
        title="Agreement unavailable"
        description="Your tenancy is awaiting its agreement. Ask the property owner to re-check the onboarding."
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {/* The app's standing notice rather than a card of this screen's own.
          It is a precaution to read while deciding — the same thing NoticeBar
          exists for everywhere else — and "info" is the right tone: this
          explains what accepting does, it does not warn against it. */}
      <NoticeBar
        message={`${propertyName} requires you to read and accept these terms. Your tenancy — and its billing — starts only after you accept. If something looks wrong, contact the owner before accepting, or decline to cancel.`}
        title="Before your tenancy begins"
        tone="info"
      />

      <AgreementDocument
        acceptedAt={agreement.acceptedAt}
        clauses={agreement.clauses}
        preamble={agreement.preamble}
      />

      <Card>
        {/* The same block the owner ticks at onboarding. Two consents with the
            same shape, so they are one component — and the wording is the
            server's, fetched with the signing code rather than shipped here. */}
        <ClickwrapConsent
          checked={consented}
          onToggle={() => setConsented((current) => !current)}
          statement={statementQuery.data?.text ?? ""}
        />

        {/* Side by side: they are the two answers to one question, and stacked
            the decline read as a lesser option below the real one when it is an
            equally valid thing to do with an agreement you disagree with. */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            disabled={acceptState.isLoading || declineState.isLoading}
            label={declineState.isLoading ? "Declining…" : "Decline"}
            onPress={() => setConfirmDecline(true)}
            variant="danger"
          />
          <ActionButton
            disabled={
              !consented ||
              lockedFor > 0 ||
              startState.isLoading ||
              acceptState.isLoading ||
              declineState.isLoading
            }
            label={startState.isLoading ? "Sending…" : "Accept"}
            onPress={() => void requestCode()}
          />
        </View>

        {lockedFor > 0 ? (
          <Text style={[type.caption, { color: colors.warningText, textAlign: "center" }]}>
            Too many requests. Accept again in {countdown(lockedFor)}.
          </Text>
        ) : null}
      </Card>

      {challenge ? (
        <OtpSigningSheet
          busy={acceptState.isLoading}
          onClose={() => setChallenge(null)}
          onResend={() => void requestCode()}
          onSubmit={(otp) => void handleAccept(otp)}
          resending={startState.isLoading}
          sentTo={challenge.sentTo}
        />
      ) : null}

      {confirmDecline ? (
        <ConfirmDialog
          confirmLabel="Decline & cancel"
          destructive
          message="Declining cancels this tenancy immediately and releases your reserved bed. This cannot be undone."
          onCancel={() => setConfirmDecline(false)}
          onConfirm={() => void handleDecline()}
          title="Decline the agreement?"
        />
      ) : null}
    </View>
  );
}

/**
 * How long the server says to wait, if that is why it refused.
 *
 * <p>Read from the response rather than assumed from the limit: the window
 * opens at the FIRST request, so somebody refused on their third has already
 * spent part of it, and counting down the full window would be wrong by
 * however long they had been going.
 */
function retryAfterSeconds(error: unknown) {
  const data = (error as { data?: { retryAfterSeconds?: number } } | undefined)?.data;
  return typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : 0;
}

/** "14:32" past a minute, "45s" below it — a bare 872s means nothing to read. */
function countdown(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
