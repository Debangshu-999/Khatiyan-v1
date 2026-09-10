import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Clock, History, MoreHorizontal, Undo2, UserRound, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  buildExitRequestChains,
  buildRoomChangeRequestChains,
  exitTimelineEntries,
  roomChangeTimelineEntries,
  type ExitRequestChain,
  type RoomChangeRequestChain,
} from "@/features/tenancy/request-chain";
import { RequestReasonInfo } from "@/features/tenancy/request-reason-info";
import { RequestTimelineSheet } from "@/features/tenancy/request-timeline-sheet";
import {
  ExitRequestCorrectionActions,
  RoomChangeRequestCorrectionActions,
} from "@/features/tenancy/request-correction-actions";
import {
  splitByActivity,
} from "@/features/tenancy/request-activity";
import {
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  useWithdrawApprovedExitRequestMutation,
  type TenancyExitRequest,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");
const REQUEST_HISTORY_ILLUSTRATION = require("../assets/workspace/staff-history.png");

/**
 * The tenant's current request tracker.
 *
 * <p>Only requests whose server-provided action window is still open belong on
 * this screen. Older exit and room-change requests share one dated history
 * route, keeping this screen focused on what the tenant can still act on.
 */
export default function TenancyRequestHistoryScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ excludeTenancyId?: string; scope?: string; tenancyId?: string }>();

  const exitQuery = useListMyExitRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const roomChangeQuery = useListMyRoomChangeRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const loading = exitQuery.isFetching || roomChangeQuery.isFetching;

  const scopedExits = scopeToTenancy(exitQuery.data ?? [], params);
  const scopedRoomChanges = scopeToTenancy(roomChangeQuery.data ?? [], params);
  const exitChains = useMemo(() => buildExitRequestChains(scopedExits), [scopedExits]);
  const exitChainByHeadId = useMemo(
    () => new Map(exitChains.map((chain) => [chain.head.id, chain])),
    [exitChains],
  );
  const exitHeads = exitChains.map((chain) => chain.head);
  const roomChangeChains = useMemo(
    () => buildRoomChangeRequestChains(scopedRoomChanges),
    [scopedRoomChanges],
  );
  const roomChainByHeadId = useMemo(
    () => new Map(roomChangeChains.map((chain) => [chain.head.id, chain])),
    [roomChangeChains],
  );
  const roomHeads = roomChangeChains.map((chain) => chain.head);
  const { active: activeExits, history: pastExits } = splitByActivity(exitHeads);
  const { active: activeRoomChanges, history: pastRoomChanges } = splitByActivity(roomHeads);
  const currentRequests = [
    ...activeExits.map((request) => ({ kind: "EXIT" as const, request })),
    ...activeRoomChanges.map((request) => ({ kind: "ROOM_CHANGE" as const, request })),
  ].sort((left, right) => new Date(right.request.createdAt).getTime() - new Date(left.request.createdAt).getTime());
  const pastCount = pastExits.length + pastRoomChanges.length;

  return (
    <ScreenScrollView>
      <ScreenHeader
        title="Requests,"
        italicTail="tracked."
        subtitle="Follow the current exit or room change request for your tenancy."
      />

      <Section title="Current request">
        {loading && !exitQuery.data && !roomChangeQuery.data ? (
          <SkeletonList rows={1} />
        ) : currentRequests.length === 0 ? (
          <EmptyState
            artwork={CONCERN_EMPTY_ILLUSTRATION}
            title="No current request"
            description="An exit or room-change request stays here while it can still be acted on."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {currentRequests.map((entry) =>
              entry.kind === "EXIT" ? (
                <ExitCard
                  chain={exitChainByHeadId.get(entry.request.id)}
                  key={`exit-${entry.request.id}`}
                  request={entry.request}
                />
              ) : (
                <RoomChangeCard
                  chain={roomChainByHeadId.get(entry.request.id)}
                  key={`room-${entry.request.id}`}
                  request={entry.request}
                />
              ),
            )}
          </View>
        )}
      </Section>

      {loading && !exitQuery.data && !roomChangeQuery.data ? (
        <SkeletonCard />
      ) : (
        <RequestHistoryRouteCard
          count={pastCount}
          onPress={() =>
            router.push({
              pathname: "/tenancy-past-requests",
              params: {
                excludeTenancyId: params.excludeTenancyId,
                scope: params.scope,
                tenancyId: params.tenancyId,
              },
            })
          }
        />
      )}
    </ScreenScrollView>
  );
}

function RequestHistoryRouteCard({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Request history</Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>View past requests</Text>
          <Text style={[type.body, { color: colors.muted }]}>Expired exit and room-change requests.</Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={REQUEST_HISTORY_ILLUSTRATION as ImageSourcePropType}
          style={{ height: 92, width: 92 }}
        />
      </View>

      <ActionButton
        icon={History}
        label={`${count} past request${count === 1 ? "" : "s"}`}
        onPress={onPress}
        variant="secondary"
      />
    </Card>
  );
}

export function ExitCard({ chain, request }: { chain?: ExitRequestChain; request: TenancyExitRequest }) {
  const { colors, fonts, type } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const attempts = chain?.links.length ?? 1;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <RequestCardHeader
          referenceCode={request.referenceCode}
          status={request.status}
          title="Exit request"
        />
        <RequestExpiryNotice label={exitExpiryLabel(request)} />

        <DetailLine label="Requested checkout" value={formatDate(request.requestedCheckoutDate)} />
        {request.approvedCheckoutDate ? (
          <DetailLine label="Approved checkout" value={formatDate(request.approvedCheckoutDate)} />
        ) : null}
        {request.decidedByName && request.decidedAt ? (
          <>
            {/* Who and when on their own rows — one dotted line read as a
                single fact and hid the timestamp inside the name. */}
            <DetailLine
              icon={UserRound}
              label={request.status === "REJECTED" ? "Rejected by" : "Approved by"}
              value={request.decidedByName}
            />
            <DetailLine
              icon={Clock}
              label={request.status === "REJECTED" ? "Rejected at" : "Approved at"}
              value={formatDateTime(request.decidedAt)}
            />
          </>
        ) : null}

        {/* Reasons sit behind an info control rather than printing in full — a
            long rejection used to push the rest of the card off screen. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {request.tenantReason ? (
            <RequestReasonInfo label="Your reason" value={request.tenantReason} />
          ) : null}
          {request.adminNotes ? (
            <RequestReasonInfo label="Management's reason" value={request.adminNotes} />
          ) : null}
        </View>

        {request.status === "EXPIRED" ? (
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            Nobody reviewed this in time. Raise it again and your notice still counts from the day
            you first asked.
          </Text>
        ) : null}
        {request.status === "WITHDRAWAL_REQUESTED" ? (
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            Waiting on management to agree. Until they do, your exit still stands.
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            icon={History}
            label={attempts > 1 ? `View timeline (${attempts})` : "View timeline"}
            onPress={() => setShowTimeline(true)}
            variant="outline"
          />
          {request.reRaiseAllowed || request.withdrawalWindowOpen ? (
            <RequestOverflowButton
              accessibilityLabel="Open exit request actions"
              onPress={() => setShowActions(true)}
            />
          ) : null}
        </View>
      </View>

      {showTimeline ? (
        <RequestTimelineSheet
          anchorNote={
            chain && attempts > 1
              ? `Raised ${attempts} times. Notice counts from ${formatDate(chain.head.noticeAnchorDate)}, the day of the first request.`
              : null
          }
          entries={chain ? exitTimelineEntries(chain) : []}
          onClose={() => setShowTimeline(false)}
          referenceCode={request.referenceCode}
          tenantName={request.tenantName}
          viewer="TENANT"
        />
      ) : null}
      {showWithdraw ? (
        <WithdrawExitSheet
          approvedCheckoutDate={request.approvedCheckoutDate}
          onClose={() => setShowWithdraw(false)}
          requestId={request.id}
        />
      ) : null}
      {showActions ? (
        <ExitRequestCorrectionActions
          onClose={() => setShowActions(false)}
          onRequestWithdrawal={() => {
            setShowActions(false);
            setShowWithdraw(true);
          }}
          request={request}
        />
      ) : null}
    </Card>
  );
}

export function RoomChangeCard({
  chain,
  request,
}: {
  chain?: RoomChangeRequestChain;
  request: TenancyRoomChangeRequest;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const attempts = chain?.links.length ?? 1;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <RequestCardHeader
          referenceCode={request.referenceCode}
          status={request.status}
          title="Room change request"
        />
        <RequestExpiryNotice label={roomChangeExpiryLabel(request)} />

        <DetailLine label="Transfer date" value={formatDate(request.effectiveTransferDate)} />
        <DetailLine label="Requested rent" value={formatMoney(request.requestedRoomRentAmountPaise)} />
        {typeof request.executedRentAmountPaise === "number" ? (
          <DetailLine label="Executed rent" value={formatMoney(request.executedRentAmountPaise)} />
        ) : null}
        {request.decidedByName && request.decidedAt ? (
          <>
            {/* Who and when on their own rows — one dotted line read as a
                single fact and hid the timestamp inside the name. */}
            <DetailLine
              icon={UserRound}
              label={request.status === "REJECTED" ? "Rejected by" : "Approved by"}
              value={request.decidedByName}
            />
            <DetailLine
              icon={Clock}
              label={request.status === "REJECTED" ? "Rejected at" : "Approved at"}
              value={formatDateTime(request.decidedAt)}
            />
          </>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {request.tenantReason ? (
            <RequestReasonInfo label="Your reason" value={request.tenantReason} />
          ) : null}
          {request.adminNotes ? (
            <RequestReasonInfo label="Management's reason" value={request.adminNotes} />
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            icon={History}
            label={attempts > 1 ? `View timeline (${attempts})` : "View timeline"}
            onPress={() => setShowTimeline(true)}
            variant="outline"
          />
          {request.reRaiseAllowed ? (
            <RequestOverflowButton
              accessibilityLabel="Open room change request actions"
              onPress={() => setShowActions(true)}
            />
          ) : null}
        </View>
      </View>

      {showTimeline ? (
        <RequestTimelineSheet
          entries={roomChangeTimelineEntries(chain ?? request)}
          onClose={() => setShowTimeline(false)}
          referenceCode={request.referenceCode}
          tenantName={request.tenantName}
          viewer="TENANT"
        />
      ) : null}
      {showActions ? (
        <RoomChangeRequestCorrectionActions
          onClose={() => setShowActions(false)}
          request={request}
        />
      ) : null}
    </Card>
  );
}

function RequestOverflowButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderRadius: 999,
        borderWidth: 1,
        height: 48,
        justifyContent: "center",
        width: 48,
      }}
    >
      <MoreHorizontal color={colors.ink} size={20} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}

function RequestExpiryNotice({ label }: { label: string | null }) {
  const { colors, fonts } = useTheme();
  if (!label) {
    return null;
  }

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.warningSoft,
        borderRadius: 999,
        flexDirection: "row",
        gap: spacing.xs,
        minHeight: 30,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Clock color={colors.ink} size={14} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

/** Tenant name large, room/code small beside it — who, then which. */
function RequestCardHeader({
  referenceCode,
  status,
  title,
}: {
  referenceCode: string;
  status: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20 }}
        >
          {title}
        </Text>
        <StatusPill label={humanizeToken(status)} tone={statusTone(status)} />
      </View>
      <Text style={[type.caption, { color: colors.kicker, fontWeight: "800" }]}>
        {referenceCode}
      </Text>
    </View>
  );
}

function WithdrawExitSheet({
  approvedCheckoutDate,
  onClose,
  requestId,
}: {
  approvedCheckoutDate: string | null;
  onClose: () => void;
  requestId: string;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [withdraw, withdrawState] = useWithdrawApprovedExitRequestMutation();
  // Server refusal — no field owns it, so it takes a modal.
  const opErrors = useFormErrors<never>();

  async function submit() {
    try {
      await withdraw({ reason: reason.trim() || null, requestId }).unwrap();
      toast.success("Sent. Management will decide whether you can stay on.");
      onClose();
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <SheetShell onClose={onClose} title="Cancel your exit">
      <View style={{ gap: spacing.md }}>
        <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]}>
          You asked to leave on{" "}
          <Text style={{ color: colors.ink, fontWeight: "800" }}>
            {approvedCheckoutDate ? formatDate(approvedCheckoutDate) : "your approved date"}
          </Text>
          . Management has to agree before your stay continues — they may already have promised your
          room to someone else.
        </Text>
        <AppTextInput
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Why do you want to stay on? (optional)"
          placeholderTextColor={colors.kicker}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            color: colors.ink,
            minHeight: 96,
            padding: spacing.md,
            textAlignVertical: "top",
          }}
          value={reason}
        />
        <ActionButton
          disabled={withdrawState.isLoading}
          icon={Undo2}
          label={withdrawState.isLoading ? "Sending…" : "Ask to stay on"}
          onPress={() => void submit()}
        />
      </View>
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </SheetShell>
  );
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  /** Optional — only the decision rows carry one, to mark who from when. */
  icon?: ComponentType<LucideProps>;
  label: string;
  value: string;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {Icon ? <Icon color={colors.muted} size={13} strokeWidth={2.2} /> : null}
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      </View>
      <Text style={[type.caption, { color: colors.ink, flexShrink: 1, fontWeight: "800", textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

export function scopeToTenancy<T extends { tenancyId: string }>(
  requests: T[],
  params: { excludeTenancyId?: string; scope?: string; tenancyId?: string },
) {
  return requests.filter((request) => {
    if (params.scope === "current" && params.tenancyId) {
      return request.tenancyId === params.tenancyId;
    }
    if (params.scope === "past" && params.excludeTenancyId) {
      return request.tenancyId !== params.excludeTenancyId;
    }
    return true;
  });
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success" as const;
  }
  if (status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED") {
    return "warning" as const;
  }
  // WITHDRAWAL_REQUESTED sits with REQUESTED — both await a decision.
  return "neutral" as const;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function exitExpiryLabel(request: TenancyExitRequest) {
  const remaining = remainingDays(request.expiresAt);
  if (remaining === null) {
    return null;
  }
  if (request.status === "REQUESTED") {
    return remaining === 1 ? "Expires today" : `Expires in ${remaining}d`;
  }
  if (request.status === "REJECTED" && request.reRaiseAllowed) {
    return remaining === 1
      ? "Last day to re-raise this request"
      : `${remaining}d left to re-raise this request`;
  }
  if (request.status === "APPROVED" && request.withdrawalWindowOpen) {
    return remaining === 1
      ? "Last day to request withdrawal"
      : `${remaining}d left to request withdrawal`;
  }
  return null;
}

function roomChangeExpiryLabel(request: TenancyRoomChangeRequest) {
  const remaining = remainingDays(request.expiresAt);
  if (remaining === null) {
    return null;
  }
  if (request.status === "REQUESTED") {
    return remaining === 1 ? "Expires today" : `Expires in ${remaining}d`;
  }
  if (request.status === "REJECTED" && request.reRaiseAllowed) {
    return remaining === 1
      ? "Last day to re-raise this request"
      : `${remaining}d left to re-raise this request`;
  }
  return null;
}

function remainingDays(expiresAt: string | null) {
  if (!expiresAt) {
    return null;
  }
  const milliseconds = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(milliseconds / 86_400_000));
}
