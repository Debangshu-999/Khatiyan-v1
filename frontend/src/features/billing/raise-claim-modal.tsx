import { useState } from "react";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ArrowLeft, Info, ReceiptText } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { useToast } from "@/components/toast";
import { METHOD_ICON, METHOD_LABEL, PROOF_FIELD, type TenderMethod } from "@/features/billing/payment-methods";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { useRaisePaymentClaimMutation } from "@/store/services/payment-intent-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A tenant's "I paid" for one payment method (2026-09-28), with that method's
 * own proof: a UTR for UPI or a bank transfer, the slip's approval code for a
 * card, the cheque's number. A reference or a photo, and neither is required,
 * like the UPI confirmation. It goes to the owner to confirm.
 */
export function RaiseClaimCard({
  billingCycleId,
  billVersion,
  method,
  onBack,
  onSent,
  referenceCode,
}: {
  billingCycleId: string;
  /** The bill's version as the tenant saw it (2026-09-29). */
  billVersion: number;
  method: Exclude<TenderMethod, "CASH">;
  /** Back to the payment method it was raised from. */
  onBack: () => void;
  onSent: () => void;
  referenceCode: string;
}) {
  const toast = useToast();
  const [raiseClaim, raiseState] = useRaisePaymentClaimMutation();
  const [error, setError] = useState<string | null>(null);

  async function submit(proof: PaymentProof) {
    try {
      await raiseClaim({
        billingCycleId,
        version: billVersion,
        method,
        proofImageUrls: proof.proofImageUrls,
        referenceText: proof.referenceText,
      }).unwrap();
      toast.success("Sent to the property to confirm.");
      onSent();
    } catch (caught) {
      setError(errorMessage(caught) || "Could not send that. Try again.");
    }
  }

  return (
    <>
      <PaymentProofForm
        boxedProof
        busy={raiseState.isLoading}
        method={method}
        onBack={onBack}
        onSubmit={(proof) => void submit(proof)}
        referenceCode={referenceCode}
      />
      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}

/**
 * The line a proof step opens with: a back arrow to where the way of paying
 * was chosen, then that way's mark and name. On its own so a step that asks
 * for more than the proof, as a token paid at the desk does, opens the same
 * way (2026-10-11).
 */
export function PaymentProofHeading({
  icon,
  label,
  onBack,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  /** Left out, there is no back arrow. */
  onBack?: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      {onBack ? (
        <AnimatedPressable
          accessibilityLabel="Back to payment methods"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <ArrowLeft color={colors.ink} size={18} strokeWidth={2.4} />
        </AnimatedPressable>
      ) : null}
      <MaterialCommunityIcons color={colors.ink} name={icon} size={20} />
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>{label}</Text>
    </View>
  );
}

/** What a payer offers as proof: the method's own reference, photos, both or neither. */
export type PaymentProof = { proofImageUrls: string[]; referenceText: string | null };

/**
 * The proof a payment is recorded with: that method's own reference, or a
 * photo. Lifted out of the bill's claim card so a booking token is recorded
 * through the very same fields (user, 2026-10-11: "the same way the record
 * payment modal does on the tenant side"). It sends nothing itself. The caller
 * owns the request, the refusal and what happens after.
 */
export function PaymentProofForm({
  busy,
  boxedProof = false,
  disabled = false,
  hideMethod = false,
  method,
  onBack,
  onSubmit,
  referenceCode,
  requireProof = false,
  showOptionalHint = true,
  skipLabel = "Skip and send",
  submitLabel = "Send claim",
}: {
  /** The record is on its way. */
  busy: boolean;
  /** Group the reference and photos on a grey panel below the bill or booking ID. */
  boxedProof?: boolean;
  /** Nothing may be sent, for a reason the caller shows. */
  disabled?: boolean;
  /** The caller already names the method, in a picker above this. */
  hideMethod?: boolean;
  /** Cash too, for a token handed over at the desk. A bill's claim is never cash. */
  method: TenderMethod;
  /** Back to where the method was chosen. Left out, there is no back arrow. */
  onBack?: () => void;
  onSubmit: (proof: PaymentProof) => void;
  referenceCode: string;
  /** Require either the method's reference or a photo; bill claims remain optional. */
  requireProof?: boolean;
  /** Booking proof omits the optional information row, including on cash receipts. */
  showOptionalHint?: boolean;
  /** The button's words when no proof was given. */
  skipLabel?: string;
  submitLabel?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [reference, setReference] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  // Cash has no reference of its own: nothing to type, only a receipt to photograph where one was given.
  const field = method === "CASH" ? null : PROOF_FIELD[method];
  const hasEvidence = Boolean(reference.trim()) || proofUrls.some((url) => Boolean(url.trim()));
  const cannotSubmit = busy || disabled || (requireProof && !hasEvidence);

  return (
    <View style={{ gap: spacing.md }}>
      {hideMethod ? null : (
        <PaymentProofHeading icon={METHOD_ICON[method]} label={METHOD_LABEL[method]} onBack={onBack} />
      )}

      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: radii.sm,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <ReceiptText color={colors.muted} size={18} strokeWidth={2.1} />
        <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.mono, fontSize: 13 }}>
          {referenceCode}
        </Text>
      </View>

      <View style={{ backgroundColor: boxedProof ? colors.surfaceSunken : undefined, borderRadius: boxedProof ? radii.card : undefined, gap: spacing.md, padding: boxedProof ? spacing.md : 0 }}>
        {/* The method's own reference, or a photo. Either is enough. */}
        {field ? (
          <>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>{field.label}</Text>
              <AppTextInput
                autoCapitalize="characters"
                keyboardType={field.keyboard}
                maxLength={field.maxLength}
                onChangeText={(value) =>
                  setReference(field.keyboard === "number-pad" ? value.replace(/\D/g, "") : value.replace(/\s/g, ""))
                }
                placeholder={field.placeholder}
                placeholderTextColor={colors.kicker}
                style={{
                  backgroundColor: boxedProof ? colors.surface : undefined,
                  borderColor: colors.borderStrong,
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
            </View>

            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1 }} />
              <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>or</Text>
              <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1 }} />
            </View>
          </>
        ) : null}

        <MultiImageField
          label={field ? field.photoLabel : "Photo of the receipt, if you were given one"}
          libraryLabel="Gallery"
          max={2}
          onChange={setProofUrls}
          target="PAYMENT_PROOF"
          urls={proofUrls}
        />
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
        {showOptionalHint && !requireProof ? <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              height: 24,
              justifyContent: "center",
              width: 24,
            }}
          >
            <Info color={colors.muted} size={14} strokeWidth={2.2} />
          </View>
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
            Optional, but helps find your payment faster.
          </Text>
        </View> : null}
        <ActionButton
          disabled={cannotSubmit}
          label={busy ? "Sending…" : hasEvidence || requireProof ? submitLabel : skipLabel}
          onPress={() => {
            if (cannotSubmit) return;
            onSubmit({ proofImageUrls: proofUrls.filter((url) => Boolean(url.trim())), referenceText: reference.trim() || null });
          }}
        />
      </View>
    </View>
  );
}
