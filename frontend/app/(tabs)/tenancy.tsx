import { CardNameRow, CardStatus, cardText, smallerCardText } from "@/components/card-name-row";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ExitTenancyIcon } from "@/components/artwork-icon";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  REQUESTS_NOT_STARTED,
  TenancyStartsSoonBubble,
  tenancyNotStarted,
} from "@/features/tenancy/starts-soon-bubble";
import {
  useGetMoveInChecklistQuery,
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
import { formatFloor } from "@/features/property/floor";
import { FitText } from "@/components/fit-text";
import { compareRequests, formatMoney, mergedRequests } from "@/features/tenancy/tenant-tool-cards";
import { FactColumn, PropertyStayCard } from "@/features/tenancy/request-form-cards";
import { AgreementHeroCard, MoveInChecklistCard, RoommatesCard, StayTimelineCard } from "@/features/tenancy/stay-overview-cards";

// The same drawing the owner's Deposit manager tile carries on Home. A deposit
// is one thing across both sides of the app and should look like one thing.

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
  const exitRequestsQuery = useListMyExitRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const roomChangeRequestsQuery = useListMyRoomChangeRequestsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const activeTenancy = activeTenancyQuery.data;
  const moveInQuery = useGetMoveInChecklistQuery(activeTenancy?.tenancy.id ?? "", { skip: !activeTenancy });
  const pastTenancyRequests = useMemo(
    () =>
      mergedRequests(exitRequestsQuery.data, roomChangeRequestsQuery.data)
        .filter((request) => !activeTenancy || request.tenancyId !== activeTenancy.tenancy.id)
        .sort(compareRequests),
    [activeTenancy, exitRequestsQuery.data, roomChangeRequestsQuery.data],
  );

  const loadFailed = loadFailure(activeTenancyQuery, tenanciesQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
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
            checklist={moveInQuery.isLoading ? null : (
              <MoveInChecklistCard
                onPress={() => router.push({ pathname: "/move-in-checklist", params: { role: "tenant", tenancyId: activeTenancy.tenancy.id } })}
                status={moveInQuery.data?.canRespond ? "WAITING" : moveInQuery.data?.status === "NOTED" ? "NOTED" : "ACCEPTED"}
              />
            )}
            onViewAgreement={() => router.push("/tenancy-agreement-view")}
          />

          {/* The room as recorded when they moved in, theirs to answer within 48 hours (2026-10-29). */}

          {/* Bills, deposit, requests, concerns, stay outs and damage records moved to
              Tenancy tools on Home (user, 2026-11-10). */}
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


    </ScreenScrollView>
  );
}

function TenancyOverviewCard({
  activeTenancy,
  checklist,
  onViewAgreement,
}: {
  activeTenancy: TenantActiveTenancy;
  /** The move-in checklist square, set above the agreement (user, 2026-11-11). */
  checklist?: ReactNode;
  onViewAgreement: () => void;
}) {
  const { colors } = useTheme();
  const tenancy = activeTenancy.tenancy;
  const rentAmount = tenancy.rentAmountPaise ?? tenancy.dailyRatePaise;
  const addressParts = [activeTenancy.property.address, activeTenancy.property.city, activeTenancy.property.state, activeTenancy.property.pincode];
  const endDate = tenancy.checkoutDate ?? tenancy.agreementEndDate ?? null;
  const months = tenancy.agreementValidityMonths;
  const term = months != null ? `${months} ${months === 1 ? "month" : "months"}` : "Indefinite";

  return (
    <>
      {/* The owner's Property card, on the tenant's side (user, 2026-11-11):
          the tenancy code and status, the property and its address, then the
          room, floor and rent. */}
      <PropertyStayCard
        address={addressParts.filter(Boolean).join(", ")}
        addressAccessory={<DirectionsButton borderColor="#9E77ED" parts={addressParts} />}
        badge={null}
        name={activeTenancy.property.name}
        referenceCode={tenancy.referenceCode}
      >
        <FactColumn label="Room" value={activeTenancy.room.roomNumber} />
        <FactColumn divided dividerColor={colors.borderStrong} label="Floor" value={formatFloor(activeTenancy.room.floor)} />
        <FactColumn divided dividerColor={colors.borderStrong} label="Rent" value={formatOptionalMoney(rentAmount)} />
      </PropertyStayCard>

      {/* The stay's status as its own slim bar under the property (user, 2026-11-11). */}
      {tenancyNotStarted(tenancy.startDate) ? null : <StayStatusBar startDate={tenancy.startDate} status={tenancy.status} />}

      {/* Start to end on one card, in place of four tiles. */}
      <StayTimelineCard
        billing={humanizeToken(tenancy.billingType)}
        deposit={formatOptionalMoney(tenancy.depositAmountPaise)}
        endDate={endDate}
        startDate={tenancy.startDate}
        term={term}
      />

      {/* Before the start date only. Nothing renders once the stay has begun. */}
      <TenancyStartsSoonBubble startDate={tenancy.startDate} />

      {/* The checklist and the roommates as a pair (user, 2026-11-11). */}
      {checklist ? <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>{checklist}<RoommatesCard /></View> : null}

      <AgreementHeroCard
        onView={onViewAgreement}
        term={months != null ? `${term} fixed term` : "No fixed end"}
        termNote={endDate ? `Runs until ${formatDate(endDate)}.` : "Your stay continues until you or the property gives notice."}
      />
    </>
  );
}

/** The stay's status, a slim full-width bar with a dot and since when (user, 2026-11-11). */
function StayStatusBar({ startDate, status }: { startDate: string; status: string }) {
  const { colors, fonts } = useTheme();
  const tone = tenancyStatusTone(status);
  const dot = tone === "success" ? colors.jade : tone === "warning" ? colors.warningText : tone === "danger" ? colors.danger : colors.muted;
  const background = tone === "success" ? colors.successSoft : tone === "warning" ? colors.warningSoft : tone === "danger" ? colors.dangerSoft : colors.neutralSoft;
  const text = tone === "success" ? colors.successText : tone === "warning" ? colors.warningText : tone === "danger" ? colors.danger : colors.neutralText;
  return (
    // The checklist tile's edge, in the status's own tone (user, 2026-11-11).
    <View style={{ alignItems: "center", backgroundColor: background, borderColor: tone === "success" ? "#A6F4C5" : tone === "warning" ? "#FEDF89" : tone === "danger" ? "#FECDCA" : colors.border, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 36, paddingHorizontal: spacing.md }}>
      <View style={{ backgroundColor: dot, borderRadius: 999, height: 8, width: 8 }} />
      <Text style={{ color: text, fontFamily: fonts.sansBold, fontSize: 13 }}>{tenancyStatusLabel(status as TenancyStatus)}</Text>
      {status === "ACTIVE" ? (
        <Text style={{ color: text, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5, opacity: 0.8, textAlign: "right" }}>Since {formatDate(startDate)}</Text>
      ) : null}
    </View>
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
      <FitText numberOfLines={1} style={{ color: text, fontFamily: fonts.sansBold, fontSize: cardText(12) }}>
        {tenancyStatusLabel(status as TenancyStatus)}
      </FitText>
    </View>
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




function requestStatusTone(status: string) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success";
  }
  if (status === "REJECTED" || status === "CANCELLED") {
    return "warning";
  }
  return "neutral";
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

