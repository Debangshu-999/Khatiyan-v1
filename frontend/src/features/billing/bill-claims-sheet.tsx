import { ActivityIndicator, Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { ClaimCard, isOwnerVisible } from "@/features/billing/payment-claim-card";
import type { BillingCycle } from "@/store/services/billing-api";
import { useListBillPaymentClaimsQuery } from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAYMENT_CLAIMS_ILLUSTRATION = require("../../../assets/images/workspace/payment_claims1254.png");

/**
 * One bill's payment claims, from the claims icon on its card (2026-09-28).
 * The same cards as the Payment claims screen, newest first, so an owner can
 * answer a claim without leaving the bill. Owner only, like that screen.
 */
export function BillClaimsSheet({
  cycle,
  onClose,
  readOnly,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  /** The bill is only being viewed here: claims are shown, not answered. */
  readOnly: boolean;
}) {
  const { colors, type } = useTheme();
  const claimsQuery = useListBillPaymentClaimsQuery(cycle.id);
  const claims = (claimsQuery.data ?? []).filter(isOwnerVisible);

  return (
    <SheetShell onClose={onClose} title="Payment claims">
      <Text style={[type.modalDescription, { color: colors.muted }]}>
        What the tenant said they paid on {cycle.referenceCode}, newest first.
      </Text>

      {claimsQuery.isLoading ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : claimsQuery.isError ? (
        <Text style={[type.caption, { color: colors.danger }]}>Could not load the claims. Close this and try again.</Text>
      ) : claims.length === 0 ? (
        <EmptyState
          artwork={PAYMENT_CLAIMS_ILLUSTRATION}
          description="When the tenant raises a claim on this bill, it shows here for you to check."
          title="No claims yet"
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {claims.map((claim) => (
            <ClaimCard claim={claim} key={claim.id} readOnly={readOnly} />
          ))}
        </View>
      )}
    </SheetShell>
  );
}
