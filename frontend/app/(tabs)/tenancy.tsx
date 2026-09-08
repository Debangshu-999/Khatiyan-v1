import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  ArrowLeftRight,
  Banknote,
  BedDouble,
  CalendarDays,
  ChevronRight,
  DoorOpen,
  FileSignature,
  History,
  Inbox,
  IndianRupee,
  Info,
  KeyRound,
  MapPin,
  ReceiptText,
} from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { PropertyArtwork } from "@/components/artwork-icon";
import { AlignedFieldRow, CardRule, FieldPair, FlatCard, ReadonlyField } from "@/components/field-card";
import { DirectionsButton } from "@/features/geo/directions-button";
import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { BillPaymentIntentsSheet } from "@/features/billing/bill-payment-intents-sheet";
import { PayBillSheet } from "@/features/billing/pay-bill-sheet";
import { PaymentDecisionModal } from "@/features/billing/payment-decision-modal";
import { PaymentWindowModal } from "@/features/billing/payment-window-modal";
import { TenantBillReceiptSheet } from "@/features/billing/tenant-bill-receipt-sheet";
import { BillStatusPill, BillTotal, formatDate as formatBillDate } from "@/features/owner/bill-views";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  useGetMyPaymentStateQuery,
  useListMyLivePaymentIntentsQuery,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { TenantBillCard } from "@/features/billing/tenant-bill-card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { SkeletonCard, SkeletonList, SkeletonTiles } from "@/components/skeleton";
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
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The same drawing the owner's Deposit manager tile carries on Home. A deposit
// is one thing across both sides of the app and should look like one thing.
const DEPOSIT_ARTWORK = require("../../assets/home-tools/deposit-manager.png");
const BILLS_ARTWORK = require("../../assets/workspace/tenant-bills-header.png");
const NO_BILL_ILLUSTRATION = require("../../assets/workspace/No-Bill_512x436.png");

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
  // CONFIRMATION_PENDING belongs here too. It is neither payable nor settled, so
  // leaving it out of both lists made a bill DISAPPEAR the moment its tenant
  // claimed they had paid it — the one moment they are most likely to look.
  const payableBills = useMemo(
    () =>
      cycles.filter(
        (cycle) =>
          cycle.status === "UNPAID" || cycle.status === "OVERDUE" || cycle.status === "CONFIRMATION_PENDING",
      ),
    [cycles],
  );
  const rentBills = useMemo(() => payableBills.filter((cycle) => cycle.category === "RENT_CYCLE"), [payableBills]);
  const otherBills = useMemo(() => payableBills.filter((cycle) => cycle.category === "ONE_OFF"), [payableBills]);
  const pastBills = useMemo(() => cycles.filter((cycle) => cycle.status === "PAID" || cycle.status === "CANCELLED"), [cycles]);

  /**
   * The rent cycle the tenant is living in, paid or not.
   *
   * <p>
   * One cycle, not a list. A tenant has exactly one rent question at a time —
   * "am I straight this month" — and the whole ledger behind a card answers
   * every other one. An unpaid cycle wins over a paid one because it is the one
   * that still needs something; with none unpaid, the latest settled cycle is
   * the answer, and showing it rather than an empty state is the difference
   * between "you are paid up" and "there is nothing here".
   *
   * <p>UPCOMING is excluded. It is not yet payable, and leading with a bill
   * nobody can act on would bury the one they can.
   */
  const currentRentCycle = useMemo(() => {
    const live = cycles.filter((cycle) => cycle.category === "RENT_CYCLE" && cycle.status !== "UPCOMING");
    return (
      live.find(
        (cycle) =>
          cycle.status === "UNPAID" || cycle.status === "OVERDUE" || cycle.status === "CONFIRMATION_PENDING",
      ) ?? live[0] ?? null
    );
  }, [cycles]);

  const [viewingBill, setViewingBill] = useState<BillingCycle | null>(null);
  const [payingBill, setPayingBill] = useState<BillingCycle | null>(null);
  /** The bill whose attempt history is open. */
  const [viewingIntents, setViewingIntents] = useState<BillingCycle | null>(null);
  /** The attempt whose outcome we are asking about, from a fresh or open one. */
  const [deciding, setDeciding] = useState<PaymentIntent | null>(null);

  // One bill at a time: the state is only ever read for the bill being paid, so
  // there is no reason to ask about the others.
  const paymentStateQuery = useGetMyPaymentStateQuery(payingBill?.id ?? "", { skip: !payingBill });
  const paymentState = paymentStateQuery.data;

  /**
   * Live attempts across the whole stay, in one call.
   *
   * <p>Every card needs to know whether ITS bill has an attempt open, and the
   * per-bill payment-state query only ever runs for the bill being paid — so
   * without this a card had no way to lock its own button.
   */
  const liveIntentsQuery = useListMyLivePaymentIntentsQuery(activeTenancy?.tenancy.id ?? "", {
    skip: !activeTenancy,
  });
  const liveIntentByCycle = useMemo(() => {
    const byCycle = new Map<string, PaymentIntent>();
    for (const intent of liveIntentsQuery.data ?? []) {
      byCycle.set(intent.billingCycleId, intent);
    }
    return byCycle;
  }, [liveIntentsQuery.data]);

  /**
   * Asks about an unanswered attempt as soon as the screen is open.
   *
   * <p>The question used to wait for the tenant to press Pay again — which they
   * have no reason to do, since the button is locked precisely because the
   * attempt is unanswered. So the bill sat blocked with the way to unblock it
   * hidden behind the blocked control.
   *
   * <p>Only CREATED. A TENANT_CONFIRMED attempt is with the owner and there is
   * nothing left for the tenant to answer.
   */
  const askedAboutRef = useRef<string | null>(null);

  /**
   * Opens the question and records that it was asked.
   *
   * <p>Every route to the modal goes through here — the effect below, the card's
   * button, and the pay sheet handing over a just-created attempt. Stamping the
   * id only in the effect would let a dismissal bounce straight back: the effect
   * would see an intent it had never marked and re-open it.
   */
  const askAbout = useCallback((intent: PaymentIntent) => {
    askedAboutRef.current = intent.id;
    setDeciding(intent);
  }, []);

  useEffect(() => {
    if (deciding || payingBill) {
      return;
    }
    const unanswered = (liveIntentsQuery.data ?? []).find((intent) => intent.status === "CREATED");
    // By id, not a plain "asked already" flag: dismissing the question must not
    // bring it straight back, but a DIFFERENT attempt opened later is a new
    // question and has to be asked.
    if (unanswered && askedAboutRef.current !== unanswered.id) {
      askAbout(unanswered);
    }
  }, [askAbout, deciding, liveIntentsQuery.data, payingBill]);

  /**
   * Whether this bill can be paid right now, and what happens when it is.
   *
   * <p>Null hides the Pay button rather than greying it: a bill already claimed
   * has nothing to press, and one on a property with no UPI set up never had a
   * button to begin with.
   */
  function payHandlerFor(cycle: BillingCycle) {
    if (cycle.status === "CONFIRMATION_PENDING") {
      return null;
    }
    // Locked while an attempt is open on THIS bill. The lock is per bill, not
    // per tenant — an open attempt on one bill must not stop a tenant paying a
    // different one.
    const openAttempt = liveIntentByCycle.get(cycle.id);
    if (openAttempt) {
      // TENANT_CONFIRMED is with the owner — there is nothing to answer, so no
      // button at all rather than one that reopens a question already answered.
      return openAttempt.status === "CREATED" ? () => askAbout(openAttempt) : null;
    }
    return () => setPayingBill(cycle);
  }
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
  // What the entry card counts: anything still moving. A decided request is
  // history, and history is what the screen behind the card is for.
  const openRequestCount = currentTenancyRequests.filter(
    (request) => request.status === "REQUESTED" || request.status === "APPROVED",
  ).length;

  if (activeTenancyQuery.isFetching && !activeTenancy) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          title="Your stay"
          italicTail="ledger."
          subtitle="Tenancy profile, billing, deposit and requests."
        />
        <SkeletonCard />
        <SkeletonTiles count={4} />
        <SkeletonList rows={2} />
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

          {/* The current cycle and a door to the rest. There were filters here
              and every payable bill under them, which made the tab a billing
              screen with a tenancy summary on top — and the bill that matters
              today sat in a list with bills that do not. */}
          <Section title="Bills & Deposit">
            {cyclesQuery.isFetching && cycles.length === 0 ? (
              <SkeletonCard />
            ) : currentRentCycle ? (
              <TenantBillCard
                cycle={currentRentCycle}
                onPay={payHandlerFor(currentRentCycle)}
                onViewBill={() => setViewingBill(currentRentCycle)}
                onViewIntents={() => setViewingIntents(currentRentCycle)}
                openAttempt={liveIntentByCycle.get(currentRentCycle.id) ?? null}
              />
            ) : (
              <EmptyState
                artwork={NO_BILL_ILLUSTRATION}
                title="No rent cycle yet"
                description="Your first cycle appears once the stay is billed."
              />
            )}

            <AllBillsCard
              dueNowPaise={payableBills.reduce((total, cycle) => total + cycle.totalAmountPaise, 0)}
              onPress={() => router.push({ pathname: "/tenancy-bills", params: { tenancyId: activeTenancy.tenancy.id } })}
              payableCount={payableBills.length}
              totalCount={cycles.length}
            />

            {/* In with the bills rather than in a section of its own. A deposit
                is money on this stay like every other row here, and one card
                under its own heading read as a feature rather than a figure.
                One card, not two tiles and a button: the balance IS the
                snapshot, and the ledger it opens is where a movement count
                belongs — printed out here it was a number nobody can act on. */}
            {depositQuery.isFetching ? (
              <SkeletonCard />
            ) : depositQuery.data ? (
              <EntryCard
                artwork={DEPOSIT_ARTWORK}
                label="Deposit balance"
                onPress={() => router.push({ pathname: "/tenancy-deposit", params: { tenancyId: activeTenancy.tenancy.id } })}
                value={formatMoney(depositQuery.data.currentBalancePaise)}
              />
            ) : (
              <ActionCard
                meta="Deposit"
                title="Deposit not opened yet"
                description="Deposit account opens after the first eligible billing cycle is completed."
              />
            )}
          </Section>

          {/* Two tiles, not two full cards. Choosing between a room change and
              an exit is one decision with two answers, and a paragraph under
              each was explaining a screen that explains itself. */}
          <Section title="Raise a request">
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <RequestTile
                icon={ArrowLeftRight}
                label="Room change"
                onPress={() => router.push("/tenancy-room-change-request")}
              />
              <RequestTile
                icon={DoorOpen}
                label="Exit request"
                onPress={() => router.push("/tenancy-exit-request")}
              />
            </View>
          </Section>

          <Section title="Tenancy requests">
            <EntryCard
              icon={Inbox}
              label="On this stay"
              onPress={() =>
                router.push({
                  pathname: "/tenancy-request-history",
                  params: { scope: "current", tenancyId: activeTenancy.tenancy.id },
                })
              }
              value={`${openRequestCount} open`}
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

      {/* Only without a stay. With one, requests live behind the card above —
          the same history, reached from the tenancy it belongs to rather than
          from a second list further down the same screen. */}
      {!activeTenancy ? (
        <Section title="Request history">
          <ActionCard
            meta={`${pastTenancyRequests.length} request${pastTenancyRequests.length === 1 ? "" : "s"}`}
            title="View request history"
            description="Exit and room-change requests from stays that have ended."
            onPress={() => router.push({ pathname: "/tenancy-request-history", params: { scope: "past" } })}
          />
        </Section>
      ) : null}

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

      {viewingBill ? (
        <TenantBillReceiptSheet
          cycle={viewingBill}
          onClose={() => setViewingBill(null)}
          property={activeTenancy?.property ?? null}
        />
      ) : null}

      {/* The tap always leads somewhere. Between setting the bill and the state
          arriving there is a real gap, and a Pay button that does nothing for a
          beat reads as broken — so the sheet opens on a spinner rather than
          waiting to exist. */}
      {payingBill && paymentStateQuery.isLoading ? (
        <SheetShell onClose={() => setPayingBill(null)} title="Pay">
          <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </SheetShell>
      ) : null}

      {/* Nothing set up to pay to. Told plainly instead of leaving the tap dead
          — the tenant has done nothing wrong and needs to know to pay directly. */}
      {payingBill && paymentState && !paymentState.upiAvailable ? (
        <AlertModal
          message="This property has not set up online payment yet. Pay them directly and they will record it."
          onClose={() => setPayingBill(null)}
        />
      ) : null}

      {payingBill && paymentState?.payee ? (
        <PayBillSheet
          amountPaise={payingBill.totalAmountPaise}
          billingCycleId={payingBill.id}
          hasPayLink={paymentState.payLinkAvailable}
          onClose={() => setPayingBill(null)}
          onStarted={(intent) => {
            setPayingBill(null);
            askAbout(intent);
          }}
          payee={paymentState.payee}
          referenceCode={payingBill.referenceCode}
        />
      ) : null}

      {viewingIntents ? (
        <BillPaymentIntentsSheet
          cycle={viewingIntents}
          onClose={() => setViewingIntents(null)}
          onResolve={(intent) => {
            // Closed first. Two Android modals opening in the same frame race
            // each other, and the sheet is the one being left behind.
            setViewingIntents(null);
            askAbout(intent);
          }}
        />
      ) : null}

      {/* One decision modal, whatever opened it — a payment just started, the
          re-ask on open, the card's button, or Resolve in the attempts sheet.
          The old second copy asked again when Pay was pressed, which is a
          button the tenant has no reason to press while an attempt is open and
          is now locked anyway. */}
      {deciding ? (
        <PaymentDecisionModal
          intent={deciding}
          onClose={() => setDeciding(null)}
          onSettled={() => setDeciding(null)}
        />
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
    <>
      {/* FOUR cards, not one card with three boxes drawn inside it. Nesting a
          bordered block in a bordered block draws two frames around one fact,
          and the stay reads as a stack of separate things anyway: where you
          live, when it began, what it costs, what you signed. */}
      {/* The owner's Manage card, on the tenant's side of the app: mark and
          name on one row, pin and full postal address on the next. One property
          should look like one property whichever account is holding the phone,
          and this side had drifted into its own layout — a bigger name, no
          mark, and a room number where the address goes.
          <p>The eyebrow is the one addition. The owner's card sits under a
          screen heading that already says what it is; this one leads the tab. */}
      <Card>
        <View style={{ gap: spacing.sm }}>
          {/* The pill sits on the eyebrow row, which has width to spare, so a
              long status like ON PREMATURE NOTICE never squashes the name. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Current tenancy
            </Text>
            <TenancyStatusPill status={activeTenancy.tenancy.status} />
          </View>

          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <PropertyArtwork size={24} />
            <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 22, lineHeight: 27 }]}>
              {activeTenancy.property.name}
            </Text>
          </View>

          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ alignItems: "center", width: 24 }}>
              <MapPin color={colors.muted} size={18} strokeWidth={1.9} />
            </View>
            <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
              {[
                activeTenancy.property.address,
                activeTenancy.property.city,
                activeTenancy.property.state,
                activeTenancy.property.pincode,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
            {/* The same control the discovery listing carries, so getting to a
                property you are considering and getting to the one you live in
                are the same button. No stored maps link on this side — the
                tenant's property summary does not carry one — so it searches
                the address it is showing. */}
            <DirectionsButton
              parts={[
                activeTenancy.property.address,
                activeTenancy.property.city,
                activeTenancy.property.state,
                activeTenancy.property.pincode,
              ]}
            />
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TenancyStat icon={CalendarDays} label="Started" value={formatDate(activeTenancy.tenancy.startDate)} />
        <TenancyStat icon={ReceiptText} label="Billing" value={humanizeToken(activeTenancy.tenancy.billingType)} />
      </View>

      {/* The owner's field card, rows and type scale unchanged: a muted
          caption label with a 15pt bold value under it, rules inset from the
          card's corners. This side had its own scale — a 16pt heading, a 20pt
          blue figure, 900-weight values pushed to the right margin — so the same
          stay read as two different records depending on who opened it.
          <p>Rent and room share one ruled pair. They are both facts about where
          the money goes, and each on its own row left the card three rows tall
          to say two things. Tenancy ID keeps a row to itself: it is the string a
          tenant is asked to quote, and in half a row the mono code came back
          shrunk. Property location has gone — the address is on the card above,
          in full, and printing the city again under it was the same fact
          twice. */}
      <FlatCard>
        <FieldPair
          left={<ReadonlyField icon={IndianRupee} label="Room rent" value={formatOptionalMoney(rentAmount)} />}
          right={
            <ReadonlyField
              icon={BedDouble}
              label="Room / Floor"
              value={`${activeTenancy.room.roomNumber}${
                activeTenancy.room.floor ? ` · ${formatFloor(activeTenancy.room.floor)}` : ""
              }`}
            />
          }
        />
        <CardRule />
        {/* One line, in the pair's own columns — so the code starts exactly
            under "101 · Floor 1" rather than at the card's right margin. */}
        <AlignedFieldRow copyable icon={KeyRound} label="Tenancy ID" mono value={activeTenancy.tenancy.referenceCode} />
      </FlatCard>

        {/* Bordered, not filled. A pale blue ground is banned app-wide — blue
            survives here as the glyph and the label. */}
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onViewAgreement}
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
          }}
        >
          <FileSignature color={colors.primary} size={16} strokeWidth={2.2} />
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13 }}>
            Under agreement
          </Text>
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>
            View
          </Text>
          <ChevronRight color={colors.primary} size={16} strokeWidth={2.3} />
        </AnimatedPressable>
    </>
  );
}

/**
 * The stay's status, with a dot.
 *
 * <p>
 * The app's shared {@code StatusPill} is deliberately dotless — tint and word,
 * nothing else — and every other pill in the app stays that way. This one is
 * the exception the user asked for: it is the single most-looked-at fact on the
 * tenant's own screen, and a dot reads as a live indicator in a way a tinted
 * word does not.
 *
 * <p>
 * Sentence case, not caps, for the same reason. "Active" is a state the reader
 * is in, and shouting it makes it a label about them.
 */
function TenancyStatusPill({ status }: { status: string }) {
  const { colors, fonts } = useTheme();
  const tone = tenancyStatusTone(status);
  const dot =
    tone === "success" ? colors.jade : tone === "warning" ? colors.warningText : colors.muted;
  const background =
    tone === "success" ? colors.successSoft : tone === "warning" ? colors.warningSoft : colors.neutralSoft;
  const text =
    tone === "success" ? colors.successText : tone === "warning" ? colors.warningText : colors.neutralText;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: background,
        borderRadius: 999,
        flexDirection: "row",
        flexShrink: 1,
        gap: 6,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <View style={{ backgroundColor: dot, borderRadius: 999, height: 7, width: 7 }} />
      <Text numberOfLines={1} style={{ color: text, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {humanizeToken(status)}
      </Text>
    </View>
  );
}

/**
 * A section that is really a doorway: one figure and a chevron.
 *
 * <p>
 * Used where the tab used to carry a summary AND a button to the screen that
 * summarises it properly. The number here is the one a tenant would open the
 * screen to check — a balance, a count of open requests — and everything else
 * waits on the other side rather than being previewed badly out here.
 */
/**
 * The door to every bill on the stay.
 *
 * <p>
 * It used to be one line — "3 to pay", or "12 bills" when nothing was owed —
 * which is two different facts taking turns in the same slot. A reader with
 * nothing outstanding saw a total, a reader with something outstanding saw a
 * count of the outstanding, and neither could tell which they were looking at
 * without already knowing the answer.
 *
 * <p>
 * So all three are stated at once and each is labelled: how many bills there
 * are, how many are still to pay, and what that comes to. A strip of stats
 * rather than a headline, because none of the three is more important than the
 * others — the money is what a tenant acts on, the counts are what they check.
 */
function AllBillsCard({
  dueNowPaise,
  onPress,
  payableCount,
  totalCount,
}: {
  dueNowPaise: number;
  onPress: () => void;
  payableCount: number;
  totalCount: number;
}) {
  const { colors, fonts, type } = useTheme();
  const owing = payableCount > 0;

  return (
    <AnimatedPressable
      accessibilityLabel={`All bills. ${totalCount} bill${totalCount === 1 ? "" : "s"}, ${payableCount} to pay, ${formatMoney(dueNowPaise)} due.`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {/* The title row: what this is, and that it goes somewhere. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* Landscape, so a wider box than a square: `contain` fits to the
            narrower side, and a 3:2 image in a square renders two thirds the
            height and reads as a shrunken version of itself. */}
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={BILLS_ARTWORK}
          style={{ height: 44, width: 64 }}
        />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>All bills</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            Every bill on this stay
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
      </View>

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      {/* Three columns, divided by hairlines rather than spaced apart: without
          the rules the labels drift under the wrong numbers on a narrow phone. */}
      <View style={{ flexDirection: "row" }}>
        <BillStat label="Bills" value={String(totalCount)} />
        <BillStat
          divided
          label="To pay"
          tone={owing ? colors.danger : colors.ink}
          value={String(payableCount)}
        />
        <BillStat divided label="Due now" tone={owing ? colors.danger : colors.ink} value={formatMoney(dueNowPaise)} />
      </View>
    </AnimatedPressable>
  );
}

/** One column of the bills strip: the number, and what it counts. */
function BillStat({
  divided,
  label,
  tone,
  value,
}: {
  /** A hairline on the leading edge — every column but the first. */
  divided?: boolean;
  label: string;
  tone?: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        borderLeftColor: colors.border,
        borderLeftWidth: divided ? 1 : 0,
        flex: 1,
        gap: 2,
        minWidth: 0,
        paddingLeft: divided ? spacing.sm : 0,
      }}
    >
      <Text numberOfLines={1} style={{ color: tone ?? colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]}>{label}</Text>
    </View>
  );
}

function EntryCard({
  artwork,
  icon: Icon,
  label,
  onPress,
  value,
}: {
  /** A drawing rather than a glyph, where the module already has one. */
  artwork?: ImageSourcePropType;
  icon?: typeof CalendarDays;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {artwork ? (
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={artwork}
          style={{ height: 38, width: 38 }}
        />
      ) : Icon ? (
        <Icon color={colors.primary} size={26} strokeWidth={2} />
      ) : null}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>{label}</Text>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>
          {value}
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

/**
 * One of the two things a tenant can ask for.
 *
 * <p>A tile rather than a card with a paragraph. The two are alternatives to
 * each other, and side by side they read as one question — which is what they
 * are — where two stacked cards read as two unrelated features.
 */
function RequestTile({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof CalendarDays;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.primary} size={22} strokeWidth={2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
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
        // A card in its own right now rather than a block inside one, so it
        // takes the card's surface and border instead of the sunken tone that
        // said "nested".
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      {/* Beside the label, not above it — the arrangement every other metric
          tile in the app was changed to. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Icon color={colors.primary} size={17} strokeWidth={2.3} />
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {label}
        </Text>
      </View>
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


/** What the Pay button says, which is always the next thing to do about it. */

type TenantRequestHistoryItem =
  | (TenancyExitRequest & { requestKind: "EXIT" })
  | (TenancyRoomChangeRequest & { requestKind: "ROOM_CHANGE" });

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
