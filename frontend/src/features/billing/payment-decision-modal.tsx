import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";

import { ArrowLeft, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { useToast } from "@/components/toast";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import {
  useCancelMyPaymentIntentMutation,
  useConfirmMyPaymentIntentMutation,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
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
  const keyboardInset = useKeyboardInset();
  const [cancelIntent, cancelState] = useCancelMyPaymentIntentMutation();
  const [confirmIntent, confirmState] = useConfirmMyPaymentIntentMutation();

  const [step, setStep] = useState<"ask" | "evidence">("ask");
  const [reference, setReference] = useState("");
  const form = useFormErrors<"reference">();
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const busy = cancelState.isLoading || confirmState.isLoading;
  // A screenshot counts. "Skip" has to mean the whole step was skipped, so a
  // tenant who attached proof but had no reference number to hand is not told
  // they are skipping something they just did.
  const hasEvidence = reference.length > 0 || proofUrls.length > 0;

  /**
   * Back out of the evidence step, or close.
   *
   * <p>The device back button runs this too. Without that it would close the
   * whole modal from step two, throwing away a "yes" the tenant had already
   * given — and leaving the attempt open, so they would be asked the same
   * question again with no idea why.
   */
  function goBack() {
    if (step === "evidence") {
      setStep("ask");
      return;
    }
    onClose();
  }

  async function markFailed() {
    try {
      await cancelIntent(intent.id).unwrap();
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
    if (reference.length > 0 && reference.length !== UPI_REFERENCE_LENGTH) {
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
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={goBack}
      statusBarTranslucent
      transparent
      visible
    >
      {/* iOS keeps the platform avoider, where it works. Android drives itself
          from the measured inset below — `behavior="padding"` there is broken
          under edge-to-edge and never returns to zero on dismissal. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.overlay,
            flex: 1,
            justifyContent: "center",
            padding: spacing.lg,
            // Shrinks the centring box so the dialog rises with the keyboard
            // rather than sitting behind it.
            paddingBottom: spacing.lg + keyboardInset,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              gap: spacing.md,
              maxHeight: "88%",
              maxWidth: DIALOG_MAX_WIDTH,
              padding: spacing.lg,
              width: "100%",
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              {/* Only on step two. On step one there is nothing behind it, and a
                  back arrow that closes the dialog is a different control
                  wearing the same glyph. */}
              {step === "evidence" ? (
                <AnimatedPressable
                  accessibilityLabel="Back"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setStep("ask")}
                >
                  <ArrowLeft color={colors.ink} size={19} strokeWidth={2.4} />
                </AnimatedPressable>
              ) : null}
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20 }}>
                {step === "ask" ? "Did the payment go through?" : "Anything to add?"}
              </Text>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 28,
                  justifyContent: "center",
                  width: 28,
                }}
              >
                <X color={colors.inkSoft} size={15} strokeWidth={2.4} />
              </AnimatedPressable>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 1 }}
            >
        {step === "ask" ? (
          <>
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
              {formatMoneyPaise(intent.amountPaise)}, noted as{" "}
              <Text style={{ fontFamily: fonts.mono }}>{intent.referenceCode}</Text>.
            </Text>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton
                disabled={busy}
                label="No, it failed"
                onPress={() => void markFailed()}
                variant="secondary"
              />
              <ActionButton disabled={busy} label="Yes, I paid" onPress={() => setStep("evidence")} />
            </View>

            {/* Said out loud rather than left to be discovered. The attempt
                persisting is the whole design, and a tenant who closes this
                should know the bill will still be waiting on them. */}
            <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
              Closing this leaves the payment open, we will ask again next time.
            </Text>
          </>
        ) : (
          <>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
                UPI reference number / transaction ID
              </Text>
              <AppTextInput
                keyboardType="number-pad"
                maxLength={UPI_REFERENCE_LENGTH}
                onChangeText={(value) => {
                  // Stripped rather than refused. Tenants paste this out of a
                  // banking app, where it often arrives with spaces or a "UPI
                  // Ref:" prefix attached, and rejecting the paste teaches them
                  // to retype a 12-digit number by hand.
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

            {/* Down here, next to the button it excuses. At the top of the step
                it was read before either field existed, so "optional" was an
                abstract promise; sitting above the button, it is the answer to
                the question actually being asked — can I press this with
                nothing filled in. The extra top margin is what stops it and the
                button crowding the picker above them. */}
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Optional, but it helps them find your payment faster.
              </Text>

              {/* One button that renames itself, not a button plus a quieter
                  "skip" link beneath it. A claim with nothing attached is a
                  first-class answer — a tenant whose app hides the reference
                  number must not be stuck — and saying so on the button itself
                  makes that obvious, where a grey link under a blue button
                  reads as the lesser of the two. */}
              <ActionButton
                disabled={busy || form.blocked}
                label={busy ? "Sending…" : hasEvidence ? "Submit" : "Skip and submit"}
                onPress={trySubmit}
              />
            </View>
          </>
        )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </Modal>
  );
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
