import { Text, View } from "react-native";

import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { DigestPaymentsEmptyIcon } from "@/components/tenancy-line-icons";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { CountPill, InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { billTitle, useListPropertyCyclesPaidTodayQuery, type BillingCycle } from "@/store/services/billing-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

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
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const paidQuery = useListPropertyCyclesPaidTodayQuery(property?.id ?? "", { skip: !property });
  const paid = paidQuery.data ?? [];
  const total = formatMoneyPaise(paid.reduce((sum, cycle) => sum + cycle.totalAmountPaise, 0));

  const loadFailed = loadFailure(propertiesQuery, paidQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

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
      {/* The initials disc of the Move-ins card, and the amount centred on the card's height (user, 2026-10-31). */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <InitialsAvatar name={cycle.tenantNameSnapshot?.trim() || "Unnamed tenant"} tone="green" />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.xs }}>
            <FitText numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>
              {cardName(cycle.tenantNameSnapshot?.trim() || "Unnamed tenant")}
            </FitText>
            {cycle.roomNumber ? <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11 }}>{`(Room ${cycle.roomNumber})`}</Text> : null}
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {cycle.referenceCode}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {[billTitle(cycle), paidAt ? `Paid ${paidAt}` : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 16 }}>
          {formatMoneyPaise(cycle.totalAmountPaise)}
        </Text>
      </View>
    </Card>
  );
}
