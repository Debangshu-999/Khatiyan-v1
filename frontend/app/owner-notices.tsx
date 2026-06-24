import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { Archive, CalendarClock, Check, Edit3, Info, Megaphone, Plus, Repeat2, Trash2, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  ConfirmDialog,
  FormInput,
  IconButton,
  humanizeToken,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  type CreateNoticePayload,
  type CreateRecurringNoticePayload,
  type NoticePriority,
  type NoticeSummary,
  type RecurringNoticeFrequency,
  type RecurringNoticeSummary,
  useArchiveNoticeMutation,
  useCreateRecurringNoticeMutation,
  useDeleteNoticeMutation,
  useDeleteRecurringNoticeMutation,
  useListArchivedNoticesQuery,
  useListPublishedNoticesQuery,
  useListRecurringNoticesQuery,
  useListVisiblePropertyNoticesQuery,
  usePublishNoticeMutation,
  useUpdateNoticeMutation,
  useUpdateRecurringNoticeMutation,
} from "@/store/services/notice-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type NoticeView = "normal" | "recurring";
type NoticeTab = "published" | "visible" | "archived";
type NoticeComposerState =
  | { mode: "normal-create" }
  | { mode: "normal-edit"; notice: NoticeSummary }
  | { mode: "recurring-create" }
  | { mode: "recurring-edit"; recurringNotice: RecurringNoticeSummary };
type NoticeConfirmState =
  | { action: "archive" | "delete"; notice: NoticeSummary }
  | { action: "delete-recurring"; recurringNotice: RecurringNoticeSummary };

const PRIORITIES: NoticePriority[] = ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"];
const FREQUENCIES: RecurringNoticeFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];
type NoticeDateField = "visibleFrom" | "visibleUntil";
type NoticeDatePickerState = { field: NoticeDateField; mode: "date" | "time" } | null;

export default function OwnerNoticesScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [view, setView] = useState<NoticeView>("normal");
  const [tab, setTab] = useState<NoticeTab>("published");
  const [composer, setComposer] = useState<NoticeComposerState | null>(null);
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
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
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
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton
              icon={Plus}
              label="Publish notice"
              onPress={() => setComposer({ mode: "normal-create" })}
            />
          </View>

          <NoticeViewBar active={view} onChange={setView} />
          {view === "normal" ? <TabBar active={tab} onChange={setTab} /> : null}


          <Section
            eyebrow={view === "normal" ? tabLabel(tab) : "Recurring notices"}
            title={view === "recurring" ? `${recurringQuery.data?.length ?? 0} schedules` : `${notices.length} notices`}
          >
            {loading ? (
              <Card>
                <ActivityIndicator color={colors.primary} />
              </Card>
            ) : view === "recurring" ? (
              (recurringQuery.data ?? []).length > 0 ? (
                (recurringQuery.data ?? []).map((recurringNotice) => (
                  <RecurringNoticeCard
                    key={recurringNotice.id}
                    onDelete={() => setConfirm({ action: "delete-recurring", recurringNotice })}
                    onEdit={() => setComposer({ mode: "recurring-edit", recurringNotice })}
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
                  key={notice.id}
                  notice={notice}
                  onArchive={() => setConfirm({ action: "archive", notice })}
                  onDelete={() => setConfirm({ action: "delete", notice })}
                  onEdit={() => setComposer({ mode: "normal-edit", notice })}
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

      {selectedProperty && composer ? (
        <NoticeComposerModal composer={composer} onClose={() => setComposer(null)} propertyId={selectedProperty.id} />
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
  );
}

function NoticeCard({
  notice,
  onArchive,
  onDelete,
  onEdit,
  readOnly,
}: {
  notice: NoticeSummary;
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: priorityColor(notice.priority, colors) }]} selectable>
          {humanizeToken(notice.priority)} · {humanizeToken(notice.status)}
        </Text>
        <Text style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]} selectable>
          {notice.title}
        </Text>
        <Text style={[type.body, { color: colors.muted }]} selectable>
          {notice.body}
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]} selectable>
          Visible {formatDateTime(notice.visibleFrom)}
          {notice.visibleUntil ? ` to ${formatDateTime(notice.visibleUntil)}` : ""}
        </Text>
        {!readOnly ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <ActionButton icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
            <ActionButton icon={Archive} label="Archive" onPress={onArchive} variant="secondary" />
            <ActionButton icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function RecurringNoticeCard({
  recurringNotice,
  onDelete,
  onEdit,
}: {
  recurringNotice: RecurringNoticeSummary;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {humanizeToken(recurringNotice.frequency)} · {formatTime(recurringNotice.startTime)} to {formatTime(recurringNotice.endTime)}
        </Text>
        <Text style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]} selectable>
          {recurringNotice.title}
        </Text>
        <Text style={[type.body, { color: colors.muted }]} selectable>
          {recurringNotice.body}
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]} selectable>
          Active {recurringNotice.activeFrom ?? "now"}
          {recurringNotice.activeUntil ? ` to ${recurringNotice.activeUntil}` : " onward"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
        </View>
      </View>
    </Card>
  );
}

function NoticeComposerModal({
  composer,
  onClose,
  propertyId,
}: {
  composer: NoticeComposerState;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const initialNotice = noticeInitialValues(composer);
  const recurringInitial = composer.mode === "recurring-edit" ? composer.recurringNotice : null;
  const [makeRecurring, setMakeRecurring] = useState(composer.mode === "recurring-create" || composer.mode === "recurring-edit");
  const [recurringInfoOpen, setRecurringInfoOpen] = useState(false);
  const isRecurring = makeRecurring;
  const isEdit = composer.mode === "normal-edit" || composer.mode === "recurring-edit";
  const canChooseRecurring = composer.mode === "normal-create" || composer.mode === "recurring-create";
  const [title, setTitle] = useState(initialNotice.title);
  const [body, setBody] = useState(initialNotice.body);
  const [priority, setPriority] = useState<NoticePriority>(initialNotice.priority);
  const [visibleFrom, setVisibleFrom] = useState<Date | null>(() => parseOptionalDate(initialNotice.visibleFrom));
  const [visibleUntil, setVisibleUntil] = useState<Date | null>(() => parseOptionalDate(initialNotice.visibleUntil));
  const [picker, setPicker] = useState<NoticeDatePickerState>(null);
  const [frequency, setFrequency] = useState<RecurringNoticeFrequency>(recurringInitial?.frequency ?? "DAILY");
  const [startTime, setStartTime] = useState(normalizeTimeForInput(recurringInitial?.startTime ?? "08:00"));
  const [endTime, setEndTime] = useState(normalizeTimeForInput(recurringInitial?.endTime ?? "10:00"));
  const [activeFrom, setActiveFrom] = useState(recurringInitial?.activeFrom ?? "");
  const [activeUntil, setActiveUntil] = useState(recurringInitial?.activeUntil ?? "");
  const [error, setError] = useState<string | null>(null);
  const [publishNotice, publishState] = usePublishNoticeMutation();
  const [updateNotice, updateState] = useUpdateNoticeMutation();
  const [createRecurringNotice, createRecurringState] = useCreateRecurringNoticeMutation();
  const [updateRecurringNotice, updateRecurringState] = useUpdateRecurringNoticeMutation();
  const saving = publishState.isLoading || updateState.isLoading || createRecurringState.isLoading || updateRecurringState.isLoading;

  async function submit() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    if (isRecurring && !isValidTimeRange(startTime, endTime)) {
      setError("Start time and end time must use HH:mm, and end time must be after start time.");
      return;
    }

    const noticePayload: CreateNoticePayload = {
      body: body.trim(),
      priority,
      title: title.trim(),
      visibleFrom: isRecurring ? null : toIsoOrNull(visibleFrom),
      visibleUntil: isRecurring ? null : toIsoOrNull(visibleUntil),
    };

    try {
      if (composer.mode === "normal-create" && !isRecurring) {
        await publishNotice({ payload: noticePayload, propertyId }).unwrap();
      } else if (composer.mode === "normal-edit") {
        await updateNotice({ noticeId: composer.notice.id, payload: noticePayload }).unwrap();
      } else {
        const recurringPayload: CreateRecurringNoticePayload = {
          activeFrom: emptyToNull(activeFrom),
          activeUntil: emptyToNull(activeUntil),
          endTime: normalizeTimeForApi(endTime),
          frequency,
          notice: noticePayload,
          startTime: normalizeTimeForApi(startTime),
        };
        if (composer.mode === "recurring-create" || composer.mode === "normal-create") {
          await createRecurringNotice({ payload: recurringPayload, propertyId }).unwrap();
        } else {
          await updateRecurringNotice({ payload: recurringPayload, recurringNoticeId: composer.recurringNotice.id }).unwrap();
        }
      }
      onClose();
    } catch {
      setError(isEdit ? "Could not update notice." : "Could not create notice.");
    }
  }

  function updatePickerValue(event: DateTimePickerEvent, selected?: Date) {
    if (!picker) {
      return;
    }
    if (event.type === "dismissed") {
      setPicker(null);
      return;
    }
    if (!selected) {
      setPicker(null);
      return;
    }

    const currentValue = picker.field === "visibleFrom" ? visibleFrom : visibleUntil;
    const nextValue = mergePickedDateTime(currentValue, selected, picker.mode);
    if (picker.field === "visibleFrom") {
      setVisibleFrom(nextValue);
    } else {
      setVisibleUntil(nextValue);
    }
    setPicker(null);
  }

  function clearDateField(field: NoticeDateField) {
    if (field === "visibleFrom") {
      setVisibleFrom(null);
    } else {
      setVisibleUntil(null);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "90%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: "600" }} selectable>
              {modalTitle(composer)}
            </Text>
            <IconButton accessibilityLabel="Close notice composer" icon={X} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <FormInput label="Title" onChangeText={setTitle} placeholder="Notice title" value={title} />
            <FormInput label="Body" multiline onChangeText={setBody} placeholder="Write the notice" value={body} />
            {canChooseRecurring ? (
              <RecurringToggle
                active={makeRecurring}
                onInfoPress={() => setRecurringInfoOpen(true)}
                onToggle={() => setMakeRecurring((current) => !current)}
              />
            ) : null}
            {!isRecurring ? (
              <>
                <DateTimeField
                  label="Visible from"
                  onClear={() => clearDateField("visibleFrom")}
                  onPickDate={() => setPicker({ field: "visibleFrom", mode: "date" })}
                  onPickTime={() => setPicker({ field: "visibleFrom", mode: "time" })}
                  value={visibleFrom}
                />
                <DateTimeField
                  label="Visible until"
                  onClear={() => clearDateField("visibleUntil")}
                  onPickDate={() => setPicker({ field: "visibleUntil", mode: "date" })}
                  onPickTime={() => setPicker({ field: "visibleUntil", mode: "time" })}
                  value={visibleUntil}
                />
                {picker ? (
                  <DateTimePicker
                    mode={picker.mode}
                    onChange={updatePickerValue}
                    value={picker.field === "visibleFrom" ? visibleFrom ?? new Date() : visibleUntil ?? new Date()}
                  />
                ) : null}
              </>
            ) : null}
            <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
              Priority
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {PRIORITIES.map((item) => (
                <ChoiceButton active={priority === item} key={item} label={humanizeToken(item)} onPress={() => setPriority(item)} />
              ))}
            </View>
            {isRecurring ? (
              <>
                <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
                  Frequency
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {FREQUENCIES.map((item) => (
                    <ChoiceButton active={frequency === item} key={item} label={humanizeToken(item)} onPress={() => setFrequency(item)} />
                  ))}
                </View>
                <FormInput label="Start time" onChangeText={setStartTime} placeholder="08:00" value={startTime} />
                <FormInput label="End time" onChangeText={setEndTime} placeholder="10:00" value={endTime} />
                <FormInput label="Active from" onChangeText={setActiveFrom} placeholder="YYYY-MM-DD" value={activeFrom} />
                <FormInput label="Active until" onChangeText={setActiveUntil} placeholder="optional" value={activeUntil} />
              </>
            ) : null}
            {error ? (
              <Text style={[type.caption, { color: colors.danger }]} selectable>
                {error}
              </Text>
            ) : null}
          </ScrollView>
          <ActionButton
            disabled={saving}
            icon={isRecurring ? Repeat2 : Megaphone}
            label={saving ? "Saving" : isEdit ? "Save changes" : isRecurring ? "Create recurring" : "Publish"}
            onPress={submit}
          />
        </View>
      </View>
      {recurringInfoOpen ? <RecurringInfoModal onClose={() => setRecurringInfoOpen(false)} /> : null}
    </Modal>
  );
}

function NoticeViewBar({ active, onChange }: { active: NoticeView; onChange: (view: NoticeView) => void }) {
  const { colors, type } = useTheme();
  const views: NoticeView[] = ["normal", "recurring"];
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        padding: 4,
      }}
    >
      {views.map((view) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: active === view }}
          key={view}
          onPress={() => onChange(view)}
          style={{
            alignItems: "center",
            backgroundColor: active === view ? colors.surface : "transparent",
            borderColor: active === view ? colors.border : "transparent",
            borderRadius: 12,
            borderWidth: 1,
            flex: 1,
            minHeight: 42,
            justifyContent: "center",
            paddingHorizontal: spacing.sm,
          }}
        >
          <Text
            style={[
              type.caption,
              {
                color: active === view ? colors.ink : colors.muted,
                fontWeight: active === view ? "900" : "700",
                textAlign: "center",
              },
            ]}
            selectable
          >
            {view === "normal" ? "Normal" : "Recurring"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function RecurringToggle({
  active,
  onInfoPress,
  onToggle,
}: {
  active: boolean;
  onInfoPress: () => void;
  onToggle: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <Pressable
        accessibilityLabel="Make notice recurring"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          borderColor: active ? colors.primary : colors.border,
          borderRadius: 8,
          borderWidth: 1,
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        {active ? <Check color={colors.primary} size={17} strokeWidth={3} /> : null}
      </Pressable>
      <Pressable onPress={onToggle} style={{ flex: 1 }}>
        <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
          Make it recurring
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="What is a recurring notice?"
        accessibilityRole="button"
        onPress={onInfoPress}
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 999,
          borderWidth: 1,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <Info color={colors.muted} size={17} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function RecurringInfoModal({ onClose }: { onClose: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <Pressable
      onPress={onClose}
      style={{
        alignItems: "center",
        backgroundColor: colors.overlay,
        bottom: 0,
        justifyContent: "center",
        left: 0,
        padding: spacing.lg,
        position: "absolute",
        right: 0,
        top: 0,
      }}
    >
      <Pressable
        onPress={(event) => event.stopPropagation()}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 18,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.lg,
          width: "100%",
        }}
      >
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" }} selectable>
          Recurring notice
        </Text>
        <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]} selectable>
          A recurring notice is a reusable schedule. The system creates normal tenant-visible notices from it at the selected frequency and time window.
        </Text>
      </Pressable>
    </Pressable>
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
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]} selectable>
          {label}
        </Text>
        {value ? (
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text style={[type.caption, { color: colors.danger, fontWeight: "800" }]} selectable>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.body, { color: value ? colors.ink : colors.muted, fontWeight: "800" }]} selectable>
        {value ? formatNoticeDateTime(value) : "Not set"}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton icon={CalendarClock} label="Date" onPress={onPickDate} variant="secondary" />
        <ActionButton icon={CalendarClock} label="Time" onPress={onPickTime} variant="secondary" />
      </View>
    </View>
  );
}

function TabBar({ active, onChange }: { active: NoticeTab; onChange: (tab: NoticeTab) => void }) {
  const tabs: NoticeTab[] = ["published", "visible", "archived"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {tabs.map((tab) => (
        <ChoiceButton active={active === tab} key={tab} label={tabLabel(tab)} onPress={() => onChange(tab)} />
      ))}
    </View>
  );
}

function tabLabel(tab: NoticeTab) {
  return tab === "published" ? "Published" : tab === "visible" ? "Visible" : "Archived";
}

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

function noticeInitialValues(composer: NoticeComposerState) {
  if (composer.mode === "normal-edit") {
    return {
      body: composer.notice.body,
      priority: composer.notice.priority,
      title: composer.notice.title,
      visibleFrom: composer.notice.visibleFrom ?? "",
      visibleUntil: composer.notice.visibleUntil ?? "",
    };
  }
  if (composer.mode === "recurring-edit") {
    return {
      body: composer.recurringNotice.body,
      priority: composer.recurringNotice.priority,
      title: composer.recurringNotice.title,
      visibleFrom: "",
      visibleUntil: "",
    };
  }
  return { body: "", priority: "NORMAL" as NoticePriority, title: "", visibleFrom: "", visibleUntil: "" };
}

function modalTitle(composer: NoticeComposerState) {
  return composer.mode === "normal-create"
    ? "Publish notice"
    : composer.mode === "normal-edit"
      ? "Edit notice"
      : composer.mode === "recurring-create"
        ? "Create recurring notice"
        : "Edit recurring notice";
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
