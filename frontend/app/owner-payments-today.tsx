import { Text, View } from "react-native";

import { DigestPaymentsEmptyIcon } from "@/components/tenancy-line-icons";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { CountPill } from "@/features/enquiry/enquiry-tags";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { billTitle, useListPropertyCyclesPaidTodayQuery, type BillingCycle } from "@/store/services/billing-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

const PAID_AT = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Payments today: the bills paid today, newest first (user, 2026-10-18).
 *
 * <p>Opened from the Payments card in Home's live digest, which used to open
 * the whole billing screen. This shows exactly what the card counted, by the
 * same rule: a bill marked paid today, in India's calendar, whatever month it
 * is for.
 */
export default function OwnerPaymentsTodayScreen() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const properties = useListMyPropertiesQuery().data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const paidQuery = useListPropertyCyclesPaidTodayQuery(property?.id ?? "", { skip: !property });
  const paid = paidQuery.data ?? [];
  const total = formatMoneyPaise(paid.reduce((sum, cycle) => sum + cycle.totalAmountPaise, 0));

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="today."
        subtitle={property ? `Bills paid at ${property.name} today.` : undefined}
        title="Payments"
      />

      {paidQuery.isLoading ? <OwnerDataListSkeleton bodyLines={2} rows={2} /> : null}

      {!paidQuery.isLoading && paid.length === 0 ? (
        <EmptyState
          artworkNode={<DigestPaymentsEmptyIcon size={64} />}
          title="No payments today"
        />
      ) : null}

      {paid.length > 0 ? <CountPill count={paid.length} noun={[`payment · ${total}`, `payments · ${total}`]} /> : null}

      {paid.map((cycle) => <PaymentCard cycle={cycle} key={cycle.id} />)}
    </ScreenScrollView>
  );
}

function PaymentCard({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const paidAt = cycle.paidAt ? PAID_AT.format(new Date(cycle.paidAt)) : null;

  return (
    <Card>
      <View style={{ gap: 2 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {cycle.tenantNameSnapshot?.trim() || "Unnamed tenant"}
          </FitText>
          <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {formatMoneyPaise(cycle.totalAmountPaise)}
          </Text>
        </View>
        <Text style={[type.caption, { color: colors.muted }]}>
          {[cycle.roomNumber ? `Room ${cycle.roomNumber}` : null, cycle.referenceCode].filter(Boolean).join(" · ")}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {[billTitle(cycle), paidAt ? `Paid ${paidAt}` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Card>
  );
}
