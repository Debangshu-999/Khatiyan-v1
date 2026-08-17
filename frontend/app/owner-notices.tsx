import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Archive, CalendarClock, Check, Edit3, Info, Megaphone, Plus, Repeat2, Trash2, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { CollapsibleFilterBubbles } from "@/components/filter-bubbles";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { InfoModal } from "@/components/info-modal";
import { Section } from "@/components/section";
import { TabSwitcher } from "@/components/tab-switcher";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  ConfirmDialog,
  FormInput,
  IconButton,
  ViewOnlyChip,
  humanizeToken,
} from "@/features/owner/owner-ui";
import { NoticeCardBody } from "@/features/notice/notice-card-body";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  canEditNotice,
  type CreateNoticePayload,
  type CreateRecurringNoticePayload,
  type NoticePriority,
  type NoticeSummary,
  type RecurringNoticeFrequency,
  type RecurringNoticeSummary,
  useArchiveNoticeMutation,
  useDeleteNoticeMutation,
  useDeleteRecurringNoticeMutation,
  useListArchivedNoticesQuery,
  useListPublishedNoticesQuery,
  useListRecurringNoticesQuery,
  useListVisiblePropertyNoticesQuery,
  useUpdateRecurringNoticeMutation,
} from "@/store/services/notice-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type NoticeView = "normal" | "recurring";
type NoticeTab = "published" | "visible" | "archived";
type NoticeConfirmState =
  | { action: "archive" | "delete"; notice: NoticeSummary }
  | { action: "delete-recurring"; recurringNotice: RecurringNoticeSummary };

const PRIORITIES: NoticePriority[] = ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"];
const FREQUENCIES: RecurringNoticeFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];
type NoticeDateField = "visibleFrom" | "visibleUntil";
type NoticeDatePickerState = { field: NoticeDateField; mode: "date" | "time" } | null;

export default function OwnerNoticesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
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
  const [view, setView] = useState<NoticeView>("normal");
  const [tab, setTab] = useState<NoticeTab>("published");
  const [confirm, setConfirm] = useState<NoticeConfirmState | null>(null);
  const setStatus = (value: string | null) => {
    if (value) {
      toast.show(value, /could not|cannot|unable|failed/i.test(value) ? "error" : "success");
    }
  };

  const publishedQuery = useListPublishedNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const visibleQuery = useListVisiblePropertyNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const archivedQuery = useListArchivedNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const recurringQuery = useListRecurringNoticesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const [archiveNotice] = useArchiveNoticeMutation();
  const [deleteNotice] = useDeleteNoticeMutation();
  const [deleteRecurringNotice] = useDeleteRecurringNoticeMutation();

  const notices = tab === "visible" ? visibleQuery.data ?? [] : tab === "archived" ? archivedQuery.data ?? [] : publishedQuery.data ?? [];
  const loading =
    view === "recurring"
      ? recurringQuery.isFetching
      : tab === "visible"
        ? visibleQuery.isFetching
        : tab === "archived"
          ? archivedQuery.isFetching
          : publishedQuery.isFetching;

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
    // Publish is pinned below the scroll area rather than sitting above the
    // list: the notice list runs long, and a button at the top is the one thing
    // an owner scrolls away from the moment they start reading.
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}
      >
      <ScreenHeader
        badge={!canManageNotices ? <ViewOnlyChip /> : null}
        onBack={() => router.back()}
        eyebrow="Owner notice"
        italicTail="desk."
        subtitle={selectedProperty ? `Publish and review notices for ${selectedProperty.name}.` : "Select a property from Home first."}
        title="Notice"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Notices are scoped to the active owner property."
          eyebrow="Property required"
          icon={Megaphone}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <>
          <NoticeViewBar active={view} onChange={setView} />

          <Section
            title={view === "recurring" ? `${recurringQuery.data?.length ?? 0} schedules` : `${notices.length} notices`}
            trailingInline
            trailing={
              view === "normal" ? (
                <CollapsibleFilterBubbles
                  onChange={setTab}
                  options={[
                    { label: "Published", value: "published" as const },
                    { label: "Visible", value: "visible" as const },
                    { label: "Archived", value: "archived" as const },
                  ]}
                  value={tab}
                />
              ) : null
            }
          >
            {loading ? (
              <SkeletonCard />
            ) : view === "recurring" ? (
              (recurringQuery.data ?? []).length > 0 ? (
                (recurringQuery.data ?? []).map((recurringNotice) => (
                  <RecurringNoticeCard
                    canManage={canManageNotices}
                    key={recurringNotice.id}
                    onDelete={() => setConfirm({ action: "delete-recurring", recurringNotice })}
                    onEdit={() => router.push(`/owner-notice-create?recurringNoticeId=${recurringNotice.id}`)}
                    recurringNotice={recurringNotice}
                  />
                ))
              ) : (
                <EmptyState
                  description="Recurring notice schedules will appear here."
                  eyebrow="Recurring"
                  icon={CalendarClock}
                  title="No recurring notices"
                />
              )
            ) : notices.length > 0 ? (
              notices.map((notice) => (
                <NoticeCard
                  canManage={canManageNotices}
                  key={notice.id}
                  notice={notice}
                  onArchive={() => setConfirm({ action: "archive", notice })}
                  onDelete={() => setConfirm({ action: "delete", notice })}
                  onEdit={() => router.push(`/owner-notice-detail?noticeId=${notice.id}&edit=1`)}
                  onOpen={() => router.push(`/owner-notice-detail?noticeId=${notice.id}`)}
                  readOnly={tab === "archived"}
                />
              ))
            ) : (
              <EmptyState
                description="Published property notices will appear here."
                eyebrow="Notices"
                icon={Megaphone}
                title="No notices found"
              />
            )}
          </Section>
        </>
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
      </ScreenScrollView>

      {selectedProperty ? (
        <PinnedFooter>
          <ActionButton
            disabled={!canManageNotices}
            icon={Plus}
            label="Publish notice"
            onPress={() => router.push("/owner-notice-create")}
          />
        </PinnedFooter>
      ) : null}
    </View>
  );
}

function NoticeCard({
  canManage = true,
  notice,
  onArchive,
  onDelete,
  onEdit,
  onOpen,
  readOnly,
}: {
  canManage?: boolean;
  notice: NoticeSummary;
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const { colors, type } = useTheme();
  const editable = canManage !== false && canEditNotice(notice);
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: priorityColor(notice.priority, colors) }]}>
          {humanizeToken(notice.priority)} · {humanizeToken(notice.status)}
        </Text>
        <NoticeCardBody attachmentCount={notice.attachments.length} body={notice.body} onPress={onOpen} title={notice.title} />
        <Text style={[type.caption, { color: colors.kicker }]}>
          Visible {formatDateTime(notice.visibleFrom)}
          {notice.visibleUntil ? ` to ${formatDateTime(notice.visibleUntil)}` : ""}
        </Text>
        {!readOnly ? (
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {/* Edit and Delete close together, the moment the notice goes live.
                Both rewrite what tenants were already told, so they are absent
                rather than disabled — a greyed button invites a tap and
                explains nothing about why the window shut. */}
            {editable ? (
              <ActionButton compact icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
            ) : null}
            {/* Archiving retires a notice tenants have finished seeing. Before
                that there is nothing to retire — an unwanted notice is deleted,
                not archived. */}
            <ActionButton
              compact
              disabled={!canManage || !canBeArchived(notice)}
              icon={Archive}
              label="Archive"
              onPress={onArchive}
              variant="secondary"
            />
            {editable ? (
              <ActionButton compact icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function RecurringNoticeCard({
  canManage = true,
  recurringNotice,
  onDelete,
  onEdit,
}: {
  canManage?: boolean;
  recurringNotice: RecurringNoticeSummary;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {humanizeToken(recurringNotice.frequency)} · {formatTime(recurringNotice.startTime)} to {formatTime(recurringNotice.endTime)}
        </Text>
        <NoticeCardBody attachmentCount={recurringNotice.attachments.length} body={recurringNotice.body} title={recurringNotice.title} />
        <Text style={[type.caption, { color: colors.kicker }]}>
          Active {recurringNotice.activeFrom ?? "now"}
          {recurringNotice.activeUntil ? ` to ${recurringNotice.activeUntil}` : " onward"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton disabled={!canManage} icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton disabled={!canManage} icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
        </View>
      </View>
    </Card>
  );
}

function NoticeViewBar({ active, onChange }: { active: NoticeView; onChange: (view: NoticeView) => void }) {
  return (
    <TabSwitcher
      active={active}
      onChange={onChange}
      options={[
        { label: "Notices", value: "normal" },
        { label: "Recurring", value: "recurring" },
      ]}
    />
  );
}


function RecurringInfoModal({ onClose }: { onClose: () => void }) {
  const { colors, type } = useTheme();

  return (
    <InfoModal onClose={onClose} title="Recurring notice">
      <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
        A recurring notice is a reusable schedule. The system creates normal tenant-visible notices from it at the
        selected frequency and time window.
      </Text>
    </InfoModal>
  );
}


function DateTimeField({
  label,
  onClear,
  onPickDate,
  onPickTime,
  value,
}: {
  label: string;
  onClear: () => void;
  onPickDate: () => void;
  onPickTime: () => void;
  value: Date | null;
}) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
          {label}
        </Text>
        {value ? (
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text style={[type.caption, { color: colors.danger, fontWeight: "800" }]}>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.body, { color: value ? colors.ink : colors.muted, fontWeight: "800" }]}>
        {value ? formatNoticeDateTime(value) : "Not set"}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton icon={CalendarClock} label="Date" onPress={onPickDate} variant="secondary" />
        <ActionButton icon={CalendarClock} label="Time" onPress={onPickTime} variant="secondary" />
      </View>
    </View>
  );
}

// A filter, not a view switch — these narrow the same list rather than showing
// a different thing, so they stay chips. Notices vs Recurring above is the
// actual switcher.
function priorityColor(priority: NoticePriority, colors: ReturnType<typeof useTheme>["colors"]) {
  return priority === "EMERGENCY" || priority === "URGENT" ? colors.danger : priority === "IMPORTANT" ? colors.primary : colors.kicker;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function formatNoticeDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatTime(value: string) {
  return normalizeTimeForInput(value);
}

function normalizeTimeForInput(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function normalizeTimeForApi(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function parseOptionalDate(value: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Mirrors the backend's archive rule exactly (`Notice.isExpiredAt`): a notice
 * can only be archived once its window has closed. A notice that has not gone
 * live has nothing to retire, and one with no end never expires — neither can
 * be archived, and the button should say so rather than fail on tap.
 */
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

function toIsoOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}

function mergePickedDateTime(currentValue: Date | null, selected: Date, mode: "date" | "time") {
  const base = currentValue ? new Date(currentValue) : new Date();
  if (mode === "date") {
    base.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    return base;
  }

  base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return base;
}

function isValidTimeRange(startTime: string, endTime: string) {
  const timePattern = /^\d{2}:\d{2}$/;
  return timePattern.test(startTime) && timePattern.test(endTime) && startTime < endTime;
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function confirmMessage(confirm: NoticeConfirmState) {
  if (confirm.action === "delete-recurring") {
    return `Delete recurring notice "${confirm.recurringNotice.title}"?`;
  }
  return `${humanizeToken(confirm.action)} "${confirm.notice.title}"?`;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId ? properties.find((property) => property.id === selectedPropertyId) ?? null : properties.length === 1 ? properties[0] : null;
}
