import { useState } from "react";
import { Text, View } from "react-native";


import { AlertModal } from "@/components/alert-modal";
import { useLeavableSurface } from "@/components/leave-on-stale";
import { SheetShell } from "@/components/sheet-shell";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { useToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, formatMoneyPaise, RequiredMark } from "@/features/owner/owner-ui";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import {
  useCancelMyPaymentIntentMutation,
  useConfirmMyPaymentIntentMutation,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Asks the tenant what happened after their banking app closed.
 *
 * <p><b>Closing this answers nothing on purpose.</b> They left the app to pay
 * and we do not know whether they did — so the attempt stays open, the bill goes
 * on showing it, and they are asked again next time. Guessing either way would
 * be the app inventing a payment or discarding one.
 *
 * <p>Two steps rather than one form: the first question has two answers and
 * belongs on its own, and burying "it failed" under a form asking for a
 * reference number would read as though evidence were required to say no.
 */
/**
 * How long a UPI reference number is.
 *
 * <p>
 * This is the RRN — the Retrieval Reference Number NPCI stamps on every UPI
 * transaction — and it is always 12 numeric digits. It is the number UPI apps
 * label "UPI transaction ID" or "UPI Ref. No.", and, more to the point, the one
 * that appears on the owner's bank statement, which is the document they will
 * be holding when they try to match this claim.
 *
 * <p>
 * <b>Not every "transaction ID" is this number.</b> Some apps also show a
 * longer alphanumeric id of their own (Google Pay's is ~35 characters). Those
 * are internal to the app and do not reach the owner's statement, so they are
 * no use here and are rejected by the digits-only rule below.
 */
const UPI_REFERENCE_LENGTH = 12;

export function PaymentDecisionModal({
  intent,
  onClose,
  onSettled,
}: {
  intent: PaymentIntent;
  onClose: () => void;
  /** Fired once the attempt is answered either way. */
  onSettled: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // A form in a dialog: a "data has changed" refusal closes it (2026-10-04).
  useLeavableSurface(onClose);
  const [cancelIntent, cancelState] = useCancelMyPaymentIntentMutation();
  const [confirmIntent, confirmState] = useConfirmMyPaymentIntentMutation();

  const [step, setStep] = useState<"ask" | "evidence">("ask");
  const [reference, setReference] = useState("");
  const form = useFormErrors<"reference">();
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const busy = cancelState.isLoading || confirmState.isLoading;

  // The sheet's back arrow and the device back button return to step one (SheetShell onBack).

  async function markFailed() {
    try {
      await cancelIntent({ intentId: intent.id, version: intent.version }).unwrap();
      toast.success("Payment cancelled. You can try again.");
      onSettled();
    } catch (caught) {
      setError(readErrorMessage(caught) ?? "Could not update that. Try again.");
    }
  }

  /**
   * Checks the reference before sending, if one was typed at all.
   *
   * <p>Only ever fires for a SHORT number: the field strips non-digits and caps
   * at 12, so "too long" and "not a number" cannot be reached — they are
   * prevented rather than reported.
   */
  function trySubmit() {
    // Required now (user, 2026-11-11): the number is what the owner matches on their statement.
    if (reference.length === 0) {
      form.validate({ reference: "Enter the 12-digit UPI reference number." });
      return;
    }
    if (reference.length !== UPI_REFERENCE_LENGTH) {
      form.validate({
        reference: `A UPI reference number is ${UPI_REFERENCE_LENGTH} digits. You have entered ${reference.length}.`,
      });
      return;
    }
    form.clearAll();
    void submitClaim();
  }

  async function submitClaim() {
    try {
      await confirmIntent({
        intentId: intent.id,
        version: intent.version,
        proofImageUrls: proofUrls,
        referenceText: reference.trim() || null,
      }).unwrap();
      toast.success("Sent to the property to confirm.");
      onSettled();
    } catch (caught) {
      setError(readErrorMessage(caught) ?? "Could not send that. Try again.");
    }
  }

  return (
    // The shared bottom sheet, not a centred dialog (user, 2026-11-11).
    <SheetShell
      onBack={step === "evidence" ? () => setStep("ask") : undefined}
      onClose={onClose}
      size="content"
      title={step === "ask" ? "Did the payment go through?" : "Anything to add?"}
    >
        {step === "ask" ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                {formatMoneyPaise(intent.amountPaise)}, noted as{" "}
                <Text style={{ fontFamily: fonts.mono }}>{intent.referenceCode}</Text>.
              </Text>
              {/* Right under the amount, above the buttons (user, 2026-11-11). The
                  attempt persisting is the whole design, and a tenant who closes
                  this should know the bill will still be waiting on them. */}
              <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
                Closing this leaves the payment open, we will ask again next time.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton
                disabled={busy}
                label="No, it failed"
                onPress={() => void markFailed()}
                variant="secondary"
              />
              <ActionButton disabled={busy} label="Yes, I paid" onPress={() => setStep("evidence")} />
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.modalDescription, { color: colors.muted }]}>
                UPI reference number / transaction ID<RequiredMark required />
              </Text>
              <AppTextInput
                keyboardType="number-pad"
                maxLength={UPI_REFERENCE_LENGTH}
                onChangeText={(value) => {
                  // Stripped rather than refused. Tenants paste this out of a
                  // banking app, where it often arrives with spaces or a "UPI
                  // Ref:" prefix attached.
                  setReference(value.replace(/\D/g, "").slice(0, UPI_REFERENCE_LENGTH));
                  form.clearField("reference");
                }}
                placeholder="12-digit number from UPI transaction details"
                placeholderTextColor={colors.kicker}
                style={{
                  borderColor: form.errors.reference ? colors.danger : colors.borderStrong,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  color: colors.ink,
                  fontFamily: fonts.mono,
                  fontSize: 15,
                  letterSpacing: 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
                value={reference}
              />
              <FieldError message={form.errors.reference} />
            </View>

            <MultiImageField
              label="Screenshot"
              max={2}
              onChange={setProofUrls}
              target="PAYMENT_PROOF"
              urls={proofUrls}
            />

            <View style={{ marginTop: spacing.sm }}>
              <ActionButton
                disabled={busy || form.blocked}
                label={busy ? "Sending…" : "Submit"}
                onPress={trySubmit}
              />
            </View>
          </View>
        )}

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </SheetShell>
  );
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
