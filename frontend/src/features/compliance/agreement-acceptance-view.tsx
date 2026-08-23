import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Check, FileSignature } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { AgreementClauseList } from "@/features/compliance/agreement-clause-list";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import {
  useAcceptMyAgreementMutation,
  useDeclineMyAgreementMutation,
  useGetMyAgreementQuery,
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
  const [acceptAgreement, acceptState] = useAcceptMyAgreementMutation();
  const [declineAgreement, declineState] = useDeclineMyAgreementMutation();
  const [consented, setConsented] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  const agreement = agreementQuery.data;

  async function handleAccept() {
    try {
      await acceptAgreement().unwrap();
      toast.success("Agreement accepted. Welcome home!");
    } catch {
      opErrors.failFromServer("Could not record your acceptance. Please try again.");
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
      <Card tone="sunken">
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Before your tenancy begins
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 13.5, lineHeight: 20 }]}>
          {propertyName} requires you to read and accept these terms. Your tenancy — and its billing — starts only
          after you accept. If something looks wrong, contact the owner before accepting, or decline to cancel.
        </Text>
      </Card>

      <AgreementClauseList clauses={agreement.clauses} />

      <Card>
        <AnimatedPressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consented }}
          onPress={() => setConsented((current) => !current)}
          style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: consented ? colors.primary : "transparent",
              borderColor: consented ? colors.primary : colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 6,
              borderWidth: 1.5,
              height: 22,
              justifyContent: "center",
              marginTop: 1,
              width: 22,
            }}
          >
            {consented ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
          </View>
          <Text style={[type.body, { color: colors.ink, flex: 1, fontSize: 13.5, lineHeight: 20 }]}>
            I have read and agree to all the terms above, and I understand they govern my tenancy.
          </Text>
        </AnimatedPressable>

        <ActionButton
          disabled={!consented || acceptState.isLoading || declineState.isLoading}
          label={acceptState.isLoading ? "Accepting…" : "Accept & start tenancy"}
          onPress={() => void handleAccept()}
        />
        <ActionButton
          disabled={acceptState.isLoading || declineState.isLoading}
          label={declineState.isLoading ? "Declining…" : "Decline"}
          onPress={() => setConfirmDecline(true)}
          variant="danger"
        />
      </Card>

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
