import { type ComponentType, useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { AlertModal } from "@/components/alert-modal";
import { AppTextInput } from "@/components/app-text-input";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { FieldError } from "@/components/field-error";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowRight, CalendarDays, Check, Clock, FileClock, FileText, History, IndianRupee, Info, LockOpen, Repeat2, RotateCcw, UserRound, X, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { RequestTimelineSheet } from "@/features/tenancy/request-timeline-sheet";
import {
  buildRoomChangeRequestChains,
  roomChangeTimelineEntries,
  type RoomChangeRequestChain,
} from "@/features/tenancy/request-chain";
import {
  matchesRequestSearch,
  splitByActivity,
  splitByAttention,
  type RequestFilter,
} from "@/features/tenancy/request-activity";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { CountTabPills } from "@/components/filter-bubbles";
import { OwnerRequestListSkeleton } from "@/components/skeletons/owner";
import { ActionButton, ConfirmDialog, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  useApproveRoomChangeRequestMutation,
  useListPropertyRoomChangeRequestsQuery,
  useRejectRoomChangeRequestMutation,
  useRevertRoomChangeApprovalMutation,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { metricFontSize } from "@/theme/metric-size";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { SearchField } from "@/components/search-field";
import { useKeyboardInset } from "@/components/use-keyboard-inset";

const ROOM_CHANGE_ARTWORK = require("../assets/workspace/room-change.png");

const REQUEST_EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");

type ReviewMode = "approve" | "reject";

export default function OwnerRoomChangeRequestsScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  // Deciding a request is ROOM_CHANGES at MANAGE. Without this the buttons were
  // live for a view-only manager and only the API refused — a 403 after
  // the tap, where the control should never have invited one.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageRoomChanges = canManageResource("ROOM_CHANGES");

  const requestsQuery = useListPropertyRoomChangeRequestsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const roomLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsQuery.data ?? []) {
      map[room.id] = `Room ${room.roomNumber}`;
    }
    return map;
  }, [roomsQuery.data]);

  const [selected, setSelected] = useState<TenancyRoomChangeRequest | null>(null);
  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [revertTarget, setRevertTarget] = useState<TenancyRoomChangeRequest | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertRoomChangeApproval, revertState] = useRevertRoomChangeApprovalMutation();
  const [pastOpen, setPastOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState(0);
  /**
   * Null until the owner picks one, so the default can depend on data that
   * had not arrived when the screen mounted. A `useState("unattended")`
   * would strand someone on an empty queue whenever nothing needs them.
   */
  const [attention, setAttention] = useState<RequestFilter | null>(null);

  const roomChangeChains = useMemo(
    () => buildRoomChangeRequestChains(requestsQuery.data ?? []),
    [requestsQuery.data],
  );
  const chainByHeadId = useMemo(
    () => new Map(roomChangeChains.map((chain) => [chain.head.id, chain])),
    [roomChangeChains],
  );
  const requests = roomChangeChains.map((chain) => chain.head).sort(byPendingFirst);
  // Same rule as exits: active means "not yet expired". A room change expires
  // the moment it is decided — there is no withdrawal window — so in practice
  // this matches the old "still REQUESTED" test, but it now comes from the
  // server's own expiry rather than a status the client interprets.
  const searched = requests.filter((request) => matchesRequestSearch(request, search));
  const { active: liveRequests, history: expiredRequests } = splitByActivity(searched);
  // Waiting on a decision vs decided-but-still-open. The queue opens on the
  // former because that is the only half the owner has to act on.
  const { attended, unattended } = splitByAttention(liveRequests);
  // Opens on what needs answering, unless nothing does — then All, so the
  // screen never opens on an empty list while requests sit one tap away.
  const filter = attention ?? (unattended.length > 0 ? "unattended" : "all");
  const activeRequests =
    filter === "unattended" ? unattended : filter === "attended" ? attended : liveRequests;
  const activePaged = paginateArray(activeRequests, activePage, ACTIVE_PAGE_SIZE);

  function openReview(request: TenancyRoomChangeRequest, reviewMode: ReviewMode) {
    setSelected(request);
    setMode(reviewMode);
  }

  function closeReview() {
    setSelected(null);
    setMode(null);
  }

  async function confirmApprovalRevert() {
    if (!revertTarget || revertState.isLoading) {
      return;
    }
    const requestId = revertTarget.id;
    setRevertTarget(null);
    try {
      await revertRoomChangeApproval(requestId).unwrap();
    } catch (caught) {
      setRevertError(errorMessage(caught) || "Could not return this room change for a new decision.");
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        {!canManageRoomChanges ? <ViewOnlyChip /> : null}
      </View>

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Repeat2}

          title="No active property selected"
          description="Choose the property whose room-change requests you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          {/* Summary and history as one card, matching the exit screen and the
              concern workspace it borrows from. */}
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SummaryTile icon={LockOpen} label="Active" value={String(activeRequests.length)} hint="Still open" tone={activeRequests.length > 0 ? "primary" : "default"} />
                <SummaryTile icon={FileClock} label="Total" value={String(requests.length)} hint={`${expiredRequests.length} expired`} />
              </View>

              <View style={{ backgroundColor: colors.border, height: 1, marginVertical: spacing.xs }} />

              {/* Text and artwork share a row: the illustration is the
                  block's mark, and stacked above the heading it pushed the
                  button off a phone screen entirely. */}
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]}>History</Text>
                  <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>Room change request history</Text>
                  <Text style={[type.body, { color: colors.muted }]}>
                    Requests that have expired and can no longer be acted on.
                  </Text>
                </View>
                <Image
                  accessibilityIgnoresInvertColors
                  accessible={false}
                  resizeMode="contain"
                  source={ROOM_CHANGE_ARTWORK}
                  style={{ height: 96, width: 96 }}
                />
              </View>
              <ActionButton
                icon={FileClock}
                label={`${expiredRequests.length} past request${expiredRequests.length === 1 ? "" : "s"}`}
                onPress={() => setPastOpen(true)}
                variant="outline"
              />
            </View>
          </Card>

          <View style={{ gap: spacing.md }}>
            {/* The shared search box, so this screen has the magnifier, the
                clear button and the focus border every other search has. It was
                a bare text input with none of them. */}
            <SearchField
              autoCapitalize="characters"
              onChangeText={(next) => {
                setSearch(next);
                setActivePage(0);
              }}
              placeholder="Search by request ID"
              value={search}
            />
            {/* Counts on the pills, not in a heading. The heading said "4
                requests", which was only ever the count of the filter already
                chosen — so the number moved when a tab was tapped and the other
                tabs gave no hint of what they held. */}
            <CountTabPills
              onChange={(next) => {
                setAttention(next);
                setActivePage(0);
              }}
              options={[
                // All leads, as it does on every other filter strip in the app
                // — the widest set first, then the narrowings of it. The screen
                // still OPENS on "Needs action" when anything is waiting; where
                // a tab sits and which one is selected are separate questions.
                { count: liveRequests.length, label: "All", value: "all" as const },
                { count: unattended.length, label: "Needs action", value: "unattended" as const },
                { count: attended.length, label: "Decided", value: "attended" as const },
              ]}
              value={filter}
            />

            {requestsQuery.isFetching && requests.length === 0 ? (
              <OwnerRequestListSkeleton />
            ) : activeRequests.length === 0 ? (
              <EmptyState
                artwork={REQUEST_EMPTY_ILLUSTRATION}
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
                  <RoomChangeCard
                    chain={chainByHeadId.get(request.id)}
                    key={request.id}
                    request={request}
                    currentRoomLabel={roomLabels[request.currentRoomId]}
                    targetRoomLabel={roomLabels[request.targetRoomId]}
                    canManage={canManageRoomChanges}
                    onApprove={() => openReview(request, "approve")}
                    onReject={() => openReview(request, "reject")}
                    onRevert={() => setRevertTarget(request)}
                  />
                ))}
                {activeRequests.length > 0 ? (
                  <PaginationBar
                    hasNext={activePaged.hasNext}
                    hasPrevious={activePaged.hasPrevious}
                    onNext={() => setActivePage(activePaged.page + 1)}
                    onPrevious={() => setActivePage(Math.max(0, activePaged.page - 1))}
                    page={activePaged.page}
                    totalElements={activeRequests.length}
                    totalPages={activePaged.totalPages}
                  />
                ) : null}
              </View>
            )}
          </View>
        </>
      ) : null}

      {selected && mode ? <RoomChangeReviewModal mode={mode} onClose={closeReview} request={selected} /> : null}
      {revertTarget ? (
        <ConfirmDialog
          confirmLabel="Revert approval"
          message={`This releases ${roomLabels[revertTarget.targetRoomId] ?? "the target room"} and returns ${revertTarget.referenceCode} to Needs action for a fresh decision.`}
          onCancel={() => setRevertTarget(null)}
          onConfirm={() => void confirmApprovalRevert()}
          title="Revert room-change approval?"
        />
      ) : null}
      {revertError ? <AlertModal message={revertError} onClose={() => setRevertError(null)} /> : null}
      {pastOpen ? (
        <PastRoomChangeRequestsModal
          chains={chainByHeadId}
          onClose={() => setPastOpen(false)}
          requests={expiredRequests}
          roomLabels={roomLabels}
        />
      ) : null}
    </ScreenScrollView>
  );
}

const ACTIVE_PAGE_SIZE = 5;
const PAST_PAGE_SIZE = 8;

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

// Reviewed (non-pending) room-change requests, paginated in a modal like concern history.
function PastRoomChangeRequestsModal({
  chains,
  onClose,
  requests,
  roomLabels,
}: {
  chains: Map<string, RoomChangeRequestChain>;
  onClose: () => void;
  requests: TenancyRoomChangeRequest[];
  roomLabels: Record<string, string>;
}) {
  const { colors, fonts, type } = useTheme();
  const [page, setPage] = useState(0);
  const paged = paginateArray(requests, page, PAST_PAGE_SIZE);

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Full width, matching the exit history. These cards carry a timeline
          button and a rail behind it; an inset sheet squeezed both. */}
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
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, }}>Reviewed moves</Text>
            </View>
            <IconButton accessibilityLabel="Close past requests" filled icon={X} onPress={onClose} />
          </View>
          {requests.length === 0 ? (
            <EmptyState artwork={REQUEST_EMPTY_ILLUSTRATION} title="No past requests" description="Reviewed room-change requests will appear here once you approve or reject them." />
          ) : (
            <>
              <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
                {paged.pageItems.map((request) => (
                  <RoomChangeCard
                    chain={chains.get(request.id)}
                    key={request.id}
                    currentRoomLabel={roomLabels[request.currentRoomId]}
                    onApprove={() => {}}
                    onReject={() => {}}
                    request={request}
                    targetRoomLabel={roomLabels[request.targetRoomId]}
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

function RoomChangeCard({
  canManage = true,
  chain,
  currentRoomLabel,
  onApprove,
  onReject,
  onRevert,
  request,
  targetRoomLabel,
}: {
  canManage?: boolean;
  chain?: RoomChangeRequestChain;
  currentRoomLabel?: string;
  onApprove: () => void;
  onReject: () => void;
  onRevert?: () => void;
  request: TenancyRoomChangeRequest;
  targetRoomLabel?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const pending = request.status === "REQUESTED";
  const [info, setInfo] = useState<{ label: string; value: string } | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const attempts = chain?.links.length ?? 1;

  return (
    <>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.neutralSoft,
                borderRadius: 999,
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <Repeat2 color={colors.ink} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 25 }}
              >
                {request.tenantName ?? "Tenant"}
              </Text>
              <Text style={[type.caption, { color: colors.kicker, fontWeight: "800" }]}>
                {request.referenceCode}
              </Text>
            </View>
            <StatusBadge status={request.status} />
          </View>

          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: 14,
              gap: spacing.sm,
              padding: spacing.md,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>From</Text>
                <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                  {currentRoomLabel ?? "Current room"}
                </Text>
              </View>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: 999,
                  height: 30,
                  justifyContent: "center",
                  width: 30,
                }}
              >
                <ArrowRight color={colors.ink} size={16} strokeWidth={2.2} />
              </View>
              <View style={{ alignItems: "flex-end", flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>To</Text>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15, textAlign: "right" }}
                >
                  {targetRoomLabel ?? "New room"}
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: colors.border, height: 1 }} />

            <InfoLine icon={CalendarDays} label="Transfer date" value={formatDate(request.effectiveTransferDate)} />
            {request.decidedByName && request.decidedAt ? (
              <>
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
            <InfoLine icon={IndianRupee} label="New rent" value={formatMoney(request.requestedRoomRentAmountPaise)} />
            {request.executedRentAmountPaise != null ? (
              <InfoLine icon={IndianRupee} label="Executed rent" value={formatMoney(request.executedRentAmountPaise)} />
            ) : null}
            {request.tenantReason ? (
              <InfoRow icon={FileText} label="Reason" onPress={() => setInfo({ label: "Reason", value: request.tenantReason ?? "" })} />
            ) : null}
            {request.adminNotes ? (
              <InfoRow icon={FileText} label="Notes" onPress={() => setInfo({ label: "Notes", value: request.adminNotes ?? "" })} />
            ) : null}
          </View>

          {pending ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton disabled={!canManage} label="Approve" onPress={onApprove} />
              <ActionButton disabled={!canManage} label="Reject" onPress={onReject} variant="danger" />
            </View>
          ) : null}

          {request.approvalRevertAllowed && onRevert ? (
            <ActionButton
              disabled={!canManage}
              icon={RotateCcw}
              label="Revert approval"
              onPress={onRevert}
              variant="secondary"
            />
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
          entries={roomChangeTimelineEntries(chain ?? request)}
          onClose={() => setShowTimeline(false)}
          referenceCode={request.referenceCode}
          roomLabel={currentRoomLabel}
          tenantName={request.tenantName}
          viewer="MANAGEMENT"
        />
      ) : null}
    </>
  );
}

function RoomChangeReviewModal({
  mode,
  onClose,
  request,
}: {
  mode: ReviewMode;
  onClose: () => void;
  request: TenancyRoomChangeRequest;
}) {
  const { colors, fonts, type } = useTheme();
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState("");
  // No required field on this sheet — the note is optional — so every failure
  // here is a server one.
  const opErrors = useFormErrors<never>();
  const [confirm, setConfirm] = useState<{ confirmLabel: string; destructive?: boolean; message: string; title: string } | null>(null);

  const [approveRoomChange, approveState] = useApproveRoomChangeRequestMutation();
  const [rejectRoomChange, rejectState] = useRejectRoomChangeRequestMutation();
  const busy = approveState.isLoading || rejectState.isLoading;

  const title = mode === "approve" ? "Approve room change" : "Reject room change";

  function handleSubmit() {
    if (busy) {
      return;
    }

    if (mode === "approve") {
      setConfirm({
        confirmLabel: "Approve",
        message: "Approval authorizes the transfer. It executes automatically at the end of the current billing cycle.",
        title: "Approve room change?",
      });
      return;
    }

    setConfirm({
      confirmLabel: "Reject",
      destructive: true,
      message: "Reject this room-change request?",
      title: "Reject room change?",
    });
  }

  async function submit() {
    try {
      if (mode === "approve") {
        await approveRoomChange({ adminNotes: notes.trim() || null, requestId: request.id }).unwrap();
      } else {
        await rejectRoomChange({ adminNotes: notes.trim() || null, requestId: request.id }).unwrap();
      }
      onClose();
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <>
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              marginBottom: keyboardInset,
              maxHeight: "90%",
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  Room change
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, }}>
                  {title}
                </Text>
              </View>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={{ flexShrink: 1 }}
            >
              <FormInput multiline label={mode === "reject" ? "Rejection note" : "Note (optional)"} onChangeText={setNotes} placeholder="Optional note for the tenant" value={notes} />
              {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
            </ScrollView>

            {/* A plain bordered footer, NOT PinnedFooter — that one paints a
                gradient fade for full screens and expects scroll clearance this
                sheet never adds, so the fade read as a stray shadow and the last
                input clipped under the button. */}
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
                on iOS, so without this the button is half-covered. */}
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

function SummaryTile({
  hint,
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  hint: string;
  icon: ComponentType<LucideProps>;
  label: string;
  tone?: "default" | "primary";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "primary" ? colors.primary : colors.ink;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        gap: spacing.xs,
        // Centred, because tiles in a row stretch to the tallest of them.
        justifyContent: "center",
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {/* The app's one metric card: a 38pt ink glyph in a 44-wide rail with the
          label and number stacked beside it — the billing, concern and tenancy
          tiles' exact layout. Above the label the glyph made these two the
          tallest things on the screen and read as a different KIND of figure
          from the same counts elsewhere. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
          <Icon color={colors.ink} size={38} strokeWidth={1.75} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
            {label}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: accent,
              fontFamily: fonts.display,
              fontSize: metricFontSize(value, 23),
              fontVariant: ["tabular-nums"],
              lineHeight: metricFontSize(value, 23) + 5,
            }}
          >
            {value}
          </Text>
        </View>
      </View>

      {/* Under the row on the tile's full width — beside a 38pt glyph the hint
          had half a tile and wrapped, leaving one tile taller than its pair. */}
      <Text numberOfLines={2} style={[type.caption, { color: colors.kicker, fontSize: 11, lineHeight: 15 }]}>
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
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string;
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

// LOCAL VARIANT — deliberately NOT the shared ActionButton in
// `@/features/owner/owner-ui`. It differs (13px label, no danger variant, no haptics), so editing the shared
// one does NOT change this screen. Unify before adding behaviour to either.

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}

function byPendingFirst(left: TenancyRoomChangeRequest, right: TenancyRoomChangeRequest) {
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

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
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
