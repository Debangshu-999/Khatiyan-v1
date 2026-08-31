import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarDays, Check, Clock, DoorOpen, FileClock, FileText, History, Info, IndianRupee, LogOut, UserRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Section } from "@/components/section";
import { CollapsibleFilterBubbles } from "@/components/filter-bubbles";
import { SkeletonCard } from "@/components/skeleton";
import { RequestTimelineSheet } from "@/features/tenancy/request-timeline-sheet";
import {
  matchesRequestSearch,
  splitByActivity,
  splitByAttention,
  type RequestFilter,
} from "@/features/tenancy/request-activity";
import {
  buildExitRequestChains,
  exitTimelineEntries,
  type ExitRequestChain,
} from "@/features/tenancy/request-chain";
import { useToast } from "@/components/toast";
import { ActionButton, BackButton, ConfirmDialog, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import { useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import {
  useApproveExitRequestMutation,
  useListPropertyExitRequestsQuery,
  useListPropertyTenanciesQuery,
  useDecideExitWithdrawalMutation,
  useRejectExitRequestMutation,
  type TenancyExitRequest,
  type TenancySummary,
} from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ReviewMode = "approve" | "reject";

export default function OwnerExitRequestsScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState(0);
  /**
   * Null until the owner picks one, so the default can depend on data that
   * had not arrived when the screen mounted. A `useState("unattended")`
   * would strand someone on an empty queue whenever nothing needs them.
   */
  const [attention, setAttention] = useState<RequestFilter | null>(null);
  const [decideWithdrawalMutation] = useDecideExitWithdrawalMutation();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  // Deciding a request is EXIT_REQUESTS at MANAGE. Without this the buttons were
  // live for a view-only manager and only the API refused — a 403 after
  // the tap, where the control should never have invited one.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageExits = canManageResource("EXIT_REQUESTS");

  const requestsQuery = useListPropertyExitRequestsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: true, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );
  const tenancyById = useMemo(() => {
    const map: Record<string, TenancySummary> = {};
    for (const tenancy of tenanciesQuery.data ?? []) {
      map[tenancy.id] = tenancy;
    }
    return map;
  }, [tenanciesQuery.data]);
  const roomLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsQuery.data ?? []) {
      map[room.id] = `Room ${room.roomNumber}`;
    }
    return map;
  }, [roomsQuery.data]);

  const [selected, setSelected] = useState<TenancyExitRequest | null>(null);
  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const allRequests = [...(requestsQuery.data ?? [])].sort(byPendingFirst);

  // Chains are built over EVERY request, because a live re-raise points back at
  // ones already rejected or expired.
  const chains = buildExitRequestChains(allRequests);
  const activeChainByHeadId = new Map(chains.map((chain) => [chain.head.id, chain]));

  // Only the head of each chain is listed. A re-raise REPLACES the request it
  // supersedes — the older attempts live inside the timeline sheet — so listing
  // them all showed one tenant's single intent as three separate requests, and
  // the superseded ones can no longer be acted on anyway.
  const requests = allRequests.filter((request) => activeChainByHeadId.has(request.id));

  // Active means "not yet expired", NOT "not yet decided". A request the owner
  // just approved stays here for its withdrawal window, and a rejected one for
  // its re-raise window — both showing the decision. Dropping them into history
  // the instant a button is tapped hides exactly the period in which the tenant
  // may still come back, which is when the owner most needs them in view.
  const searched = requests.filter((request) => matchesRequestSearch(request, search));
  const { active: liveRequests, history: expiredRequests } = splitByActivity(searched);
  // Waiting on a decision vs decided-but-still-open. The queue opens on the
  // former because that is the only half the owner has to do anything about;
  // the rest is there to be looked up, not worked through.
  const { attended, unattended } = splitByAttention(liveRequests);
  // Opens on what needs answering, unless nothing does — then All, so the
  // screen never opens on an empty list while requests sit one tap away.
  const filter = attention ?? (unattended.length > 0 ? "unattended" : "all");
  const activeRequests =
    filter === "unattended" ? unattended : filter === "attended" ? attended : liveRequests;
  const activePaged = paginateArray(activeRequests, activePage, ACTIVE_PAGE_SIZE);

  /**
   * Decides a pending withdrawal. No notes are collected for a refusal: the veto
   * means only "no", unlike rejecting the exit itself where a reason is required.
   */
  // Refusal of a decision — nothing on the row to correct.
  const decisionErrors = useFormErrors<never>();

  async function decideWithdrawal(request: TenancyExitRequest, approved: boolean) {
    try {
      await decideWithdrawalMutation({ adminNotes: null, approved, requestId: request.id }).unwrap();
      toast.success(approved ? "Exit cancelled — the tenancy continues." : "The exit stands.");
    } catch (caught) {
      decisionErrors.failFromServer(errorMessage(caught));
    }
  }

  function openReview(request: TenancyExitRequest, reviewMode: ReviewMode) {
    setSelected(request);
    setMode(reviewMode);
  }

  function closeReview() {
    setSelected(null);
    setMode(null);
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
        {!canManageExits ? <ViewOnlyChip /> : null}
      </View>

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={DoorOpen}

          title="No active property selected"
          description="Choose the property whose exit requests you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          {/* Summary and history are ONE card, split by a rule — the same shape
              the concern workspace uses for its monitor and history. Both are
              ways of looking BACK at the queue; the queue that still needs work
              is the separate thing below. As two floating blocks they read as
              unrelated, and the counts lost their connection to the list they
              count. */}
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SummaryTile label="Active" value={String(activeRequests.length)} hint="Still open" tone={activeRequests.length > 0 ? "primary" : "default"} />
                <SummaryTile label="Total" value={String(requests.length)} hint={`${expiredRequests.length} expired`} />
              </View>

              <View style={{ backgroundColor: colors.border, height: 1, marginVertical: spacing.xs }} />

              <Text style={[type.eyebrow, { color: colors.kicker }]}>History</Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>Exit request history</Text>
              <Text style={[type.body, { color: colors.muted }]}>
                Requests that have expired and can no longer be acted on.
              </Text>
              <ActionButton
                icon={FileClock}
                label={`${expiredRequests.length} past request${expiredRequests.length === 1 ? "" : "s"}`}
                onPress={() => setPastOpen(true)}
                variant="outline"
              />
            </View>
          </Card>

          <Section title={`${activeRequests.length} request${activeRequests.length === 1 ? "" : "s"}`}>
            {/* Sits with the list it filters rather than above the summary,
                where it looked like it searched the whole screen. */}
            <AppTextInput
              autoCapitalize="characters"
              onChangeText={(next) => {
                setSearch(next);
                setActivePage(0);
              }}
              placeholder="Search by code, e.g. TEX-2026-000042"
              placeholderTextColor={colors.kicker}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 14,
                borderWidth: 1,
                color: colors.ink,
                minHeight: 48,
                paddingHorizontal: spacing.md,
              }}
              value={search}
            />
            {/* Counts dropped from the pills: the heading above already states
                how many the chosen filter matched, so carrying them here said
                the same number twice. */}
            <CollapsibleFilterBubbles
              align="start"
              onChange={(next) => {
                setAttention(next);
                setActivePage(0);
              }}
              options={[
                { label: "Needs action", value: "unattended" as const },
                { label: "Decided", value: "attended" as const },
                { label: "All", value: "all" as const },
              ]}
              value={filter}
            />

            {requestsQuery.isFetching && requests.length === 0 ? (
              <SkeletonCard />
            ) : activeRequests.length === 0 ? (
              <EmptyState
                icon={DoorOpen}

                title={filter === "unattended" ? "Nothing waiting on you" : "No decided requests"}
                description={
                  filter === "unattended"
                    ? "Requests you have not answered yet appear here."
                    : "Requests you have decided stay here until they expire."
                }
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {activePaged.pageItems.map((request) => (
                  <ExitRequestCard
                    key={request.id}
                    request={request}
                    roomLabel={roomLabels[request.roomId]}
                    canManage={canManageExits}
                    chain={activeChainByHeadId.get(request.id)}
                    onAllowWithdrawal={() => void decideWithdrawal(request, true)}
                    onApprove={() => openReview(request, "approve")}
                    onRefuseWithdrawal={() => void decideWithdrawal(request, false)}
                    onReject={() => openReview(request, "reject")}
                  />
                ))}
                {activeRequests.length > 0 ? (
                  <PaginationBar
                    hasNext={activePaged.page + 1 < activePaged.totalPages}
                    hasPrevious={activePaged.page > 0}
                    onNext={() => setActivePage(activePaged.page + 1)}
                    onPrevious={() => setActivePage(Math.max(0, activePaged.page - 1))}
                    page={activePaged.page}
                    totalElements={activeRequests.length}
                    totalPages={activePaged.totalPages}
                  />
                ) : null}
              </View>
            )}
          </Section>

        </>
      ) : null}

      {selected && mode ? (
        <ExitReviewModal mode={mode} onClose={closeReview} request={selected} tenancy={tenancyById[selected.tenancyId]} />
      ) : null}
      {pastOpen ? <PastExitRequestsModal chainByHeadId={activeChainByHeadId} onClose={() => setPastOpen(false)} requests={expiredRequests} roomLabels={roomLabels} /> : null}
      {decisionErrors.serverError ? <AlertModal message={decisionErrors.serverError} onClose={decisionErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

const PAST_PAGE_SIZE = 8;
const ACTIVE_PAGE_SIZE = 5;

function paginateArray<T>(items: T[], page: number, size: number) {
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;
  return {
    hasNext: safePage + 1 < totalPages,
    hasPrevious: safePage > 0,
    page: safePage,
    pageItems: items.slice(start, start + size),
    totalElements,
    totalPages,
  };
}

// Reviewed (non-pending) exit requests, paginated in a modal like concern history.
function PastExitRequestsModal({
  chainByHeadId,
  onClose,
  requests,
  roomLabels,
}: {
  /**
   * Passed in rather than rebuilt here. This modal only receives chain HEADS,
   * so rebuilding from them would produce single-link chains and every timeline
   * would silently lose the attempts it supersedes.
   */
  chainByHeadId: Map<string, ExitRequestChain>;
  onClose: () => void;
  requests: TenancyExitRequest[];
  roomLabels: Record<string, string>;
}) {
  const { colors, fonts, type } = useTheme();
  const [page, setPage] = useState(0);
  const paged = paginateArray(requests, page, PAST_PAGE_SIZE);

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Full width. These cards now carry a timeline button and an alternating
          rail behind it, and an inset sheet left the rail squeezed into about
          half the screen with the labels wrapping. */}
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            gap: spacing.md,
            maxHeight: "92%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>Past requests</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, }}>Exit request history</Text>
            </View>
            <IconButton accessibilityLabel="Close past requests" icon={X} onPress={onClose} />
          </View>
          {requests.length === 0 ? (
            <EmptyState icon={DoorOpen} title="No past requests" description="Requests appear here once they expire and can no longer be acted on." />
          ) : (
            <>
              <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
                {paged.pageItems.map((request) => (
                  <ExitRequestCard
                    chain={chainByHeadId.get(request.id)}
                    key={request.id}
                    request={request}
                    roomLabel={roomLabels[request.roomId]}
                  />
                ))}
              </ScrollView>
              {paged.totalElements > 0 ? (
                <PaginationBar
                  hasNext={paged.hasNext}
                  hasPrevious={paged.hasPrevious}
                  onNext={() => setPage((current) => current + 1)}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  page={paged.page}
                  totalElements={paged.totalElements}
                  totalPages={paged.totalPages}
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ExitRequestCard({
  // The past-requests list reuses this card purely to read, so the decision
  // handlers are optional there — nothing in a settled request is actionable.
  canManage = true,
  chain,
  onAllowWithdrawal = () => {},
  onApprove = () => {},
  onRefuseWithdrawal = () => {},
  onReject = () => {},
  request,
  roomLabel,
}: {
  canManage?: boolean;
  chain?: ExitRequestChain;
  onAllowWithdrawal?: () => void;
  onApprove?: () => void;
  onRefuseWithdrawal?: () => void;
  onReject?: () => void;
  request: TenancyExitRequest;
  roomLabel?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const pending = request.status === "REQUESTED";
  const withdrawalPending = request.status === "WITHDRAWAL_REQUESTED";
  const [info, setInfo] = useState<{ label: string; value: string } | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const attempts = chain?.links.length ?? 1;

  return (
    <>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View
              style={{
                alignItems: "center",
                borderColor: colors.ink,
                borderWidth: 1,
                borderRadius: 12,
                height: 42,
                justifyContent: "center",
                width: 42,
              }}
            >
              <LogOut color={colors.ink} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  {/* Who, then which room, then the code. The card used to lead
                      with a truncated tenancy UUID, which identified nobody. */}
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 25 }}
                  >
                    {request.tenantName ?? "Tenant"}
                  </Text>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                    {roomLabel ? (
                      <Text style={[type.caption, { color: colors.muted }]}>{roomLabel}</Text>
                    ) : null}
                    <Text style={[type.caption, { color: colors.kicker, fontWeight: "800" }]}>
                      {request.referenceCode}
                    </Text>
                  </View>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                    <CalendarDays color={colors.kicker} size={13} strokeWidth={2.1} />
                    <Text style={[type.caption, { color: colors.muted }]}>
                      {formatDate(request.requestedCheckoutDate)}
                    </Text>
                  </View>
                </View>
                <StatusBadge status={request.status} />
              </View>
              {request.approvedCheckoutDate ? (
                <InfoLine icon={CalendarDays} label="Approved" value={formatDate(request.approvedCheckoutDate)} />
              ) : null}
              {request.decidedByName && request.decidedAt ? (
                <>
                  {/* Who and when, on their own rows. They used to share one
                      line separated by a dot, which read as a single fact and
                      made the timestamp easy to mistake for part of the name. */}
                  <InfoLine
                    icon={UserRound}
                    label={request.status === "REJECTED" ? "Rejected by" : "Approved by"}
                    value={request.decidedByName}
                  />
                  <InfoLine
                    icon={Clock}
                    label={request.status === "REJECTED" ? "Rejected at" : "Approved at"}
                    value={formatDateTime(request.decidedAt)}
                  />
                </>
              ) : null}
              {request.finalBillingAmountPaise != null && request.finalBillingAmountPaise > 0 ? (
                <InfoLine icon={IndianRupee} label="Bill impact" value={formatMoney(request.finalBillingAmountPaise)} />
              ) : null}
              {request.tenantReason ? (
                <InfoRow icon={FileText} label="Reason" onPress={() => setInfo({ label: "Reason", value: request.tenantReason ?? "" })} />
              ) : null}
              {request.adminNotes ? (
                <InfoRow icon={FileText} label="Notes" onPress={() => setInfo({ label: "Notes", value: request.adminNotes ?? "" })} />
              ) : null}
              {request.withdrawalReason ? (
                <InfoRow
                  icon={FileText}
                  label="Why they want to stay"
                  onPress={() => setInfo({ label: "Why they want to stay", value: request.withdrawalReason ?? "" })}
                />
              ) : null}
            </View>
          </View>

          {withdrawalPending ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                This tenant asked to cancel their approved exit and stay on. Refusing is a plain no —
                you may already have promised the room, and you owe no explanation.
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ActionButton disabled={!canManage} label="Let them stay" onPress={onAllowWithdrawal} />
                <ActionButton
                  disabled={!canManage}
                  label="Exit stands"
                  onPress={onRefuseWithdrawal}
                  variant="danger"
                />
              </View>
            </View>
          ) : pending ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton disabled={!canManage} label="Approve" onPress={onApprove} />
              <ActionButton disabled={!canManage} label="Reject" onPress={onReject} variant="danger" />
            </View>
          ) : null}

          <View style={{ flexDirection: "row" }}>
            <ActionButton
              icon={History}
              label={attempts > 1 ? `View timeline (${attempts})` : "View timeline"}
              onPress={() => setShowTimeline(true)}
              variant="outline"
            />
          </View>
        </View>
      </Card>
      {info ? <InfoPopover onClose={() => setInfo(null)} title={info.label} value={info.value} /> : null}
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
          roomLabel={roomLabel}
          tenantName={request.tenantName}
          viewer="MANAGEMENT"
        />
      ) : null}
    </>
  );
}

function ExitReviewModal({
  mode,
  onClose,
  request,
  tenancy,
}: {
  mode: ReviewMode;
  onClose: () => void;
  request: TenancyExitRequest;
  tenancy?: TenancySummary;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState("");
  const form = useFormErrors<"notes">();
  const [confirm, setConfirm] = useState<{ confirmLabel: string; destructive?: boolean; message: string; title: string } | null>(null);

  const [approveExit, approveState] = useApproveExitRequestMutation();
  const [rejectExit, rejectState] = useRejectExitRequestMutation();
  const busy = approveState.isLoading || rejectState.isLoading;
  const reject = mode === "reject";

  // Current bill status drives the messaging: a paid bill means the early-exit
  // penalty becomes a NEW bill; an unpaid bill is where it (or dues) settle.
  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(request.tenancyId, { skip: reject });
  const latestCycle = useMemo(() => {
    const cycles = cyclesQuery.data ?? [];
    return cycles.length > 0 ? [...cycles].sort((a, b) => (b.cycleNumber ?? 0) - (a.cycleNumber ?? 0))[0] : null;
  }, [cyclesQuery.data]);
  const billPaid = !latestCycle || latestCycle.status === "PAID" || latestCycle.status === "CANCELLED";

  const title = mode === "approve" ? "Approve exit" : "Reject exit";

  function handleSubmit() {
    if (busy) {
      return;
    }
    form.clearAll();

    if (reject) {
      // A reason is mandatory, and the server enforces it too. Rejection cannot
      // mean "you may not leave" — serving notice is a right, not a request for
      // permission — so what it has to mean is "this request is not right".
      // Requiring the reason is what keeps those apart, and the tenant needs it
      // to re-raise with the correction.
      if (!form.validate(notes.trim() ? {} : { notes: "Give a reason. The tenant needs to know what to change." })) {
        return;
      }
      setConfirm({
        confirmLabel: "Reject",
        destructive: true,
        message: `Reject this ${humanizeToken(request.type).toLowerCase()} request?`,
        title: "Reject exit request?",
      });
      return;
    }

    setConfirm({
      confirmLabel: "Approve",
      message: `Approve checkout on ${formatDate(request.requestedCheckoutDate)}.`,
      title: "Approve exit request?",
    });
  }

  async function submit() {
    try {
      if (mode === "approve") {
        // Deposit settlement + final billing are handled at end-of-tenancy now,
        // so approval only sets the checkout date (the penalty is auto-applied).
        await approveExit({
          // No date is sent. Approval fixes the tenant's requested date, and
          // the server refuses anything else.
          payload: { adminNotes: notes.trim() || null },
          requestId: request.id,
        }).unwrap();
      } else {
        await rejectExit({ adminNotes: notes.trim(), requestId: request.id }).unwrap();
      }
      onClose();
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  }

  return (
    <>
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "90%",
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  {humanizeToken(request.type)}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, }}>
                  {title}
                </Text>
              </View>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={{ flexShrink: 1 }}
            >
              {reject ? (
                <FormInput multiline label="Rejection note" onChangeText={setNotes} placeholder="Optional note for the tenant" value={notes} />
              ) : (
                <>
                  {/* Read-only. Approving is agreeing to the tenant's date;
                      changing it here moved someone's last day without their
                      say-so, and with no lower bound it accepted dates already
                      past. A different date means rejecting and letting them
                      raise a new request. */}
                  <InfoLine
                    icon={CalendarDays}
                    label="Checkout date"
                    value={formatDate(request.requestedCheckoutDate)}
                  />

                  {cyclesQuery.isFetching && !latestCycle ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <StatusNote
                      tone={billPaid ? "muted" : "warning"}
                      title="Current bill"
                      message={
                        billPaid
                          ? "The current bill is fully paid — there is nothing to settle here."
                          : `Outstanding: ${formatMoney(latestCycle?.totalAmountPaise ?? 0)}${latestCycle ? ` (bill ${latestCycle.referenceCode})` : ""}. The tenant clears this before checkout.`
                      }
                    />
                  )}

                  {tenancy?.earlyExitRule ? (
                    <StatusNote
                      tone="primary"
                      title="If they are leaving early"
                      message={tenancy.earlyExitRule}
                    />
                  ) : null}

                  <StatusNote
                    tone="muted"
                    title="Deposit"
                    message="The deposit is settled when the tenancy ends, not at approval."
                  />

                  <FormInput error={form.errors.notes} multiline label="Note (optional)" onChangeText={(next) => { setNotes(next); form.clearField("notes"); }} placeholder="Optional note for the tenant" value={notes} />
                </>
              )}
              {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
            </ScrollView>

            {/* A plain bordered footer, NOT PinnedFooter. That component is
                built for full screens: it paints a gradient fade over the
                content behind it and expects PINNED_FOOTER_CLEARANCE of scroll
                padding to compensate. In a sheet that never adds the clearance,
                the fade read as a stray shadow and the last input clipped under
                the button. A modal already ends where the sheet ends — there is
                nothing to fade into. */}
            <View
              style={{
                borderTopColor: colors.border,
                borderTopWidth: 1,
                flexDirection: "row",
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              }}
            >
              <ActionButton
                disabled={busy}
                label={busy ? "Saving" : mode === "approve" ? "Approve" : "Reject"}
                onPress={handleSubmit}
                variant={mode === "approve" ? "primary" : "danger"}
              />
            </View>
            {/* The gesture bar sits under the sheet on edge-to-edge Android and
                on iOS, so without this the action button is half-covered. Same
                recipe as the deposit manager's sheets. */}
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    {confirm ? (
      <ConfirmDialog
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        message={confirm.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void submit();
        }}
        title={confirm.title}
      />
    ) : null}
    </>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      {label ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {label}
        </Text>
      ) : null}
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

function InfoRow({ icon: Icon, label, onPress }: { icon: typeof CalendarDays; label: string; onPress: () => void }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
        {label}
      </Text>
      <AnimatedPressable
        accessibilityLabel={`View ${label.toLowerCase()}`}
        accessibilityRole="button"
        onPress={onPress}
        hitSlop={8}
        style={{
          alignItems: "center",
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        <Info color={colors.ink} size={15} strokeWidth={2.3} />
      </AnimatedPressable>
    </View>
  );
}

function InfoPopover({ onClose, title, value }: { onClose: () => void; title: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Pressable
        onPress={onClose}
        style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: 360,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, }}>
              {title}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]}>
            {value}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SummaryTile({ hint, label, tone = "default", value }: { hint: string; label: string; tone?: "default" | "primary"; value: string }) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "primary" ? colors.primary : colors.ink;
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flex: 1, gap: spacing.xs, padding: spacing.md }}>
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={{ color: accent, fontFamily: fonts.display, fontSize: 20, }}>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]}>
        {hint}
      </Text>
    </View>
  );
}

// LOCAL VARIANT — deliberately NOT the shared FormInput in
// `@/features/owner/owner-ui`. It differs (no prefix/error affordances), so editing the shared
// one does NOT change this screen. Unify before adding behaviour to either.
function FormInput({
  error,
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string;
  keyboardType?: "decimal-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
        {label}
      </Text>
      <AppTextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          borderColor: error ? colors.danger : colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.ink,
          minHeight: multiline ? 96 : 46,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
      <FieldError message={error} />
    </View>
  );
}

function StatusNote({ message, title, tone }: { message: string; title: string; tone: "muted" | "warning" | "primary" }) {
  const { colors, type } = useTheme();
  const accent = tone === "warning" ? colors.warningText : tone === "primary" ? colors.primary : colors.muted;
  const soft = tone === "warning" ? colors.warningSoft : tone === "primary" ? colors.primarySoft : colors.surfaceSunken;
  return (
    <View style={{ backgroundColor: soft, borderRadius: 12, gap: 2, padding: spacing.md }}>
      <Text style={[type.caption, { color: accent, fontWeight: "800" }]}>
        {title}
      </Text>
      <Text style={[type.caption, { color: colors.ink, lineHeight: 18 }]}>
        {message}
      </Text>
    </View>
  );
}

// LOCAL VARIANT — deliberately NOT the shared ActionButton in
// `@/features/owner/owner-ui`. It differs (13px label, no danger variant, no haptics), so editing the shared
// one does NOT change this screen. Unify before adding behaviour to either.

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}

function byPendingFirst(left: TenancyExitRequest, right: TenancyExitRequest) {
  const leftPending = left.status === "REQUESTED" ? 0 : 1;
  const rightPending = right.status === "REQUESTED" ? 0 : 1;
  if (leftPending !== rightPending) {
    return leftPending - rightPending;
  }
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}


function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

/**
 * Status with the screen's own icon beside it.
 *
 * <p>The word used to appear twice on a card — once here and once as the label
 * of the checkout-date field. The icon carries the "which kind of request" job
 * the eyebrow used to do, so the header is one line shorter as well.
 */
function StatusBadge({ status }: { status: string }) {
  const { colors, type } = useTheme();
  const tone =
    status === "APPROVED" || status === "EXECUTED"
      ? colors.successText
      : status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED"
        ? colors.danger
        : colors.primary;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xxs }}>
      <Text style={[type.caption, { color: tone, fontWeight: "900" }]}>
        {status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
      </Text>
    </View>
  );
}
