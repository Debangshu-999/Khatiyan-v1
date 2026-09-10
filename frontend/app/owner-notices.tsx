import { useMemo, useState } from "react";
import { Modal, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  Archive,
  CalendarDays,
  ChevronRight,
  Edit3,
  Flame,
  Megaphone,
  Plus,
  Repeat2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import {
  Fact,
  FactRow,
  LaneBadge,
  PriorityFact,
  noticeLane,
  priorityLabel,
  type CardFact,
  type NoticeLane,
} from "@/features/notice/notice-ui";
import { CountTabPills } from "@/components/filter-bubbles";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { OwnerNoticeListSkeleton, OwnerNoticeTotalsSkeleton } from "@/components/skeletons/owner";
import { classifyToast, useToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, IconButton, ViewOnlyChip, humanizeToken } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  canEditNotice,
  type NoticePriority,
  type NoticeSummary,
  type RecurringNoticeSummary,
  useArchiveNoticeMutation,
  useDeleteNoticeMutation,
  useDeleteRecurringNoticeMutation,
  useListArchivedNoticesQuery,
  useListPublishedNoticesQuery,
  useListRecurringNoticesQuery,
} from "@/store/services/notice-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NOTICE_EMPTY_ILLUSTRATION = require("../assets/workspace/No-Notice_512x512.png");

type NoticeConfirmState =
  | { action: "archive" | "delete"; notice: NoticeSummary }
  | { action: "delete-recurring"; recurringNotice: RecurringNoticeSummary };

type BoardTab = "active" | "scheduled" | "recurring" | "archived";

/** One list holding both kinds of thing, so the board can order them together. */
type BoardItem =
  | { kind: "notice"; lane: NoticeLane; notice: NoticeSummary; sortAt: number }
  | { kind: "recurring"; lane: NoticeLane; recurringNotice: RecurringNoticeSummary; sortAt: number };

/**
 * Recurring is a filter, not a separate mode.
 *
 * <p>
 * It used to be a tab switcher above the list, which made the schedules a
 * different part of the app rather than one more kind of thing on the board —
 * an owner had to know they existed to go and look. As one lane beside the
 * others they are named on the board itself.
 */
const TAB_LANES: Record<BoardTab, NoticeLane[]> = {
  active: ["LIVE"],
  scheduled: ["SCHEDULED"],
  recurring: ["RECURRING", "PAUSED"],
  archived: ["ARCHIVED", "ENDED"],
};

/**
 * The board opens on what is out there right now.
 *
 * <p>There is no "All" tab. Every lane already has one, and a fifth reading
 * "everything" turned the other four into optional refinements of a list that
 * mixes a notice ending next week with one archived in March — which is not a
 * list anyone reads.
 */
const DEFAULT_TAB: BoardTab = "active";

const PRIORITY_FILTERS: { label: string; value: NoticePriority | "ALL" }[] = [
  { label: "Any", value: "ALL" },
  { label: "Normal", value: "NORMAL" },
  { label: "Important", value: "IMPORTANT" },
  { label: "Urgent", value: "URGENT" },
  { label: "Emergency", value: "EMERGENCY" },
];

export default function OwnerNoticesScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  // Publishing, editing, archiving and scheduling are NOTICES at MANAGE. The
  // backend enforces it; without this the buttons stayed live and a view-only
  // manager only learned the truth from a 403.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageNotices = canManageResource("NOTICES");

  const [tab, setTab] = useState<BoardTab>(DEFAULT_TAB);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<NoticePriority | "ALL">("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirm, setConfirm] = useState<NoticeConfirmState | null>(null);
  // Failures raised anywhere on this screen; no field owns them.
  const opErrors = useFormErrors<never>();

  const setStatus = (value: string | null) => {
    if (!value) {
      return;
    }
    // A failure ends the attempt, so it interrupts; a confirmation does not.
    if (classifyToast(value) === "error") {
      opErrors.failFromServer(value);
      return;
    }
    toast.show(value);
  };

  const publishedQuery = useListPublishedNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const archivedQuery = useListArchivedNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const recurringQuery = useListRecurringNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const [archiveNotice] = useArchiveNoticeMutation();
  const [deleteNotice] = useDeleteNoticeMutation();
  const [deleteRecurringNotice] = useDeleteRecurringNoticeMutation();

  const loading = publishedQuery.isFetching || archivedQuery.isFetching || recurringQuery.isFetching;
  const initialLoading =
    loading && !publishedQuery.data && !archivedQuery.data && !recurringQuery.data;

  /**
   * Everything on the board, newest first, before any filter is applied.
   *
   * <p>Sorted on one key across both types — a schedule has no publish date, so
   * it is ordered by when it was created. Without a shared key the two kinds
   * would interleave by whatever order the two requests happened to return in.
   */
  const board = useMemo<BoardItem[]>(() => {
    const items: BoardItem[] = [];
    for (const notice of publishedQuery.data ?? []) {
      items.push({ kind: "notice", lane: noticeLane(notice), notice, sortAt: Date.parse(notice.visibleFrom) });
    }
    for (const notice of archivedQuery.data ?? []) {
      items.push({ kind: "notice", lane: "ARCHIVED", notice, sortAt: Date.parse(notice.visibleFrom) });
    }
    for (const recurringNotice of recurringQuery.data ?? []) {
      items.push({
        kind: "recurring",
        lane: recurringNotice.status === "PAUSED" ? "PAUSED" : "RECURRING",
        recurringNotice,
        sortAt: Date.parse(recurringNotice.createdAt),
      });
    }
    return items.sort((left, right) => right.sortAt - left.sortAt);
  }, [archivedQuery.data, publishedQuery.data, recurringQuery.data]);

  /**
   * Search, filtered in the browser over what is already loaded.
   *
   * <p>There is no notice search endpoint yet. A property's notices are a short
   * list that this screen has already fetched in full, so narrowing it here is
   * both instant and honest — nothing is hidden beyond a page boundary the user
   * cannot see. It becomes a server query the day a property has enough notices
   * to paginate.
   */
  const visible = useMemo(() => {
    const lanes = TAB_LANES[tab];
    const needle = search.trim().toLowerCase();
    return board.filter((item) => {
      if (!lanes.includes(item.lane)) {
        return false;
      }
      const source = item.kind === "notice" ? item.notice : item.recurringNotice;
      if (priority !== "ALL" && source.priority !== priority) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        source.title.toLowerCase().includes(needle) || source.body.toLowerCase().includes(needle)
      );
    });
  }, [board, priority, search, tab]);

  const counts = useMemo(
    () => ({
      live: board.filter((item) => item.lane === "LIVE").length,
      recurring: board.filter((item) => item.lane === "RECURRING").length,
      scheduled: board.filter((item) => item.lane === "SCHEDULED").length,
    }),
    [board],
  );

  async function confirmAction() {
    if (!confirm) {
      return;
    }
    try {
      if (confirm.action === "delete-recurring") {
        await deleteRecurringNotice(confirm.recurringNotice.id).unwrap();
        setStatus("Recurring notice deleted.");
      } else if (confirm.action === "archive") {
        await archiveNotice(confirm.notice.id).unwrap();
        setStatus("Notice archived.");
      } else {
        await deleteNotice(confirm.notice.id).unwrap();
        setStatus("Notice deleted.");
      }
      setConfirm(null);
    } catch {
      setStatus("Could not update notice.");
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      {/* No back button and no eyebrow, so the header is the title and the
          property alone. This board is reached from Manage, which the tab bar
          already gets you back to — an arrow here pointed at a screen the
          reader had not necessarily come from. The device back gesture still
          works. */}
      <ScreenHeader
        badge={!canManageNotices ? <ViewOnlyChip /> : null}
        italicTail="desk."
        subtitle={
          selectedProperty
            ? `Notice workspace for ${selectedProperty.name}.`
            : "Select a property on Home first."
        }
        title="Notice"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Notices are scoped to the active owner property."
          icon={Megaphone}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <>
          <SearchField
            onChangeText={setSearch}
            placeholder="Search notices"
            trailing={
              <IconButton
                accessibilityLabel="Filter notices by priority"
                icon={SlidersHorizontal}
                onPress={() => setFiltersOpen(true)}
              />
            }
            value={search}
          />

          {/* The app's count-tab strip, shared with upcoming notices, exit
              requests and room-change requests — see CountTabPills. */}
          <CountTabPills
            onChange={setTab}
            options={BOARD_TABS.map((entry) => ({
              count: initialLoading
                ? undefined
                : board.filter((item) => TAB_LANES[entry.value].includes(item.lane)).length,
              label: entry.label,
              value: entry.value,
            }))}
            value={tab}
          />

          {initialLoading ? (
            <OwnerNoticeTotalsSkeleton />
          ) : (
            <BoardTotals live={counts.live} recurring={counts.recurring} scheduled={counts.scheduled} />
          )}

          <ActionButton
            disabled={!canManageNotices}
            icon={Plus}
            label="Create notice"
            onPress={() => router.push("/owner-notice-create")}
          />

          {/* Says what narrowed the list, and undoes it. A tab shows its own
              state in the pill row, but a priority chosen behind the filter
              button is invisible — an owner would see three notices where they
              expected nine and have nothing on screen to explain it. */}
          {priority !== "ALL" ? (
            /* One bubble, in the tab pills' own light blue, and pressing it
               clears. It used to be three separate things in a row — the word
               "Showing", a pill, and "tap to clear" — which wrapped on a narrow
               phone and left the instruction stranded on its own line under the
               chip it was describing. The cross says "remove this" without a
               sentence around it. */
            <AnimatedPressable
              accessibilityLabel={`Clear the ${priorityLabel(priority as NoticePriority)} filter`}
              accessibilityRole="button"
              onPress={() => setPriority("ALL")}
              style={{
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: colors.primarySoft,
                borderCurve: "continuous",
                borderRadius: 999,
                flexDirection: "row",
                gap: spacing.xs,
                minHeight: 34,
                // Tighter on the cross's side: the glyph carries its own
                // optical margin, and equal padding left it adrift of the edge.
                paddingLeft: spacing.md,
                paddingRight: spacing.sm,
              }}
              tapLockMs={0}
            >
              <Text
                style={[
                  type.caption,
                  { color: colors.primaryDeep, fontFamily: fonts.sansSemiBold, fontSize: 12.5 },
                ]}
              >
                {priorityLabel(priority as NoticePriority)}
              </Text>
              <X color={colors.primaryDeep} size={14} strokeWidth={2.6} />
            </AnimatedPressable>
          ) : null}

          {initialLoading ? (
            <OwnerNoticeListSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState
              artwork={NOTICE_EMPTY_ILLUSTRATION}
              description={
                search.trim() || priority !== "ALL"
                  ? "Nothing here matches what you searched for. Try a different word, or clear the filter."
                  : "Notices you publish for this property will appear here."
              }
              title={search.trim() || priority !== "ALL" ? "No matches" : "Nothing on the board"}
            />
          ) : (
            visible.map((item) =>
              item.kind === "notice" ? (
                <NoticeCard
                  canManage={canManageNotices}
                  key={item.notice.id}
                  lane={item.lane}
                  notice={item.notice}
                  onArchive={() => setConfirm({ action: "archive", notice: item.notice })}
                  onDelete={() => setConfirm({ action: "delete", notice: item.notice })}
                  onEdit={() => router.push(`/owner-notice-detail?noticeId=${item.notice.id}&edit=1`)}
                  onOpen={() => router.push(`/owner-notice-detail?noticeId=${item.notice.id}`)}
                />
              ) : (
                <RecurringNoticeCard
                  canManage={canManageNotices}
                  key={item.recurringNotice.id}
                  lane={item.lane}
                  onDelete={() => setConfirm({ action: "delete-recurring", recurringNotice: item.recurringNotice })}
                  onEdit={() => router.push(`/owner-notice-create?recurringNoticeId=${item.recurringNotice.id}`)}
                  recurringNotice={item.recurringNotice}
                />
              ),
            )
          )}
        </>
      ) : null}

      {filtersOpen ? (
        <PriorityFilterDialog onClose={() => setFiltersOpen(false)} onSelectPriority={setPriority} value={priority} />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          confirmLabel={confirm.action === "archive" ? "Archive" : "Delete"}
          destructive={confirm.action !== "archive"}
          message={confirmMessage(confirm)}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAction}
          title={confirm.action === "archive" ? "Archive notice?" : "Delete notice?"}
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

const BOARD_TABS: { label: string; value: BoardTab }[] = [
  { label: "Active", value: "active" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Recurring", value: "recurring" },
  { label: "Archived", value: "archived" },
];

/** One lane's filter pill — the payment history screen's control, reused. */
/**
 * The board's three numbers, in one strip.
 *
 * <p>
 * Live, scheduled and recurring rather than a total: an owner opening this
 * screen is checking whether anything is out there right now and whether
 * anything is about to go out, and a single count of everything ever published
 * answers neither.
 */
function BoardTotals({ live, recurring, scheduled }: { live: number; recurring: number; scheduled: number }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        paddingVertical: spacing.md,
      }}
    >
      <TotalsColumn label="Live" value={live} />
      <TotalsRule />
      <TotalsColumn label="Scheduled" value={scheduled} />
      <TotalsRule />
      <TotalsColumn label="Recurring" value={recurring} />
    </View>
  );
}

function TotalsColumn({ label, value }: { label: string; value: number }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flex: 1, gap: 2 }}>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

function TotalsRule() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, marginVertical: 2, width: 1 }} />;
}

function NoticeCard({
  canManage,
  lane,
  notice,
  onArchive,
  onDelete,
  onEdit,
  onOpen,
}: {
  canManage: boolean;
  lane: NoticeLane;
  notice: NoticeSummary;
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const editable = canManage && canEditNotice(notice);
  const archivable = canManage && canBeArchived(notice);
  const showActions = editable || archivable;

  return (
    <BoardCard
      footerLeft={<PriorityFact priority={notice.priority} />}
      footerRight={<EndFact notice={notice} />}
      lane={lane}
      metaLeft={{ icon: Users, text: "All tenants" }}
      metaRight={{ icon: CalendarDays, text: formatDateTime(notice.visibleFrom) }}
      onPress={onOpen}
      subtitle={notice.body}
      title={notice.title}
    >
      {showActions ? (
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {/* Edit and Delete close together, the moment the notice goes live.
              Both rewrite what tenants were already told, so they are absent
              rather than disabled — a greyed button invites a tap and explains
              nothing about why the window shut. */}
          {editable ? <ActionButton compact icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" /> : null}
          {/* Archiving retires a notice tenants have finished seeing. Before
              that there is nothing to retire — an unwanted notice is deleted. */}
          {archivable ? (
            <ActionButton compact icon={Archive} label="Archive" onPress={onArchive} variant="secondary" />
          ) : null}
          {editable ? <ActionButton compact icon={Trash2} label="Delete" onPress={onDelete} variant="danger" /> : null}
        </View>
      ) : null}
    </BoardCard>
  );
}

function RecurringNoticeCard({
  canManage,
  lane,
  onDelete,
  onEdit,
  recurringNotice,
}: {
  canManage: boolean;
  lane: NoticeLane;
  onDelete: () => void;
  onEdit: () => void;
  recurringNotice: RecurringNoticeSummary;
}) {
  return (
    <BoardCard
      footerLeft={<PriorityFact priority={recurringNotice.priority} />}
      footerRight={{
        icon: CalendarDays,
        text: `${trimSeconds(recurringNotice.startTime)} – ${trimSeconds(recurringNotice.endTime)}`,
      }}
      lane={lane}
      metaLeft={{ icon: Repeat2, text: humanizeToken(recurringNotice.frequency) }}
      metaRight={{ icon: CalendarDays, text: scheduleSummary(recurringNotice) }}
      subtitle={recurringNotice.body}
      title={recurringNotice.title}
    >
      {canManage ? (
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <ActionButton compact icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton compact icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
        </View>
      ) : null}
    </BoardCard>
  );
}

/**
 * The shape every row on the board takes.
 *
 * <p>
 * Status, then what it says, then two facts about when, then two facts about
 * what kind of thing it is. Both card types render through this rather than
 * each drawing its own, because a schedule and a notice sitting in one list
 * that were laid out differently would read as a rendering fault rather than a
 * distinction.
 */
function BoardCard({
  children,
  footerLeft,
  footerRight,
  lane,
  metaLeft,
  metaRight,
  onPress,
  subtitle,
  title,
}: {
  /** The action row, when the reader is allowed one. */
  children?: React.ReactNode;
  footerLeft: CardFact | React.ReactElement;
  footerRight: CardFact | React.ReactElement;
  lane: NoticeLane;
  metaLeft: CardFact;
  metaRight: CardFact;
  /** Absent on a schedule, which has no detail screen to open. */
  onPress?: () => void;
  subtitle: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  const body = (
    <>
      <LaneBadge lane={lane} />

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {title}
          </Text>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            {subtitle}
          </Text>
        </View>
        {/* Only where there is somewhere to go. A chevron on a card that does
            not open is an arrow pointing at nothing. */}
        {onPress ? <ChevronRight color={colors.kicker} size={20} strokeWidth={2.2} /> : null}
      </View>

      <FactRow left={metaLeft} right={metaRight} />

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      <FactRow left={footerLeft} right={footerRight} />

      {children}
    </>
  );

  const style = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: "continuous" as const,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  };

  if (!onPress) {
    return <View style={style}>{body}</View>;
  }

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </AnimatedPressable>
  );
}

/** When a notice stops being shown, which is the thing owners forget to set. */
function EndFact({ notice }: { notice: NoticeSummary }) {
  return (
    <Fact
      fact={{
        icon: CalendarDays,
        // The day only. This is one of two facts sharing a card's width, and
        // "Until 05 Sept, 06:10 pm" ellipsised its own time away in that space.
        // The exact minute is on the notice's own screen, where it has a full
        // row to itself.
        text: notice.visibleUntil ? `Until ${formatDate(notice.visibleUntil)}` : "No end date",
      }}
    />
  );
}

/**
 * What the filter button opens.
 *
 * <p>
 * Centred rather than a bottom sheet: five short options is less choice than a
 * half-screen sheet implies, and the answer arrives under the reader's thumb
 * either way.
 */
/**
 * Picking the priority to filter by — the app's shared picker, the same one the
 * notice detail screen uses to CHANGE a priority.
 *
 * <p>
 * {@code PickerOptionRow} in a centred card, not a wrap of chips. Five chips
 * reflowed into two ragged rows whose widths said nothing about the values, and
 * a chosen chip and an unchosen one differed only by a soft tint — while every
 * other single-choice list in the app is a ruled table with a mark down one
 * side. This is that table.
 */
function PriorityFilterDialog({
  onClose,
  onSelectPriority,
  value,
}: {
  onClose: () => void;
  onSelectPriority: (value: NoticePriority | "ALL") => void;
  value: NoticePriority | "ALL";
}) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Tapping the scrim closes it. A centred dialog with no visible dismiss
          needs one, and a five-option choice does not deserve a Cancel button
          taking up a sixth row. */}
      <AnimatedPressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
        tapLockMs={0}
      >
        {/* Its own pressable so a tap on the card does not reach the scrim
            behind it and close the picker mid-decision. */}
        <AnimatedPressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}
          tapLockMs={0}
        >
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.display,
              fontSize: 19,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            Filter by priority
          </Text>

          {/* The same row every other picker in the app uses. Its hairline runs
              above each option INCLUDING the first, which is what separates the
              list from the heading above it. */}
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
            {PRIORITY_FILTERS.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onSelectPriority(option.value);
                  onClose();
                }}
                selected={option.value === value}
              />
            ))}
          </View>
        </AnimatedPressable>
      </AnimatedPressable>
    </Modal>
  );
}

/** "Every day", "Mon, Wed", "Day 1, 15" — the schedule in one line. */
function scheduleSummary(recurringNotice: RecurringNoticeSummary) {
  if (recurringNotice.frequency === "DAILY") {
    return "Every day";
  }
  if (recurringNotice.frequency === "WEEKLY") {
    return recurringNotice.daysOfWeek.length > 0
      ? recurringNotice.daysOfWeek.map((day) => day.slice(0, 3).charAt(0) + day.slice(1, 3).toLowerCase()).join(", ")
      : "Every week";
  }
  return recurringNotice.daysOfMonth.length > 0
    ? `Day ${recurringNotice.daysOfMonth.join(", ")}`
    : "Every month";
}

function trimSeconds(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/**
 * Archiving retires a notice that is already live — the only exit it has, since
 * editing and deleting both close the moment it goes live.
 *
 * <p>Keyed on having gone live, not on having expired. The expiry rule left a
 * notice with no end date unarchivable for ever, and for the ones that did
 * expire the scheduler had usually archived them already.
 */
function canBeArchived(notice: NoticeSummary) {
  return notice.status === "PUBLISHED" && new Date(notice.visibleFrom).getTime() <= Date.now();
}

function confirmMessage(confirm: NoticeConfirmState) {
  if (confirm.action === "delete-recurring") {
    return `Delete recurring notice "${confirm.recurringNotice.title}"?`;
  }
  return `${humanizeToken(confirm.action)} "${confirm.notice.title}"?`;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;
}
