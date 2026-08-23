import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Clock, DoorOpen, FileClock, History, Repeat, Undo2, UserRound, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { FilterBubbles } from "@/components/filter-bubbles";
import { SkeletonCard } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  buildExitRequestChains,
  exitTimelineEntries,
  roomChangeTimelineEntries,
  type ExitRequestChain,
} from "@/features/tenancy/request-chain";
import { RequestReasonInfo } from "@/features/tenancy/request-reason-info";
import { RequestTimelineSheet } from "@/features/tenancy/request-timeline-sheet";
import {
  matchesRequestSearch,
  requestCounts,
  splitByActivity,
  splitByAttention,
  type RequestFilter,
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

type RequestKind = "EXIT" | "ROOM_CHANGE";

const KIND_TABS: { label: string; value: RequestKind }[] = [
  { label: "Exit", value: "EXIT" },
  { label: "Room change", value: "ROOM_CHANGE" },
];

/**
 * The tenant's request workspace, one tab per kind.
 *
 * <p>Exits and room changes were previously interleaved behind a filter, which
 * made "how many of mine are live" unanswerable at a glance — the counts covered
 * both kinds at once and the rules differ between them. A tab each means every
 * count, every section and every action on screen belongs to one kind.
 */
export default function TenancyRequestHistoryScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ excludeTenancyId?: string; scope?: string; tenancyId?: string }>();
  const [kind, setKind] = useState<RequestKind>("EXIT");

  const exitQuery = useListMyExitRequestsQuery();
  const roomChangeQuery = useListMyRoomChangeRequestsQuery();
  const loading = exitQuery.isFetching || roomChangeQuery.isFetching;

  const scopedExits = scopeToTenancy(exitQuery.data ?? [], params);
  const scopedRoomChanges = scopeToTenancy(roomChangeQuery.data ?? [], params);

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        title="Your"
        italicTail="requests."
        subtitle="Raise, follow and act on your exit and room change requests."
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {KIND_TABS.map((tab) => (
          <TabButton
            active={kind === tab.value}
            key={tab.value}
            label={tab.label}
            onPress={() => setKind(tab.value)}
          />
        ))}
      </View>

      {kind === "EXIT" ? (
        <ExitTab loading={loading} requests={scopedExits} />
      ) : (
        <RoomChangeTab loading={loading} requests={scopedRoomChanges} />
      )}
    </ScreenScrollView>
  );
}

function ExitTab({ loading, requests }: { loading: boolean; requests: TenancyExitRequest[] }) {
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  /** Null until picked, so the default can react to data that arrives later. */
  const [attention, setAttention] = useState<RequestFilter | null>(null);

  // Re-raises collapse into their newest link, so one intent counts once.
  const chains = useMemo(() => buildExitRequestChains(requests), [requests]);
  const heads = chains.map((chain) => chain.head);
  const chainByHeadId = useMemo(
    () => new Map(chains.map((chain) => [chain.head.id, chain])),
    [chains],
  );

  const counts = requestCounts(heads);
  const visible = heads.filter((request) => matchesRequestSearch(request, search));
  const { active: liveRequests, history } = splitByActivity(visible);
  const { attended, unattended } = splitByAttention(liveRequests);
  // Opens on what is still awaiting an answer, unless nothing is.
  const filter = attention ?? (unattended.length > 0 ? "unattended" : "all");
  const active =
    filter === "unattended" ? unattended : filter === "attended" ? attended : liveRequests;
  const activePaged = pageOf(active, activePage);
  const historyPaged = pageOf(history, historyPage);

  return (
    <View style={{ gap: spacing.lg }}>
      <OverviewTiles counts={counts} />

      <Section
        title={`${active.length} request${active.length === 1 ? "" : "s"}`}
        trailing={
          <FilterBubbles
            onChange={(next) => {
              setAttention(next);
              setActivePage(0);
            }}
            options={[
              { count: unattended.length, label: "Awaiting reply", value: "unattended" as const },
              { count: attended.length, label: "Answered", value: "attended" as const },
              { count: liveRequests.length, label: "All", value: "all" as const },
            ]}
            value={filter}
          />
        }
      >
        {/* The search sits with the list it filters. Above the tabs it looked
            like it searched the whole screen, and its example code could only
            name one of the two kinds. */}
        <SearchField
          onChangeText={(next) => {
            setSearch(next);
            setActivePage(0);
            setHistoryPage(0);
          }}
          placeholder="Search by code, e.g. TEX-2026-000042"
          value={search}
        />

        {loading && requests.length === 0 ? (
          <SkeletonCard />
        ) : active.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title={filter === "unattended" ? "Nothing awaiting a reply" : "No active exit requests"}
            description="A request stays here until it expires — including after it is decided."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {activePaged.items.map((request) => (
              <ExitCard chain={chainByHeadId.get(request.id)} key={request.id} request={request} />
            ))}
            <ListPager onPage={setActivePage} paged={activePaged} total={active.length} />
          </View>
        )}
      </Section>

      <Section title="Exit request history">
        {history.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title="No past exit requests"
            description="Requests move here once they expire."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {historyPaged.items.map((request) => (
              <ExitCard chain={chainByHeadId.get(request.id)} key={request.id} request={request} />
            ))}
            <ListPager onPage={setHistoryPage} paged={historyPaged} total={history.length} />
          </View>
        )}
      </Section>
    </View>
  );
}

function RoomChangeTab({
  loading,
  requests,
}: {
  loading: boolean;
  requests: TenancyRoomChangeRequest[];
}) {
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  /** Null until picked, so the default can react to data that arrives later. */
  const [attention, setAttention] = useState<RequestFilter | null>(null);

  const counts = requestCounts(requests);
  const visible = requests.filter((request) => matchesRequestSearch(request, search));
  const { active: liveRequests, history } = splitByActivity(visible);
  const { attended, unattended } = splitByAttention(liveRequests);
  // Opens on what is still awaiting an answer, unless nothing is.
  const filter = attention ?? (unattended.length > 0 ? "unattended" : "all");
  const active =
    filter === "unattended" ? unattended : filter === "attended" ? attended : liveRequests;
  const activePaged = pageOf(active, activePage);
  const historyPaged = pageOf(history, historyPage);

  return (
    <View style={{ gap: spacing.lg }}>
      <OverviewTiles counts={counts} />

      <Section
        title={`${active.length} request${active.length === 1 ? "" : "s"}`}
        trailing={
          <FilterBubbles
            onChange={(next) => {
              setAttention(next);
              setActivePage(0);
            }}
            options={[
              { count: unattended.length, label: "Awaiting reply", value: "unattended" as const },
              { count: attended.length, label: "Answered", value: "attended" as const },
              { count: liveRequests.length, label: "All", value: "all" as const },
            ]}
            value={filter}
          />
        }
      >
        <SearchField
          onChangeText={(next) => {
            setSearch(next);
            setActivePage(0);
            setHistoryPage(0);
          }}
          placeholder="Search by code, e.g. TRC-2026-000155"
          value={search}
        />

        {loading && requests.length === 0 ? (
          <SkeletonCard />
        ) : active.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={filter === "unattended" ? "Nothing awaiting a reply" : "No active room change requests"}
            description="A room change closes as soon as it is decided — there is no withdrawal window."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {activePaged.items.map((request) => (
              <RoomChangeCard key={request.id} request={request} />
            ))}
            <ListPager onPage={setActivePage} paged={activePaged} total={active.length} />
          </View>
        )}
      </Section>

      <Section title="Room change request history">
        {history.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title="No past room change requests"
            description="Requests move here once they are decided or expire."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {historyPaged.items.map((request) => (
              <RoomChangeCard key={request.id} request={request} />
            ))}
            <ListPager onPage={setHistoryPage} paged={historyPaged} total={history.length} />
          </View>
        )}
      </Section>
    </View>
  );
}

function OverviewTiles({ counts }: { counts: { active: number; expired: number; total: number } }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <SummaryTile
        hint="Still open"
        label="Active"
        tone={counts.active > 0 ? "primary" : "default"}
        value={String(counts.active)}
      />
      <SummaryTile
        hint={`${counts.expired} expired`}
        label="Total"
        value={String(counts.total)}
      />
    </View>
  );
}

function ExitCard({ chain, request }: { chain?: ExitRequestChain; request: TenancyExitRequest }) {
  const { colors, fonts, type } = useTheme();
  const [showTimeline, setShowTimeline] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const attempts = chain?.links.length ?? 1;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <RequestCardHeader
          referenceCode={request.referenceCode}
          status={request.status}
          tenantName={request.tenantName}
        />

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

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton
            icon={History}
            label={attempts > 1 ? `View timeline (${attempts})` : "View timeline"}
            onPress={() => setShowTimeline(true)}
            variant="outline"
          />
          {request.withdrawalWindowOpen ? (
            <ActionButton
              icon={Undo2}
              label="Cancel this exit"
              onPress={() => setShowWithdraw(true)}
              variant="outline"
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
    </Card>
  );
}

function RoomChangeCard({ request }: { request: TenancyRoomChangeRequest }) {
  const [showTimeline, setShowTimeline] = useState(false);

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <RequestCardHeader
          referenceCode={request.referenceCode}
          status={request.status}
          tenantName={request.tenantName}
        />

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

        <View style={{ flexDirection: "row" }}>
          <ActionButton
            icon={History}
            label="View timeline"
            onPress={() => setShowTimeline(true)}
            variant="outline"
          />
        </View>
      </View>

      {showTimeline ? (
        <RequestTimelineSheet
          entries={roomChangeTimelineEntries(request)}
          onClose={() => setShowTimeline(false)}
          referenceCode={request.referenceCode}
          tenantName={request.tenantName}
          viewer="TENANT"
        />
      ) : null}
    </Card>
  );
}

/** Tenant name large, room/code small beside it — who, then which. */
function RequestCardHeader({
  referenceCode,
  status,
  tenantName,
}: {
  referenceCode: string;
  status: string;
  tenantName: string | null;
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
          {tenantName ?? "You"}
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

function SearchField({
  onChangeText,
  placeholder,
  value,
}: {
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AppTextInput
      autoCapitalize="characters"
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.kicker}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        color: colors.ink,
        fontFamily: fonts.sans,
        fontSize: 15,
        minHeight: 48,
        paddingHorizontal: spacing.md,
      }}
      value={value}
    />
  );
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.ink : "transparent",
        borderColor: active ? colors.ink : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        paddingVertical: spacing.sm,
      }}
    >
      <Text
        style={{
          color: active ? colors.surface : colors.ink,
          fontFamily: fonts.sansBold,
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function SummaryTile({
  hint,
  label,
  tone = "default",
  value,
}: {
  hint: string;
  label: string;
  tone?: "default" | "primary";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const isPrimary = tone === "primary";

  return (
    <View
      style={{
        backgroundColor: isPrimary ? colors.primarySoft : colors.surface,
        borderColor: isPrimary ? colors.primary : colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]}>{label}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24 }}>{value}</Text>
      <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text>
    </View>
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

function scopeToTenancy<T extends { tenancyId: string }>(
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

const PAGE_SIZE = 5;

/** A page window over an in-memory list, clamped so a shrinking list is safe. */
function pageOf<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;

  return { items: items.slice(start, start + PAGE_SIZE), page: safePage, totalPages };
}

function ListPager({
  onPage,
  paged,
  total,
}: {
  onPage: (page: number) => void;
  paged: { page: number; totalPages: number };
  total: number;
}) {
  if (paged.totalPages <= 1) {
    return null;
  }

  return (
    <PaginationBar
      hasNext={paged.page + 1 < paged.totalPages}
      hasPrevious={paged.page > 0}
      onNext={() => onPage(paged.page + 1)}
      onPrevious={() => onPage(Math.max(0, paged.page - 1))}
      page={paged.page}
      totalElements={total}
      totalPages={paged.totalPages}
    />
  );
}
