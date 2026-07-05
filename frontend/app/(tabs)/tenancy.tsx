import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  Banknote,
  CalendarDays,
  DoorOpen,
  Home,
  KeyRound,
  ReceiptText,
} from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import type { BillingCycle } from "@/store/services/billing-api";
import { useGetMyTenancyDepositQuery, useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import {
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  useListMyTenanciesQuery,
  type TenantActiveTenancy,
  type TenancyExitRequest,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { useAppSelector } from "@/store/hooks";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ exitRequestCreated?: string; roomChangeRequested?: string }>();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const requestToastShownRef = useRef(false);

  useEffect(() => {
    if (requestToastShownRef.current) {
      return;
    }
    if (params.exitRequestCreated === "1") {
      requestToastShownRef.current = true;
      toast.success("Exit request created.");
    } else if (params.roomChangeRequested === "1") {
      requestToastShownRef.current = true;
      toast.success("Room change request recorded.");
    }
  }, [params.exitRequestCreated, params.roomChangeRequested, toast]);
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const tenanciesQuery = useListMyTenanciesQuery();
  const exitRequestsQuery = useListMyExitRequestsQuery();
  const roomChangeRequestsQuery = useListMyRoomChangeRequestsQuery();
  const activeTenancy = activeTenancyQuery.data;
  const activeTenancyId = activeTenancy?.tenancy.id;
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(activeTenancyId ?? "", { skip: !activeTenancyId });
  const depositQuery = useGetMyTenancyDepositQuery(activeTenancyId ?? "", { skip: !activeTenancyId });
  const cycles = useMemo(() => [...(cyclesQuery.data ?? [])].sort(compareCycles), [cyclesQuery.data]);
  const currentCycle = cycles.find((cycle) => cycle.status !== "PAID" && cycle.status !== "CANCELLED") ?? cycles[0];
  const pastCycles = cycles.filter((cycle) => cycle.id !== currentCycle?.id);
  const currentTenancyRequests = useMemo(
    () => (activeTenancy ? mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data, activeTenancy.tenancy.id).sort(compareRequests) : []),
    [activeTenancy, exitRequestsQuery.data, roomChangeRequestsQuery.data],
  );
  const pastTenancyRequests = useMemo(
    () =>
      mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data)
        .filter((request) => !activeTenancy || request.tenancyId !== activeTenancy.tenancy.id)
        .sort(compareRequests),
    [activeTenancy, exitRequestsQuery.data, roomChangeRequestsQuery.data],
  );
  const latestCurrentTenancyRequest = currentTenancyRequests[0];

  function handlePayCycle(cycle: BillingCycle) {
    router.push({
      pathname: "/payment-method",
      params: { amountPaise: String(cycle.totalAmountPaise), billingCycleId: cycle.id },
    });
  }

  if (activeTenancyQuery.isFetching && !activeTenancy) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          title="Your stay"
          italicTail="ledger."
          subtitle="Tenancy profile, billing, deposit and requests."
        />
        <SkeletonCard />
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        title="Your stay"
        italicTail="ledger."
        subtitle="Current tenancy, billing cycle, deposit manager and stay requests."
      />

      {activeTenancy ? (
        <>
          <TenancyOverviewCard activeTenancy={activeTenancy} />

          <Card style={{ display: "none" }}>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
              <IconBox icon={Home} />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                      Current tenancy
                    </Text>
                    <Text
                      style={{
                        color: colors.ink,
                        fontFamily: fonts.display,
                        fontSize: 24,
                        fontWeight: "500",
                        lineHeight: 29,
                      }}
                      selectable
                    >
                      {activeTenancy.property.name}
                    </Text>
                  </View>
                  <StatusPill label={humanizeToken(activeTenancy.tenancy.status)} tone={tenancyStatusTone(activeTenancy.tenancy.status)} />
                </View>
                <DetailLine label="Room" value={`${activeTenancy.room.roomNumber}${activeTenancy.room.floor ? ` · ${formatFloor(activeTenancy.room.floor)}` : ""}`} />
                <DetailLine label="Started" value={formatDate(activeTenancy.tenancy.startDate)} />
                <DetailLine label="Billing" value={humanizeToken(activeTenancy.tenancy.billingType)} />
                <DetailLine label="Rent snapshot" value={formatOptionalMoney(activeTenancy.tenancy.rentAmountPaise ?? activeTenancy.tenancy.dailyRatePaise)} />
              </View>
            </View>
          </Card>

          <Section eyebrow="This cycle" title="Billing cycle">
            {cyclesQuery.isFetching ? (
              <SkeletonCard />
            ) : currentCycle ? (
              <BillingCycleCard
                cycle={currentCycle}
                onPress={() => router.push({ pathname: "/tenancy-billing-cycle", params: { cycleId: currentCycle.id, tenancyId: activeTenancy.tenancy.id } })}
                onPay={() => handlePayCycle(currentCycle)}
                payBusy={false}
              />
            ) : (
              <EmptyState
                icon={ReceiptText}
                eyebrow="No cycle"
                title="No billing cycle yet"
                description="Your current payable cycle will appear here once billing is generated."
              />
            )}
          </Section>

          <Section eyebrow="Deposit manager" title="Deposit snapshot">
            {depositQuery.isFetching ? (
              <SkeletonCard />
            ) : depositQuery.data ? (
              <Card>
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <MetricTile label="Balance" value={formatMoney(depositQuery.data.currentBalancePaise)} hint={humanizeToken(depositQuery.data.status)} tone="primary" />
                    <MetricTile label="Movements" value={String(depositQuery.data.movements.length)} hint="Ledger entries" />
                  </View>
                  <ActionCard
                    meta="Deposit"
                    title="Open deposit manager"
                    description="See deposit credits, deductions, settlement actions and billing-linked movements."
                    onPress={() => router.push({ pathname: "/tenancy-deposit", params: { tenancyId: activeTenancy.tenancy.id } })}
                    tone="primary"
                  />
                </View>
              </Card>
            ) : (
              <ActionCard
                meta="Deposit"
                title="Deposit not opened yet"
                description="Deposit account opens after the first eligible billing cycle is completed."
              />
            )}
          </Section>

          <Section eyebrow="Past billing" title="Cycle history">
            <ActionCard
              meta={`${pastCycles.length} cycle${pastCycles.length === 1 ? "" : "s"}`}
              title="Past billing cycles"
              description="Open previous cycles in the same format as the current billing cycle, including line items."
              onPress={() => router.push({ pathname: "/tenancy-billing-history", params: { tenancyId: activeTenancy.tenancy.id } })}
            />
          </Section>

          <Section eyebrow="Raise requests" title="Stay requests">
            <ActionCard
              meta="Room"
              title="Room change request"
              description="Ask the property team for a room change and share your preferred move details."
              onPress={() => router.push("/tenancy-room-change-request")}
              tone="primary"
            />
            <ActionCard
              meta="Exit"
              title="Exit tenancy"
              description="Request normal notice or premature exit. The property team reviews billing and deposit impact."
              onPress={() => router.push("/tenancy-exit-request")}
            />
          </Section>
        </>
      ) : (
        <EmptyState
          icon={DoorOpen}
          eyebrow="No active tenancy"
          title="No current stay"
          description="Current tenancy and billing details appear when you have an active stay. Request history stays visible below."
        />
      )}

      <Section eyebrow="Requests" title="Tenancy requests">
        {exitRequestsQuery.isFetching ? (
          <SkeletonCard />
        ) : (
          <>
            {latestCurrentTenancyRequest ? <RequestHistoryCard request={latestCurrentTenancyRequest} /> : null}
            {activeTenancy ? (
              <ActionCard
                meta={`${currentTenancyRequests.length} request${currentTenancyRequests.length === 1 ? "" : "s"}`}
                title="Current tenancy requests"
                description="Open request history tied to this active tenancy. The preview above shows the latest one."
                onPress={() => router.push({ pathname: "/tenancy-request-history", params: { scope: "current", tenancyId: activeTenancy.tenancy.id } })}
                tone="primary"
              />
            ) : null}
            <ActionCard
              meta={`${pastTenancyRequests.length} request${pastTenancyRequests.length === 1 ? "" : "s"}`}
              title="View request history"
              description={
                activeTenancy
                  ? "Open request history from past tenancies. Current tenancy requests move here after the stay ends."
                  : "See exit requests and future room-change requests from completed tenancies."
              }
              onPress={() =>
                router.push({
                  pathname: "/tenancy-request-history",
                  params: activeTenancy ? { scope: "past", excludeTenancyId: activeTenancy.tenancy.id } : { scope: "past" },
                })
              }
            />
          </>
        )}
      </Section>

      {!activeTenancy && tenanciesQuery.data?.length ? (
        <Section eyebrow="Past stays" title="Tenancies">
          {tenanciesQuery.data.slice(0, 3).map((tenancy) => (
            <Card key={tenancy.id}>
              <DetailLine label={tenancy.referenceCode} value={`${humanizeToken(tenancy.status)} · ${formatDate(tenancy.startDate)}${tenancy.endDate ? ` to ${formatDate(tenancy.endDate)}` : ""}`} />
            </Card>
          ))}
        </Section>
      ) : null}
    </ScreenScrollView>
  );
}

function TenancyOverviewCard({ activeTenancy }: { activeTenancy: TenantActiveTenancy }) {
  const { colors, fonts, type } = useTheme();
  const rentAmount = activeTenancy.tenancy.rentAmountPaise ?? activeTenancy.tenancy.dailyRatePaise;

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <IconBox icon={Home} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Current tenancy
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 26,
                fontWeight: "500",
                letterSpacing: -0.3,
                lineHeight: 31,
              }}
              selectable
            >
              {activeTenancy.property.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
              Room {activeTenancy.room.roomNumber}
              {activeTenancy.room.floor ? ` · ${formatFloor(activeTenancy.room.floor)}` : ""}
            </Text>
          </View>
          <StatusPill
            label={humanizeToken(activeTenancy.tenancy.status)}
            tone={tenancyStatusTone(activeTenancy.tenancy.status)}
          />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TenancyStat icon={CalendarDays} label="Started" value={formatDate(activeTenancy.tenancy.startDate)} />
          <TenancyStat icon={ReceiptText} label="Billing" value={humanizeToken(activeTenancy.tenancy.billingType)} />
        </View>

        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          <TenancyInfoRow label="Rent snapshot" value={formatOptionalMoney(rentAmount)} />
          <ThinDivider />
          <TenancyInfoRow label="Tenancy ID" value={activeTenancy.tenancy.referenceCode} mono />
          <ThinDivider />
          <TenancyInfoRow
            label="Property location"
            value={`${activeTenancy.property.city}${activeTenancy.property.state ? `, ${activeTenancy.property.state}` : ""}`}
          />
        </View>
      </View>
    </Card>
  );
}

function TenancyStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Icon color={colors.primary} size={17} strokeWidth={2.3} />
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.ink, fontWeight: "900" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function TenancyInfoRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text
        style={[
          type.body,
          {
            color: colors.ink,
            flex: 1.25,
            fontFamily: mono ? fonts.mono : fonts.sans,
            fontWeight: "900",
            textAlign: "right",
          },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ThinDivider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.md }} />;
}

function BillingCycleCard({
  cycle,
  onPay,
  onPress,
  payBusy,
}: {
  cycle: BillingCycle;
  onPay: () => void;
  onPress: () => void;
  payBusy: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const payable = cycle.status !== "PAID" && cycle.status !== "CANCELLED" && cycle.totalAmountPaise > 0;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label={`Cycle ${cycle.cycleNumber}`} value={formatMoney(cycle.totalAmountPaise)} hint={humanizeToken(cycle.status)} tone="primary" />
          <MetricTile label="Due" value={formatShortDate(cycle.rentDueDate)} hint={`${formatShortDate(cycle.periodStartDate)} to ${formatShortDate(cycle.periodEndDate)}`} />
        </View>
        <ActionCard
          meta={`${cycle.lineItems.length} item${cycle.lineItems.length === 1 ? "" : "s"}`}
          title="Open line items"
          description="View rent, deposit, discounts, extra charges and settlement actions for this cycle."
          onPress={onPress}
        />
        {payable ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Pay current billing cycle"
            onPress={onPay}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 14,
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "center",
              minHeight: 50,
              opacity: payBusy ? 0.75 : 1,
              padding: spacing.md,
            }}
          >
            {payBusy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Banknote color={colors.onPrimary} size={18} strokeWidth={2.3} />
                <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "900" }} selectable>
                  Pay {formatMoney(cycle.totalAmountPaise)}
                </Text>
              </>
            )}
          </AnimatedPressable>
        ) : (
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
            {cycle.status === "PAID" ? "This cycle is already paid." : "This cycle is not payable right now."}
          </Text>
        )}
      </View>
    </Card>
  );
}

type TenantRequestHistoryItem =
  | (TenancyExitRequest & { requestKind: "EXIT" })
  | (TenancyRoomChangeRequest & { requestKind: "ROOM_CHANGE" });

function RequestHistoryCard({ request }: { request: TenantRequestHistoryItem }) {
  const isRoomChange = request.requestKind === "ROOM_CHANGE";

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <DetailKicker text={isRoomChange ? "Room change" : humanizeToken(request.type)} />
          <StatusPill label={humanizeToken(request.status)} tone={requestStatusTone(request.status)} />
        </View>
        {isRoomChange ? (
          <>
            <DetailLine label="Transfer date" value={formatDate(request.effectiveTransferDate)} />
            <DetailLine label="Requested rent" value={formatMoney(request.requestedRoomRentAmountPaise)} />
            {typeof request.executedRentAmountPaise === "number" ? <DetailLine label="Executed rent" value={formatMoney(request.executedRentAmountPaise)} /> : null}
            {request.executedAt ? <DetailLine label="Executed" value={formatDateTime(request.executedAt)} /> : null}
          </>
        ) : (
          <>
            <DetailLine label="Requested checkout" value={formatDate(request.requestedCheckoutDate)} />
            {request.approvedCheckoutDate ? <DetailLine label="Approved checkout" value={formatDate(request.approvedCheckoutDate)} /> : null}
          </>
        )}
        <DetailLine label="Reason" value={request.tenantReason ?? "Not provided"} />
        {request.adminNotes ? <DetailLine label="Admin notes" value={request.adminNotes} /> : null}
      </View>
    </Card>
  );
}

function IconBox({ icon: Icon }: { icon: typeof KeyRound }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.primarySoft,
        borderRadius: 14,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <Icon color={colors.primary} size={21} strokeWidth={2.4} />
    </View>
  );
}

function tenancyStatusTone(status: string) {
  if (status === "ACTIVE") {
    return "success";
  }
  if (status === "ON_NOTICE" || status === "ON_PREMATURE_NOTICE") {
    return "warning";
  }
  if (status === "ENDED" || status === "CANCELLED") {
    return "neutral";
  }
  return "primary";
}

function DetailKicker({ text }: { text: string }) {
  const { colors, type } = useTheme();

  return (
    <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
      {text}
    </Text>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.ink, flex: 1.25, fontWeight: "800", textAlign: "right" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function compareCycles(left: BillingCycle, right: BillingCycle) {
  return right.cycleNumber - left.cycleNumber;
}

function compareRequests(left: { updatedAt: string; createdAt: string }, right: { updatedAt: string; createdAt: string }) {
  return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime();
}

function mergedRequests(
  exitRequests: TenancyExitRequest[] = [],
  roomChangeRequests: TenancyRoomChangeRequest[] = [],
  tenancyId?: string,
): TenantRequestHistoryItem[] {
  const exits = exitRequests
    .filter((request) => !tenancyId || request.tenancyId === tenancyId)
    .map((request) => ({ ...request, requestKind: "EXIT" as const }));
  const roomChanges = roomChangeRequests
    .filter((request) => !tenancyId || request.tenancyId === tenancyId)
    .map((request) => ({ ...request, requestKind: "ROOM_CHANGE" as const }));

  return [...exits, ...roomChanges];
}

function requestStatusTone(status: string) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success";
  }
  if (status === "REJECTED" || status === "CANCELLED") {
    return "warning";
  }
  return "neutral";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(value / 100);
}

function formatOptionalMoney(value?: number | null) {
  return typeof value === "number" ? formatMoney(value) : "Not set";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatFloor(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("floor") ? trimmed : `Floor ${trimmed}`;
}

function humanizeToken(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
