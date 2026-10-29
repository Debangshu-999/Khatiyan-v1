import { useMemo } from "react";
import { Text, View } from "react-native";

import { DigestMoveInsEmptyIcon } from "@/components/tenancy-line-icons";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { CountPill, InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

/** Today in IST, the same calendar the server counts "started today" in. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const ON_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });

/**
 * Move-ins today: the stays that start today (user, 2026-10-18).
 *
 * <p>Opened from the Move-ins card in Home's live digest, which used to open
 * the whole tenancy screen. This shows exactly what the card counted, by the
 * same rule: a stay whose start date is today.
 */
export default function OwnerMoveInsTodayScreen() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const properties = useListMyPropertiesQuery().data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";

  const tenanciesQuery = useListPropertyTenanciesQuery({ propertyId }, { skip: !propertyId });
  const roomsQuery = useListPropertyRoomsQuery(propertyId, { skip: !propertyId });

  const today = istToday();
  const startingToday = useMemo(
    () => (tenanciesQuery.data ?? []).filter((tenancy) => tenancy.startDate === today),
    [tenanciesQuery.data, today],
  );
  const roomLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsQuery.data ?? []) {
      map[room.id] = `Room ${room.roomNumber}`;
    }
    return map;
  }, [roomsQuery.data]);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="today."
        subtitle={property ? `Tenants whose stay at ${property.name} starts today.` : undefined}
        title="Move-ins"
      />

      {tenanciesQuery.isLoading ? <OwnerDataListSkeleton bodyLines={2} rows={2} /> : null}

      {!tenanciesQuery.isLoading && startingToday.length === 0 ? (
        <EmptyState
          artworkNode={<DigestMoveInsEmptyIcon size={64} />}
          title="Nobody moved in today"
        />
      ) : null}

      {startingToday.length > 0 ? <CountPill count={startingToday.length} noun={["move-in", "move-ins"]} /> : null}

      {startingToday.map((tenancy) => (
        <MoveInCard key={tenancy.id} roomLabel={roomLabels[tenancy.roomId] ?? null} tenancy={tenancy} />
      ))}
    </ScreenScrollView>
  );
}

function MoveInCard({ roomLabel, tenancy }: { roomLabel: string | null; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const term = tenancy.billingType === "DAILY"
    ? "Daily stay"
    : tenancy.plannedEndDate
      ? `Fixed term to ${ON_DATE.format(new Date(`${tenancy.plannedEndDate}T00:00:00Z`))}`
      : "Monthly";
  const rentPaise = tenancy.billingType === "DAILY" ? tenancy.dailyRatePaise : tenancy.rentAmountPaise;
  const rent = rentPaise == null
    ? null
    : `${tenancy.billingType === "DAILY" ? "Rate" : "Rent"} ${formatMoneyPaise(rentPaise)}${tenancy.billingType === "DAILY" ? " a day" : ""}`;

  return (
    <Card>
      {/* The initials disc the enquiry cards use, beside who is moving in (user, 2026-10-28). */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <InitialsAvatar name={tenancy.tenantName?.trim() || "Unnamed tenant"} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {cardName(tenancy.tenantName?.trim() || "Unnamed tenant")}
          </FitText>
          <Text style={[type.caption, { color: colors.muted }]}>
            {[roomLabel, tenancy.referenceCode].filter(Boolean).join(" · ")}
          </Text>
          <Text style={[type.caption, { color: colors.muted, marginTop: spacing.xxs }]}>
            {[term, rent].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
    </Card>
  );
}
