import { ExitTenancyIcon } from "@/components/artwork-icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
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
  IndianRupee,
  Info,
  KeyRound,
  LogOut,
  MapPin,
  ReceiptText,
} from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { PropertyArtwork } from "@/components/artwork-icon";
import { AlignedFieldRow, CardRule, FieldPair, FlatCard, ReadonlyField } from "@/components/field-card";
import { DirectionsButton } from "@/features/geo/directions-button";
import { PaymentWindowModal } from "@/features/billing/payment-window-modal";
import { BillStatusPill, BillTotal, formatDate as formatBillDate } from "@/features/owner/bill-views";
import { ActionButton } from "@/features/owner/owner-ui";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { SkeletonCard, SkeletonList, SkeletonTiles } from "@/components/skeleton";
import { TenantOnboardingSteps } from "@/features/compliance/tenant-onboarding-steps";
import { AlertModal } from "@/components/alert-modal";
import {
  REQUESTS_NOT_STARTED,
  TenancyStartsSoonBubble,
  tenancyNotStarted,
} from "@/features/tenancy/starts-soon-bubble";
import { useTenantCardUpdates } from "@/features/tenancy/use-tenant-card-updates";
import type { BillingCycle } from "@/store/services/billing-api";
import { billTitle, useGetMyTenancyDepositQuery, useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import type { ConcernSummary } from "@/store/services/concern-api";
import {
  splitTenantConcerns,
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
} from "@/store/services/concern-api";
import {
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  useListMyTenanciesQuery,
  tenancyStatusLabel,
  type TenancyStatus,
  type TenantActiveTenancy,
  type TenancyExitRequest,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { useAppSelector } from "@/store/hooks";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { buildExitRequestChains, buildRoomChangeRequestChains } from "@/features/tenancy/request-chain";
import {
  exitRequestBlock,
  pendingExitBlock,
  RequestBlockedModal,
  roomChangeRequestBlock,
  type RequestBlock,
} from "@/features/tenancy/request-blocked-modal";
import { formatFloor } from "@/features/property/floor";

// The same drawing the owner's Deposit manager tile carries on Home. A deposit
// is one thing across both sides of the app and should look like one thing.
const DEPOSIT_ARTWORK = require("../../assets/icons/home-tools/deposit-manager.png");
const BILLS_ARTWORK = require("../../assets/images/workspace/tenant-bills-header.png");
const REQUESTS_ARTWORK = require("../../assets/images/workspace/tenancy-module.png");
const CONCERNS_ARTWORK = require("../../assets/images/workspace/concern-module.png");

export default function TenancyScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ exitRequestCreated?: string; roomChangeRequested?: string }>();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
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
  const exitRequestsQuery = useListMyExitRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const roomChangeRequestsQuery = useListMyRoomChangeRequestsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const activeTenancy = activeTenancyQuery.data;
  const concernsQuery = useListMyCurrentConcernsQuery(undefined, {
    refetchOnMountOrArgChange: true,
    skip: !activeTenancy,
  });
  const concernHistoryQuery = useListMyConcernHistoryQuery(
    { page: 0, size: 200 },
    { refetchOnMountOrArgChange: true, skip: !activeTenancy },
  );
  const activeTenancyId = activeTenancy?.tenancy.id;
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(activeTenancyId ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !activeTenancyId,
  });
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

  const [requestBlock, setRequestBlock] = useState<RequestBlock | null>(null);
  /** Why a request cannot be raised before the stay starts, while shown. */
  const [notStartedMessage, setNotStartedMessage] = useState<string | null>(null);

  const currentTenancyRequests = useMemo(
    () => (activeTenancy ? mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data, activeTenancy.tenancy.id).sort(compareRequests) : []),
    [activeTenancy, exitRequestsQuery.data, roomChangeRequestsQuery.data],
  );
  const requestAvailabilityLoading = exitRequestsQuery.isFetching || roomChangeRequestsQuery.isFetching;

  function openRoomChangeRequest() {
    if (!activeTenancy) {
      return;
    }
    // Checked first, so the answer is immediate: nothing about open requests
    // matters before the stay has begun.
    if (tenancyNotStarted(activeTenancy.tenancy.startDate)) {
      setNotStartedMessage(REQUESTS_NOT_STARTED.roomChange);
      return;
    }
    if (requestAvailabilityLoading) {
      return;
    }
    const block = pendingExitBlock(activeTenancy.tenancy) ?? roomChangeRequestBlock(
      exitRequestsQuery.data,
      roomChangeRequestsQuery.data,
      activeTenancy.tenancy.id,
    );
    if (block) {
      setRequestBlock(block);
      return;
    }
    router.push("/tenancy-room-change-request");
  }

  function openExitRequest() {
    if (!activeTenancy) {
      return;
    }
    if (tenancyNotStarted(activeTenancy.tenancy.startDate)) {
      setNotStartedMessage(REQUESTS_NOT_STARTED.exit);
      return;
    }
    if (requestAvailabilityLoading) {
      return;
    }
    const block = pendingExitBlock(activeTenancy.tenancy) ?? exitRequestBlock(
      exitRequestsQuery.data,
      roomChangeRequestsQuery.data,
      activeTenancy.tenancy.id,
    );
    if (block) {
      setRequestBlock(block);
      return;
    }
    router.push("/tenancy-exit-request");
  }
  const pastTenancyRequests = useMemo(
    () =>
      mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data)
        .filter((request) => !activeTenancy || request.tenancyId !== activeTenancy.tenancy.id)
        .sort(compareRequests),
    [activeTenancy, exitRequestsQuery.data, roomChangeRequestsQuery.data],
  );
  const {
    closedCount: closedConcernCount,
    open: currentConcerns,
  } = useMemo(
    () => splitTenantConcerns(concernsQuery.data, concernHistoryQuery.data),
    [concernHistoryQuery.data, concernsQuery.data],
  );
  const trackedConcerns = useMemo(
    () => uniqueConcerns([...(concernsQuery.data ?? []), ...(concernHistoryQuery.data?.items ?? [])]),
    [concernHistoryQuery.data, concernsQuery.data],
  );
  const cardUpdates = useTenantCardUpdates({
    concerns: trackedConcerns,
    concernsReady:
      concernsQuery.isSuccess &&
      concernHistoryQuery.isSuccess &&
      !concernsQuery.isFetching &&
      !concernHistoryQuery.isFetching,
    requests: currentTenancyRequests,
    requestsReady:
      exitRequestsQuery.isSuccess &&
      roomChangeRequestsQuery.isSuccess &&
      !exitRequestsQuery.isFetching &&
      !roomChangeRequestsQuery.isFetching,
    scopeKey:
      currentUserId && activeTenancyId
        ? currentUserId + "." + activeTenancyId
        : null,
  });

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
      /* Three steps rather than one page: reading the contract, proving who
         you are, and signing are different kinds of work, and the last waits on
         the second. The flow owns the whole screen, including its own scroller,
         so its step bar can stay pinned while the agreement scrolls under it. */
      <TenantOnboardingSteps propertyName={activeTenancy.property.name} />
    );
  }

  // A signed future monthly booking is not a current stay yet. Do not offer
  // bills, room changes, exit requests, or the occupied-room overview until
  // the approved outgoing move and chosen start date have both arrived.
  if (activeTenancy && activeTenancy.tenancy.status === "SCHEDULED") {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          title="Your stay"
          italicTail="booking."
          subtitle="Your agreement is signed. Your stay begins on its scheduled date."
        />
        <Card style={{ gap: spacing.md }}>
          <Text style={[type.display, { color: colors.ink, fontSize: 22 }]}>Booked for {formatDate(activeTenancy.tenancy.startDate)}</Text>
          <Text style={[type.body, { color: colors.muted }]}>
            {activeTenancy.property.name} · Room {activeTenancy.room.roomNumber}
          </Text>
          <Text style={[type.description, { color: colors.muted }]}>
            Your agreement is complete. The room becomes available after the approved room change; your stay and billing begin on your start date, not today.
          </Text>
        </Card>
        <ActionCard
          meta="Signed agreement"
          title="View your agreement"
          description="Keep a copy of the terms for your upcoming stay."
          onPress={() => router.push("/tenancy-agreement-view")}
        />
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

          {/* A door to the bills, no bill card above it (user, 2026-09-27).
              Paying happens on My Bills, where every bill of the month is. */}
          <Section title="Bills & Deposit">
            <AllBillsCard
              dueNowPaise={payableBills.reduce((total, cycle) => total + cycle.totalAmountPaise, 0)}
              // Red while anything is waiting on the tenant to pay. Confirming
              // is with the owner, and upcoming is not payable yet.
              hasUnpaid={payableBills.some((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE")}
              onPress={() => {
                router.push({ pathname: "/tenancy-bills", params: { tenancyId: activeTenancy.tenancy.id } });
              }}
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
              // The same card as an open deposit, so the row does not change
              // shape the day it opens. Nothing to open yet, so no chevron.
              <EntryCard artwork={DEPOSIT_ARTWORK} label="Deposit account" value="Not opened yet" />
            )}
          </Section>

          {/* Two tiles, not two full cards. Choosing between a room change and
              an exit is one decision with two answers, and a paragraph under
              each was explaining a screen that explains itself. */}
          <Section title="Raise a request">
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <RequestTile
                disabled={requestAvailabilityLoading}
                icon={ArrowLeftRight}
                label="Room change"
                onPress={openRoomChangeRequest}
              />
              <RequestTile
                disabled={requestAvailabilityLoading}
                icon={ExitTenancyIcon}
                label="Exit request"
                onPress={openExitRequest}
              />
            </View>

            <StayRequestsCard
              hasUpdate={cardUpdates.requestUpdate}
              onPress={() => {
                cardUpdates.markRequestsSeen();
                router.push({
                  pathname: "/tenancy-request-history",
                  params: { scope: "current", tenancyId: activeTenancy.tenancy.id },
                });
              }}
            />
          </Section>

          <Section title="Concerns">
            {(concernsQuery.isFetching && !concernsQuery.data) ||
            (concernHistoryQuery.isFetching && !concernHistoryQuery.data) ? (
              <SkeletonCard />
            ) : (
              <TenantConcernsCard
                closedCount={closedConcernCount}
                hasUpdate={cardUpdates.concernUpdate}
                onPress={() => {
                  cardUpdates.markConcernsSeen();
                  router.push("/concerns");
                }}
                openCount={currentConcerns.length}
                totalCount={currentConcerns.length + closedConcernCount}
              />
            )}
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

      {notStartedMessage ? (
        <AlertModal message={notStartedMessage} onClose={() => setNotStartedMessage(null)} tone="info" />
      ) : null}

      {requestBlock ? (
        <RequestBlockedModal
          block={requestBlock}
          onClose={() => setRequestBlock(null)}
          onViewRequests={() => {
            const tenancyId = activeTenancy?.tenancy.id;
            setRequestBlock(null);
            if (!tenancyId) {
              return;
            }
            cardUpdates.markRequestsSeen();
            router.push({
              pathname: "/tenancy-request-history",
              params: { scope: "current", tenancyId },
            });
          }}
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
          {/* One identity row: the label belongs to the property name, while
              the live tenancy state stays visible at the trailing edge. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <PropertyArtwork size={24} />
            {/* No "Current stay" eyebrow (user, 2026-09-27): the name alone. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}
              >
                {activeTenancy.property.name}
              </Text>
            </View>
            {/* Hidden before the start date. "Active" there is the record's
                status, not the tenant's reality, and the bubble below already
                says when it begins. */}
            {tenancyNotStarted(activeTenancy.tenancy.startDate) ? null : (
              <TenancyStatusPill status={activeTenancy.tenancy.status} />
            )}
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
        <TenancyStat
          icon={CalendarDays}
          label="Ending"
          value={activeTenancy.tenancy.checkoutDate || activeTenancy.tenancy.agreementEndDate
            ? formatDate(activeTenancy.tenancy.checkoutDate ?? activeTenancy.tenancy.agreementEndDate!)
            : "----"}
        />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TenancyStat icon={ReceiptText} label="Billing" value={humanizeToken(activeTenancy.tenancy.billingType)} />
        <TenancyStat
          icon={FileSignature}
          label="Agreement"
          value={activeTenancy.tenancy.agreementValidityMonths != null
            ? `${activeTenancy.tenancy.agreementValidityMonths} ${activeTenancy.tenancy.agreementValidityMonths === 1 ? "month" : "months"}`
            : "Indefinite"}
        />
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

      {/* Before the start date only. Nothing renders once the stay has begun. */}
      <TenancyStartsSoonBubble startDate={activeTenancy.tenancy.startDate} />

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
        {tenancyStatusLabel(status as TenancyStatus)}
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
  hasUnpaid,
  onPress,
  payableCount,
  totalCount,
}: {
  dueNowPaise: number;
  hasUnpaid: boolean;
  onPress: () => void;
  payableCount: number;
  totalCount: number;
}) {
  const { colors, fonts, type } = useTheme();
  const owing = payableCount > 0;

  return (
    <View
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
      {/* Only the header navigates. The metrics below remain readable, static data. */}
      <AnimatedPressable
        accessibilityLabel={`View your bills. ${totalCount} bill${totalCount === 1 ? "" : "s"}, ${payableCount} to pay, ${formatMoney(dueNowPaise)} due.`}
        accessibilityRole="button"
        onPress={onPress}
        style={{ alignItems: "center", borderRadius: radii.lg, flexDirection: "row", gap: spacing.md }}
      >
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>All bills on this stay</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            My Bills
          </Text>
        </View>
        <SummaryChevron hasUpdate={hasUnpaid} />
      </AnimatedPressable>

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
    </View>
  );
}

function StayRequestsCard({
  hasUpdate,
  onPress,
}: {
  hasUpdate: boolean;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        padding: spacing.md,
      }}
    >
      <AnimatedPressable
        accessibilityLabel="View your requests"
        accessibilityRole="button"
        onPress={onPress}
        style={{ alignItems: "center", borderRadius: radii.lg, flexDirection: "row", gap: spacing.md }}
      >
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={REQUESTS_ARTWORK}
          style={{ height: 48, width: 64 }}
        />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>On this stay</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            My Requests
          </Text>
        </View>
        <SummaryChevron hasUpdate={hasUpdate} />
      </AnimatedPressable>
    </View>
  );
}

function TenantConcernsCard({
  closedCount,
  hasUpdate,
  onPress,
  openCount,
  totalCount,
}: {
  closedCount: number;
  hasUpdate: boolean;
  onPress: () => void;
  openCount: number;
  totalCount: number;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
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
      <AnimatedPressable
        accessibilityLabel="View your concerns"
        accessibilityRole="button"
        onPress={onPress}
        style={{ alignItems: "center", borderRadius: radii.lg, flexDirection: "row", gap: spacing.md }}
      >
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={CONCERNS_ARTWORK}
          style={{ height: 50, width: 58 }}
        />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>On this stay</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            My Concerns
          </Text>
        </View>
        <SummaryChevron hasUpdate={hasUpdate} />
      </AnimatedPressable>

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      <View style={{ flexDirection: "row" }}>
        <ConcernStat label="Open" value={String(openCount)} />
        <ConcernStat divided label="Closed" value={String(closedCount)} />
        <ConcernStat divided label="Total" value={String(totalCount)} />
      </View>
    </View>
  );
}

function SummaryChevron({ hasUpdate }: { hasUpdate?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        height: 34,
        justifyContent: "center",
        width: 34,
      }}
    >
      <ChevronRight color={colors.muted} size={17} strokeWidth={2.3} />
      {hasUpdate ? (
        <View
          pointerEvents="none"
          style={{
            backgroundColor: colors.danger,
            borderColor: colors.surface,
            borderRadius: 999,
            borderWidth: 2,
            height: 10,
            position: "absolute",
            right: -2,
            top: -2,
            width: 10,
          }}
        />
      ) : null}
    </View>
  );
}

function ConcernStat({
  divided,
  label,
  value,
}: {
  divided?: boolean;
  label: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        borderLeftColor: colors.border,
        borderLeftWidth: divided ? 1 : 0,
        flex: 1,
        gap: 1,
        minWidth: 0,
        paddingHorizontal: spacing.xs,
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17, textAlign: "left" }}>{value}</Text>
      <Text style={[type.caption, { color: colors.kicker, textAlign: "left" }]}>{label}</Text>
    </View>
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
  /** Absent when there is nothing behind the card yet: no chevron, muted value. */
  onPress?: () => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const cardStyle = {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  } as const;
  const content = (
    <>
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
        <Text
          numberOfLines={1}
          style={{ color: onPress ? colors.ink : colors.muted, fontFamily: fonts.sansBold, fontSize: 17 }}
        >
          {value}
        </Text>
      </View>
      {onPress ? <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={`${label}, ${value}`} style={cardStyle}>
        {content}
      </View>
    );
  }
  return (
    <AnimatedPressable accessibilityLabel={`${label}, ${value}`} accessibilityRole="button" onPress={onPress} style={cardStyle}>
      {content}
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
  disabled = false,
  icon: Icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: typeof CalendarDays;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
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
        opacity: disabled ? 0.55 : 1,
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
  if (status === "PENDING_EXIT") {
    return "danger";
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
  const exits = buildExitRequestChains(exitRequests)
    .map((chain) => chain.head)
    .filter((request) => !tenancyId || request.tenancyId === tenancyId)
    .map((request) => ({ ...request, requestKind: "EXIT" as const }));
  const roomChanges = buildRoomChangeRequestChains(roomChangeRequests)
    .map((chain) => chain.head)
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

function humanizeToken(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function uniqueConcerns(concerns: ConcernSummary[]) {
  const seen = new Set<string>();
  return concerns.filter((concern) => {
    if (seen.has(concern.id)) return false;
    seen.add(concern.id);
    return true;
  });
}
