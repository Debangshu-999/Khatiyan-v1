import { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  CalendarDays,
  DoorOpen,
  FileSignature,
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
import { AgreementAcceptanceView } from "@/features/compliance/agreement-acceptance-view";
import type { BillingCycle } from "@/store/services/billing-api";
import { billTitle, useGetMyTenancyDepositQuery, useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import {
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  useListMyTenanciesQuery,
  tenancyStatusLabel,
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
  // My Bills = everything still owed, grouped: numbered rent cycles vs one-off
  // bills (e.g. an early-exit penalty). Settled bills move to Past Bills.
  const payableBills = useMemo(() => cycles.filter((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE"), [cycles]);
  const rentBills = useMemo(() => payableBills.filter((cycle) => cycle.category === "RENT_CYCLE"), [payableBills]);
  const otherBills = useMemo(() => payableBills.filter((cycle) => cycle.category === "ONE_OFF"), [payableBills]);
  const pastBills = useMemo(() => cycles.filter((cycle) => cycle.status === "PAID" || cycle.status === "CANCELLED"), [cycles]);
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

  // Agreement gate: a pending tenancy exists but the tenant has not accepted
  // its terms yet — the acceptance screen replaces the whole tab until they do.
  if (activeTenancy && activeTenancy.tenancy.status === "PENDING_ACCEPTANCE") {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          title="Tenancy"
          italicTail="agreement."
          subtitle={`Review and accept the terms to begin your stay at ${activeTenancy.property.name}.`}
        />
        <AgreementAcceptanceView propertyName={activeTenancy.property.name} />
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
          <TenancyOverviewCard
            activeTenancy={activeTenancy}
            onViewAgreement={() => router.push("/tenancy-agreement-view")}
          />

          <Card style={{ display: "none" }}>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
              <IconBox icon={Home} />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text style={[type.eyebrow, { color: colors.kicker }]}>
                      Current tenancy
                    </Text>
                    <Text
                      style={{
                        color: colors.ink,
                        fontFamily: fonts.display,
                        fontSize: 24,
                        lineHeight: 29,
                      }}
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

          <Section title="My bills">
            {cyclesQuery.isFetching && cycles.length === 0 ? (
              <SkeletonCard />
            ) : payableBills.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No bills due"
                description="Bills to pay appear here. Rent cycles and any one-off charges are listed separately."
              />
            ) : (
              <>
                {rentBills.length > 0 ? (
                  <>
                    <BillGroupLabel text="Rent cycles" />
                    {rentBills.map((cycle) => (
                      <BillingCycleCard
                        key={cycle.id}
                        cycle={cycle}
                        onPress={() => router.push({ pathname: "/tenancy-billing-cycle", params: { cycleId: cycle.id, tenancyId: activeTenancy.tenancy.id } })}
                      />
                    ))}
                  </>
                ) : null}
                {otherBills.length > 0 ? (
                  <>
                    <BillGroupLabel text="Other bills" />
                    {otherBills.map((cycle) => (
                      <BillingCycleCard
                        key={cycle.id}
                        cycle={cycle}
                        onPress={() => router.push({ pathname: "/tenancy-billing-cycle", params: { cycleId: cycle.id, tenancyId: activeTenancy.tenancy.id } })}
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </Section>

          <Section title="Deposit snapshot">
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

          <Section title="Past bills">
            <ActionCard
              meta={`${pastBills.length} bill${pastBills.length === 1 ? "" : "s"}`}
              title="Past bills"
              description="Rent cycles and other bills you've settled, filterable by type — open any for its line items."
              onPress={() => router.push({ pathname: "/tenancy-billing-history", params: { tenancyId: activeTenancy.tenancy.id } })}
            />
          </Section>

          <Section title="Stay requests">
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
              description={
                activeTenancy.tenancy.fixedTerm
                  ? "Your agreement runs to a fixed date. Leaving earlier is reviewed as an early exit."
                  : "Serve your notice period and pick your last day. The property team reviews it."
              }
              onPress={() => router.push("/tenancy-exit-request")}
            />
          </Section>
        </>
      ) : (
        <EmptyState
          icon={DoorOpen}
          title="No current stay"
          description="Current tenancy and billing details appear when you have an active stay. Request history stays visible below."
        />
      )}

      <Section title="Tenancy requests">
        {exitRequestsQuery.isFetching ? (
          <SkeletonCard />
        ) : (
          <>
            {latestCurrentTenancyRequest ? <RequestHistoryCard request={latestCurrentTenancyRequest} /> : null}
            {activeTenancy ? (
              <ActionCard
                badge={currentTenancyRequests.filter((request) => request.status === "REQUESTED" || request.status === "APPROVED").length}
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
        <Section title="Tenancies">
          {tenanciesQuery.data.slice(0, 3).map((tenancy) => (
            <Card key={tenancy.id}>
              {/* The tenant's own view of their stay — the one place the
                  premature/normal distinction must never surface. */}
              <DetailLine label={tenancy.referenceCode} value={`${tenancyStatusLabel(tenancy.status)} · ${formatDate(tenancy.startDate)}${tenancy.endDate ? ` to ${formatDate(tenancy.endDate)}` : ""}`} />
            </Card>
          ))}
        </Section>
      ) : null}
    </ScreenScrollView>
  );
}

function TenancyOverviewCard({
  activeTenancy,
  onViewAgreement,
}: {
  activeTenancy: TenantActiveTenancy;
  onViewAgreement: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const rentAmount = activeTenancy.tenancy.rentAmountPaise ?? activeTenancy.tenancy.dailyRatePaise;

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <IconBox icon={Home} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            {/* Pill lives on the eyebrow row (plenty of width there) so long
                statuses like ON PREMATURE NOTICE never squash the title. */}
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Current tenancy
              </Text>
              <StatusPill
                label={humanizeToken(activeTenancy.tenancy.status)}
                tone={tenancyStatusTone(activeTenancy.tenancy.status)}
              />
            </View>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 26,
                letterSpacing: -0.3,
                lineHeight: 31,
              }}
            >
              {activeTenancy.property.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
              Room {activeTenancy.room.roomNumber}
              {activeTenancy.room.floor ? ` · ${formatFloor(activeTenancy.room.floor)}` : ""}
            </Text>
          </View>
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

        {true ? (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onViewAgreement}
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderRadius: 12,
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 2,
            }}
          >
            <FileSignature color={colors.primary} size={16} strokeWidth={2.2} />
            <Text style={{ color: colors.primary, flex: 1, fontFamily: fonts.sansBold, fontSize: 13, }}>
              Under agreement
            </Text>
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13, textDecorationLine: "underline" }}>
              View agreement
            </Text>
          </AnimatedPressable>
        ) : null}
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
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.ink, fontWeight: "900" }]}>
        {value}
      </Text>
    </View>
  );
}

function TenancyInfoRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
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

function BillGroupLabel({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.eyebrow, { color: colors.kicker }]}>
      {text}
    </Text>
  );
}

function BillingCycleCard({ cycle, onPress }: { cycle: BillingCycle; onPress: () => void }) {
  const { colors, type } = useTheme();
  const payable = cycle.status !== "PAID" && cycle.status !== "CANCELLED" && cycle.totalAmountPaise > 0;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label={billTitle(cycle)} value={formatMoney(cycle.totalAmountPaise)} hint={humanizeToken(cycle.status)} tone="primary" />
          <MetricTile label="Due" value={formatShortDate(cycle.rentDueDate)} hint={`${formatShortDate(cycle.periodStartDate)} to ${formatShortDate(cycle.periodEndDate)}`} />
        </View>
        <ActionCard
          meta={`${cycle.lineItems.length} item${cycle.lineItems.length === 1 ? "" : "s"}`}
          title="Open line items"
          description="View rent, deposit, discounts, extra charges and settlement actions for this bill."
          onPress={onPress}
        />
        {/* Rent is settled directly with the owner — the app records payments,
            it does not collect them. */}
        <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
          {payable
            ? "Pay your owner directly. They'll mark this bill paid once it's received."
            : cycle.status === "PAID"
              ? "This bill is already paid."
              : "Nothing to pay on this bill."}
        </Text>
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
        borderColor: colors.ink,
        borderWidth: 1,
        borderRadius: 14,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <Icon color={colors.ink} size={21} strokeWidth={2.4} />
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
    <Text style={[type.eyebrow, { color: colors.kicker }]}>
      {text}
    </Text>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.ink, flex: 1.25, fontWeight: "800", textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

function compareCycles(left: BillingCycle, right: BillingCycle) {
  return (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0);
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
