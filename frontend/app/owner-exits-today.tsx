import { ExitTenancyIcon } from "@/components/artwork-icon";
import { DigestMoveOutsEmptyIcon } from "@/components/tenancy-line-icons";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { StatusPill } from "@/components/status-pill";
import { CountPill } from "@/features/enquiry/enquiry-tags";
import { ActionButton } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery } from "@/store/services/property-api";
import {
  useListPropertyExitRequestsQuery,
  useListPropertyTenanciesQuery,
  type TenancyStatus,
  type TenancySummary,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

/** Today in IST, the same calendar the server counts "ending today" in. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const ENDED: TenancyStatus[] = ["EXITED", "EVICTED"];
/** A stay that has begun and not ended. A booked stay that has not started is not leaving. */
const LIVE: TenancyStatus[] = ["ACTIVE", "ON_NOTICE", "ON_PREMATURE_NOTICE", "PENDING_EXIT"];

/** Why this stay ends today, in a few words. */
type MoveOut = { tenancy: TenancySummary; ended: boolean; reason: string };

/**
 * Move-outs today: every stay due to end today (user, 2026-10-18). An
 * approved exit for today, or a fixed term whose end date is today, read by
 * the one checkout rule (checkoutDate = endDate ?? plannedEndDate). One
 * already ended today stays on the list, marked Ended, so ending it does not
 * make it vanish. The rest each have End tenancy.
 *
 * <p>The Move-outs card on Home counts the same stays by the same rule
 * (OwnerDashboardService.endingToday).
 */
export default function OwnerExitsTodayScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const properties = useListMyPropertiesQuery().data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";

  // Ending a stay is TENANCIES at MANAGE. A view-only manager sees who is
  // leaving but gets no button that the server would refuse.
  const { canManage } = usePropertyPermissions(propertyId || undefined);
  const canEnd = canManage("TENANCIES");

  const tenanciesQuery = useListPropertyTenanciesQuery({ includePast: true, propertyId }, { skip: !propertyId });
  const requestsQuery = useListPropertyExitRequestsQuery(propertyId, { skip: !propertyId });
  const roomsQuery = useListPropertyRoomsQuery(propertyId, { skip: !propertyId });

  const today = istToday();
  const moveOuts = useMemo(() => {
    const approvedToday = new Set(
      (requestsQuery.data ?? [])
        .filter((request) => request.status === "APPROVED" && request.approvedCheckoutDate === today)
        .map((request) => request.tenancyId),
    );
    const list: MoveOut[] = [];
    for (const tenancy of tenanciesQuery.data ?? []) {
      if (ENDED.includes(tenancy.status) && tenancy.endDate === today) {
        list.push({ ended: true, reason: tenancy.status === "EVICTED" ? "Evicted today" : "Ended today", tenancy });
      } else if (LIVE.includes(tenancy.status) && (tenancy.checkoutDate === today || approvedToday.has(tenancy.id))) {
        list.push({
          ended: false,
          reason: approvedToday.has(tenancy.id) ? "Approved exit" : "Fixed term ends today",
          tenancy,
        });
      }
    }
    // Still to end first: those are the ones that need a hand.
    return list.sort((left, right) => Number(left.ended) - Number(right.ended));
  }, [requestsQuery.data, tenanciesQuery.data, today]);

  const roomLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsQuery.data ?? []) {
      map[room.id] = `Room ${room.roomNumber}`;
    }
    return map;
  }, [roomsQuery.data]);

  const loading = tenanciesQuery.isLoading || requestsQuery.isLoading;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="today."
        subtitle={property ? `Stays at ${property.name} ending today.` : undefined}
        title="Move-outs"
      />

      {loading ? <OwnerDataListSkeleton actions={1} bodyLines={1} rows={2} /> : null}

      {!loading && moveOuts.length === 0 ? (
        <EmptyState artworkNode={<DigestMoveOutsEmptyIcon size={64} />} title="Nobody moving out today" />
      ) : null}

      {!loading && moveOuts.length > 0 ? <CountPill count={moveOuts.length} noun={["move-out", "move-outs"]} /> : null}

      {loading
        ? null
        : moveOuts.map((moveOut) => (
            <MoveOutCard
              canEnd={canEnd}
              key={moveOut.tenancy.id}
              moveOut={moveOut}
              onEnd={() => router.push({ pathname: "/owner-end-tenancy", params: { tenancyId: moveOut.tenancy.id } })}
              roomLabel={roomLabels[moveOut.tenancy.roomId] ?? null}
            />
          ))}
    </ScreenScrollView>
  );
}

function MoveOutCard({
  canEnd,
  moveOut,
  onEnd,
  roomLabel,
}: {
  canEnd: boolean;
  moveOut: MoveOut;
  onEnd: () => void;
  roomLabel: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const { ended, reason, tenancy } = moveOut;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
              {cardName(tenancy.tenantName?.trim() || "Unnamed tenant")}
            </FitText>
            <Text style={[type.caption, { color: colors.muted }]}>
              {[roomLabel, tenancy.referenceCode].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <StatusPill label={ended ? "ENDED" : "ENDING TODAY"} tone={ended ? "neutral" : "warning"} />
        </View>
        <Text style={[type.caption, { color: colors.muted }]}>{reason}</Text>
        {canEnd && !ended ? <ActionButton icon={ExitTenancyIcon} label="End tenancy" onPress={onEnd} variant="danger" /> : null}
      </View>
    </Card>
  );
}
