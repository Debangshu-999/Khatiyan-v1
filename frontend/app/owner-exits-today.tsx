import { useMemo } from "react";
import { Text, View } from "react-native";
import { DoorOpen, LogOut } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { ActionButton } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery } from "@/store/services/property-api";
import { useListPropertyExitRequestsQuery, type TenancyExitRequest } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Today in IST, the same calendar the server counts "ending today" in. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/**
 * Move-outs today: the tenants whose approved checkout is today, each with a
 * way to end their stay.
 *
 * <p>Opened from the Move-outs card in Home's live digest. That card used to
 * open the whole exit requests queue, where the few tenants leaving today sat
 * among pending, rejected and future requests. This shows exactly the ones the
 * card counted, by the same rule: an APPROVED exit request whose approved
 * checkout date is today.
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

  const requestsQuery = useListPropertyExitRequestsQuery(propertyId, { skip: !propertyId });
  const roomsQuery = useListPropertyRoomsQuery(propertyId, { skip: !propertyId });

  const today = istToday();
  const leavingToday = useMemo(
    () =>
      (requestsQuery.data ?? []).filter(
        (request) => request.status === "APPROVED" && request.approvedCheckoutDate === today,
      ),
    [requestsQuery.data, today],
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
        eyebrow="Home"
        italicTail="today."
        onBack={() => router.back()}
        subtitle={property ? `Tenants checking out of ${property.name} today.` : undefined}
        title="Move-outs"
      />

      {requestsQuery.isLoading ? <OwnerDataListSkeleton actions={1} bodyLines={1} rows={2} /> : null}

      {!requestsQuery.isLoading && leavingToday.length === 0 ? (
        <EmptyState
          description="Tenants with an approved checkout today appear here."
          icon={DoorOpen}
          title="Nobody is moving out today"
        />
      ) : null}

      {leavingToday.map((request) => (
        <MoveOutCard
          canEnd={canEnd}
          key={request.id}
          onEnd={() => router.push({ pathname: "/owner-end-tenancy", params: { tenancyId: request.tenancyId } })}
          request={request}
          roomLabel={roomLabels[request.roomId] ?? null}
        />
      ))}
    </ScreenScrollView>
  );
}

function MoveOutCard({
  canEnd,
  onEnd,
  request,
  roomLabel,
}: {
  canEnd: boolean;
  onEnd: () => void;
  request: TenancyExitRequest;
  roomLabel: string | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {request.tenantName?.trim() || "Unnamed tenant"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {[roomLabel, request.referenceCode].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {canEnd ? <ActionButton icon={LogOut} label="End tenancy" onPress={onEnd} variant="danger" /> : null}
      </View>
    </Card>
  );
}
