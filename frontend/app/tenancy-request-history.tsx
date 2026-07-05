import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowLeft, FileClock } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import type { TenancyExitRequest, TenancyRoomChangeRequest } from "@/store/services/tenancy-api";
import { useListMyExitRequestsQuery, useListMyRoomChangeRequestsQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyRequestHistoryScreen() {
  const router = useGuardedRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ excludeTenancyId?: string; scope?: string; tenancyId?: string }>();
  const exitRequestsQuery = useListMyExitRequestsQuery();
  const roomChangeRequestsQuery = useListMyRoomChangeRequestsQuery();
  const requestsFetching = exitRequestsQuery.isFetching || roomChangeRequestsQuery.isFetching;
  const allRequests = mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data).sort(compareRequests);
  const requests = allRequests.filter((request) => {
    if (params.scope === "current" && params.tenancyId) {
      return request.tenancyId === params.tenancyId;
    }
    if (params.scope === "past" && params.excludeTenancyId) {
      return request.tenancyId !== params.excludeTenancyId;
    }
    return true;
  });
  const headerCopy = getHeaderCopy(params.scope);

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="REQUESTS"
        title={headerCopy.title}
        italicTail={headerCopy.italicTail}
        subtitle={headerCopy.subtitle}
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {requestsFetching ? (
        <SkeletonCard />
      ) : requests.length > 0 ? (
        requests.map((request) => (
          <RequestCard key={`${request.requestKind}-${request.id}`} request={request} />
        ))
      ) : (
        <EmptyState
          icon={FileClock}
          eyebrow="No requests"
          title={headerCopy.emptyTitle}
          description={headerCopy.emptyDescription}
        />
      )}
    </ScreenScrollView>
  );
}

function getHeaderCopy(scope?: string) {
  if (scope === "current") {
    return {
      emptyDescription: "Room change and exit requests for this active tenancy will appear here.",
      emptyTitle: "No current tenancy requests",
      italicTail: "requests.",
      subtitle: "Requests tied only to your active tenancy.",
      title: "Current",
    };
  }

  if (scope === "past") {
    return {
      emptyDescription: "When a tenancy ends, its request history will remain available here.",
      emptyTitle: "No past request history",
      italicTail: "history.",
      subtitle: "Requests from completed tenancies, separate from your active stay.",
      title: "Past request",
    };
  }

  return {
    emptyDescription: "Exit requests and future room change requests will remain available here after tenancy ends.",
    emptyTitle: "No request history yet",
    italicTail: "history.",
    subtitle: "Exit requests today, room change requests later, visible even after a tenancy ends.",
    title: "Request",
  };
}

type TenantRequestHistoryItem =
  | (TenancyExitRequest & { requestKind: "EXIT" })
  | (TenancyRoomChangeRequest & { requestKind: "ROOM_CHANGE" });

function RequestCard({ request }: { request: TenantRequestHistoryItem }) {
  const isRoomChange = request.requestKind === "ROOM_CHANGE";

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <DetailKicker text={isRoomChange ? "Room change" : humanizeToken(request.type)} />
          <StatusPill label={humanizeToken(request.status)} tone={statusTone(request.status)} />
        </View>
        {isRoomChange ? (
          <>
            <DetailLine label="Transfer date" value={formatDate(request.effectiveTransferDate)} />
            <DetailLine label="Requested rent" value={formatMoney(request.requestedRoomRentAmountPaise)} />
            {typeof request.executedRentAmountPaise === "number" ? <DetailLine label="Executed rent" value={formatMoney(request.executedRentAmountPaise)} /> : null}
          </>
        ) : (
          <>
            <DetailLine label="Requested checkout" value={formatDate(request.requestedCheckoutDate)} />
            {request.approvedCheckoutDate ? <DetailLine label="Approved checkout" value={formatDate(request.approvedCheckoutDate)} /> : null}
            {typeof request.finalBillingAmountPaise === "number" ? <DetailLine label="Final billing" value={formatMoney(request.finalBillingAmountPaise)} /> : null}
            {typeof request.depositSettlementAmountPaise === "number" ? (
              <DetailLine
                label={request.depositPayable ? "Deposit payable" : "Deposit deduction"}
                value={formatMoney(request.depositSettlementAmountPaise)}
              />
            ) : null}
          </>
        )}
        <DetailLine label="Reason" value={request.tenantReason ?? "Not provided"} />
        {request.adminNotes ? <DetailLine label="Admin notes" value={request.adminNotes} /> : null}
        {request.executedAt ? <DetailLine label="Executed" value={formatDateTime(request.executedAt)} /> : null}
      </View>
    </Card>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel="Go back" onPress={onPress} style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }}>
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function DetailKicker({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>{text}</Text>;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>{label}</Text>
      <Text style={[type.body, { color: colors.ink, flex: 1.25, fontWeight: "800", textAlign: "right" }]} selectable>{value}</Text>
    </View>
  );
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success";
  }
  if (status === "REJECTED" || status === "CANCELLED") {
    return "warning";
  }
  return "neutral";
}

function mergedRequests(
  exitRequests: TenancyExitRequest[] = [],
  roomChangeRequests: TenancyRoomChangeRequest[] = [],
): TenantRequestHistoryItem[] {
  return [
    ...exitRequests.map((request) => ({ ...request, requestKind: "EXIT" as const })),
    ...roomChangeRequests.map((request) => ({ ...request, requestKind: "ROOM_CHANGE" as const })),
  ];
}

function compareRequests(left: { updatedAt: string; createdAt: string }, right: { updatedAt: string; createdAt: string }) {
  return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: value % 100 === 0 ? 0 : 2, style: "currency" }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}
