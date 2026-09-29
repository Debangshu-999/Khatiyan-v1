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
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [raiseClaim, raiseState] = useRaisePaymentClaimMutation();
  const [reference, setReference] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const field = PROOF_FIELD[method];
  const hasEvidence = Boolean(reference.trim()) || proofUrls.length > 0;

  async function submit() {
    try {
      await raiseClaim({
        billingCycleId,
        version: billVersion,
        method,
        proofImageUrls: proofUrls,
        referenceText: reference.trim() || null,
      }).unwrap();
      toast.success("Sent to the property to confirm.");
      onSent();
    } catch (caught) {
      setError(errorMessage(caught) || "Could not send that. Try again.");
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
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
        <MaterialCommunityIcons color={colors.ink} name={METHOD_ICON[method]} size={20} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>
          {METHOD_LABEL[method]}
        </Text>
      </View>

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

      {/* The method's own reference, or a photo. Either is enough. */}
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

      <MultiImageField
        label={field.photoLabel}
        libraryLabel="Gallery"
        max={2}
        onChange={setProofUrls}
        target="PAYMENT_PROOF"
        urls={proofUrls}
      />

      <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
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
        </View>
        <ActionButton
          disabled={raiseState.isLoading}
          label={raiseState.isLoading ? "Sending…" : hasEvidence ? "Send claim" : "Skip and send"}
          onPress={() => void submit()}
        />
      </View>

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </View>
  );
}
