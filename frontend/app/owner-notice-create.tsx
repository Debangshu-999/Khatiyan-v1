import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarClock, Check, Info, Megaphone, Plus, Repeat2, Save, Send } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { SingleOptionPicker } from "@/components/option-picker";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/auth/auth-ui";
import { AttachmentSection, useNoticeAttachments } from "@/features/notice/notice-attachments";
import { ActionButton, BackButton, ChoiceButton, FormInput, humanizeToken } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  type CreateNoticePayload,
  type NoticePriority,
  type RecurringNoticeFrequency,
  useCreateRecurringNoticeMutation,
  useListRecurringNoticesQuery,
  usePublishNoticeMutation,
  useUpdateRecurringNoticeMutation,
} from "@/store/services/notice-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PRIORITIES: NoticePriority[] = ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"];
const FREQUENCIES: RecurringNoticeFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];

type DayOfWeekName = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

const WEEKDAYS: { full: string; short: string; value: DayOfWeekName }[] = [
  { full: "Monday", short: "Mon", value: "MONDAY" },
  { full: "Tuesday", short: "Tue", value: "TUESDAY" },
  { full: "Wednesday", short: "Wed", value: "WEDNESDAY" },
  { full: "Thursday", short: "Thu", value: "THURSDAY" },
  { full: "Friday", short: "Fri", value: "FRIDAY" },
  { full: "Saturday", short: "Sat", value: "SATURDAY" },
  { full: "Sunday", short: "Sun", value: "SUNDAY" },
];

type PickerTarget = { field: "from" | "to" | "startDate"; mode: "date" | "time" } | null;

/**
 * New notice.
 *
 * <p>Two sections, each saved on its own: the <b>message</b> (what it says and
 * what is attached) and the <b>configuration</b> (when it runs, how loudly,
 * whether it repeats). Saving a section is a local commit — it validates and
 * locks that half, and nothing reaches the server until Create.
 *
 * <p>Splitting it this way keeps a long form from being one all-or-nothing
 * submit: an error names the half it belongs to, and a section already settled
 * stops asking for attention. Editing a saved section unlocks it again, which is
 * why Create can only fire when both are green.
 *
 * <p>Validation speaks through toasts rather than inline text, because this is a
 * full screen and the offending field is often scrolled out of view.
 */
export default function OwnerNoticeCreateScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = resolveSelectedProperty(properties, selectedPropertyId);

  const [publishNotice, publishState] = usePublishNoticeMutation();
  const [createRecurringNotice, createRecurringState] = useCreateRecurringNoticeMutation();
  const [updateRecurringNotice, updateRecurringState] = useUpdateRecurringNoticeMutation();
  const creating = publishState.isLoading || createRecurringState.isLoading || updateRecurringState.isLoading;

  // Editing an existing recurring template reuses this screen: a template is a
  // message plus a schedule, which is exactly the two sections below. It is read
  // out of the list already in cache rather than through a fetch of its own.
  const { recurringNoticeId } = useLocalSearchParams<{ recurringNoticeId?: string }>();
  const recurringQuery = useListRecurringNoticesQuery(property?.id ?? "", { skip: !property });
  const template = recurringNoticeId
    ? recurringQuery.data?.find((candidate) => candidate.id === recurringNoticeId) ?? null
    : null;
  const isEditingTemplate = Boolean(recurringNoticeId);

  // Message section
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const attachments = useNoticeAttachments();

  // Configuration section
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringNoticeFrequency>("DAILY");
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeekName[]>([]);
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([]);
  const [priority, setPriority] = useState<NoticePriority>("NORMAL");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  /**
   * The day a daily template begins — its own value, not the date half of
   * `from`.
   *
   * <p>They used to share one Date, so clearing the start TIME also wiped the
   * start DATE: two fields on screen, one value behind them, and clearing
   * either emptied both.
   */
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);

  // Seed once per template, keyed on its id so a background refetch cannot wipe
  // an edit in progress.
  const [seededId, setSeededId] = useState<string | null>(null);

  useEffect(() => {
    if (!template || template.id === seededId) {
      return;
    }
    setTitle(template.title);
    setBody(template.body);
    setPriority(template.priority);
    setRecurring(true);
    setFrequency(template.frequency);
    setDaysOfWeek([...(template.daysOfWeek ?? [])]);
    setDaysOfMonth([...(template.daysOfMonth ?? [])].sort((left, right) => left - right));
    setStartDate(combine(template.activeFrom, template.startTime));
    setFrom(combine(template.activeFrom, template.startTime));
    setTo(combine(template.activeFrom, template.endTime));
    // Seeded with the rest of the form, and only once, so files added or removed
    // while editing are not overwritten before the save lands.
    attachments.reset(
      template.attachments.map((attachment) => ({
        contentType: attachment.contentType,
        id: attachment.id,
        kind: attachment.kind === "IMAGE" ? ("image" as const) : ("document" as const),
        name: attachment.fileName,
        // A template's files are rewritten wholesale on save, so they are not
        // "persisted" in the sense the hook means: removing one must change this
        // screen's list, not call the per-notice delete endpoint.
        persisted: false,
        publicId: attachment.publicId,
        sizeBytes: attachment.sizeBytes,
        uri: attachment.url,
      })),
    );
    setSeededId(template.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, seededId]);



  function toggleDayOfWeek(day: DayOfWeekName) {
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((existing) => existing !== day)
        // Kept in week order rather than tap order, so the row reads
        // Mon-to-Sun however it was filled in.
        : WEEKDAYS.map((weekday) => weekday.value).filter(
            (value) => value === day || current.includes(value),
          ),
    );
  }

  function toggleDayOfMonth(day: number) {
    setDaysOfMonth((current) =>
      current.includes(day)
        ? current.filter((existing) => existing !== day)
        : [...current, day].sort((left, right) => left - right),
    );
  }

  function onPicked(event: DateTimePickerEvent, selected?: Date) {
    const target = picker;
    setPicker(null);
    if (event.type !== "set" || !selected || !target) {
      return;
    }
    const current = target.field === "from" ? from : target.field === "to" ? to : startDate;
    const next = mergePickedDateTime(current, selected, target.mode);
    const apply =
      target.field === "from" ? setFrom : target.field === "to" ? setTo : setStartDate;
    apply(next);
  }

  // Dirty against the template when editing one, against empty when creating.
  const dirty = isEditingTemplate
    ? Boolean(
        template &&
          (title !== template.title ||
            body !== template.body ||
            priority !== template.priority ||
            frequency !== template.frequency ||
            attachments.items.length !== template.attachments.length),
      )
    : Boolean(title.trim() || body.trim() || attachments.items.length || from || to || startDate);
  const unsaved = useUnsavedChanges(dirty);

  async function create() {
    if (!property || creating || !validate() || !from || !to) {
      return;
    }

    const noticePayload: CreateNoticePayload = {
      // Already uploaded as they were picked, so only the handles travel here.
      // On a recurring template these become the template's own files and are
      // copied onto every day it generates — right for a fixed image, like a
      // supply-outage photo. Content that changes daily is attached to that
      // day's notice instead, from the notice detail screen.
      attachments: attachments.items.map((item) => ({
        contentType: item.contentType,
        fileName: item.name,
        kind: item.kind === "image" ? ("IMAGE" as const) : ("DOCUMENT" as const),
        publicId: item.publicId,
        sizeBytes: item.sizeBytes,
        url: item.uri,
      })),
      body: body.trim(),
      priority,
      title: title.trim(),
      visibleFrom: recurring ? null : from.toISOString(),
      visibleUntil: recurring ? null : to.toISOString(),
    };

    // The from/to times bound each day's showing. The schedule itself now
    // travels in its own fields, so `activeFrom` means only "not before this
    // day" — a weekly or monthly template starts from today and repeats on what
    // was actually picked. It runs open-ended from there; a recurring notice
    // ends by being deleted.
    const recurringPayload = {
      // Only a daily template names its own start day; the others begin today
      // and repeat on what was picked. An unset daily start means "from today"
      // rather than blocking the save on a field that has a sane default.
      activeFrom: toDateOnly(frequency === "DAILY" ? startDate ?? new Date() : new Date()),
      activeUntil: null,
      daysOfWeek: frequency === "WEEKLY" ? daysOfWeek : [],
      daysOfMonth: frequency === "MONTHLY" ? daysOfMonth : [],
      endTime: toTimeOfDay(to),
      frequency,
      notice: noticePayload,
      startTime: toTimeOfDay(from),
    };

    try {
      if (isEditingTemplate && recurringNoticeId) {
        await updateRecurringNotice({ payload: recurringPayload, recurringNoticeId }).unwrap();
        toast.show("Recurring notice updated.", "success");
      } else if (recurring) {
        await createRecurringNotice({ payload: recurringPayload, propertyId: property.id }).unwrap();
        toast.show("Recurring notice created.", "success");
      } else {
        await publishNotice({ payload: noticePayload, propertyId: property.id }).unwrap();
        toast.show("Notice scheduled.", "success");
      }
      unsaved.markSaved();
      router.back();
    } catch (error) {
      console.error("Notice save failed:", error);
      toast.show("Could not save the notice. Try again.", "error");
    }
  }

  /** Everything the form must satisfy, checked once when Save is pressed. */
  function validate() {
    if (!title.trim()) {
      toast.show("Give the notice a title.", "error");
      return false;
    }
    if (!body.trim()) {
      toast.show("Write the notice body.", "error");
      return false;
    }
    // Caught here rather than at the server, which would refuse the whole save
    // after the person had filled in everything else.
    if (recurring && frequency === "WEEKLY" && daysOfWeek.length === 0) {
      toast.show("Pick at least one day of the week this notice repeats on.", "error");
      return false;
    }
    if (recurring && frequency === "MONTHLY" && daysOfMonth.length === 0) {
      toast.show("Pick at least one day of the month this notice repeats on.", "error");
      return false;
    }
    if (!from) {
      toast.show(recurring ? "Pick the daily start time." : "Pick when the notice goes live.", "error");
      return false;
    }
    if (!to) {
      toast.show(recurring ? "Pick the daily end time." : "Pick when the notice stops showing.", "error");
      return false;
    }
    if (to.getTime() <= from.getTime()) {
      toast.show("The end must come after the start.", "error");
      return false;
    }
    return true;
  }


  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {unsaved.dialog}
    <ScreenScrollView
      safeAreaEdges={["top"]}
      contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: spacing.md }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ alignItems: "flex-start", flex: 1 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
          {isEditingTemplate ? "Edit Recurring" : "New Notice"}
        </Text>
        <View style={{ flex: 1 }} />
      </View>

      {!property && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Notices are scoped to the active owner property."
          eyebrow="Property required"
          icon={Megaphone}
          title="No property selected"
        />
      ) : null}

      {property ? (
        <>
          {/* Section one — what the notice says */}
          <Card>
            <View style={{ gap: spacing.md }}>
              <SectionHeading step="1" title="Message" />

              <FormInput label="Title" onChangeText={(setTitle)} placeholder="Notice title" required value={title} />
              <FormInput
                label="Body"
                multiline
                onChangeText={(setBody)}
                placeholder="Write the notice"
                required
                value={body}
              />


            </View>
          </Card>

          {/* Section two — the files that travel with it */}
          <Card>
            <View style={{ gap: spacing.md }}>
              <SectionHeading step="2" title="Attachments" />

              <AttachmentSection
                documents={attachments.documents}
                editing
                emptyHint={
                  recurring
                    ? "Files added here are copied onto every day this notice runs."
                    : "Nothing attached yet."
                }
                images={attachments.images}
                items={attachments.items}
                onAdd={attachments.openChooser}
                onOpenDocuments={attachments.openDocuments}
                onOpenSlideshow={attachments.openSlideshow}
                onRemove={attachments.remove}
                progress={attachments.progress}
                tip={
                  recurring
                    ? "Tip: If the image for your recurring notice is supposed to change everyday consider attaching it before the notice goes live."
                    : undefined
                }
                uploading={attachments.uploading}
              />
            </View>
          </Card>

          {/* Section three — when and how it runs */}
          <Card>
            <View style={{ gap: spacing.md }}>
              <SectionHeading step="3" title="Configuration" />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: recurring }}
                onPress={() => (setRecurring)(!recurring)}
                // The surface stays the same whether ticked or not. Switching to
                // a blue wash on selection made the row itself the loudest
                // thing in the section; the tick is what changed, so the tick
                // is what should show it.
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  borderRadius: 14,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  padding: spacing.md,
                }}
              >
                <Repeat2 color={recurring ? colors.primary : colors.kicker} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]}>Make it recurring</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {recurring
                      ? "The times below become each day's window. It repeats until deleted."
                      : "Shows once, between the times below."}
                  </Text>
                </View>
                <View
                  style={{
                    alignItems: "center",
                    // Blue whether ticked or not, so the box reads as the
                    // interactive thing rather than appearing only once it has
                    // been used.
                    borderColor: colors.primary,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    height: 24,
                    justifyContent: "center",
                    width: 24,
                  }}
                >
                  {recurring ? <Check color={colors.primary} size={15} strokeWidth={3} /> : null}
                </View>
              </Pressable>

              {recurring ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>FREQUENCY</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {FREQUENCIES.map((option) => (
                      <ChoiceButton
                        active={frequency === option}
                        key={option}
                        label={humanizeToken(option)}
                        onPress={() => (setFrequency)(option)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* The schedule is no longer smuggled inside a date. A one-off
                  still picks a moment; each recurrence picks only what it
                  actually repeats on, plus the window it shows for. */}
              {recurring && frequency === "WEEKLY" ? (
                <DayOfWeekPicker onToggle={toggleDayOfWeek} value={daysOfWeek} />
              ) : null}

              {recurring && frequency === "MONTHLY" ? (
                <DayOfMonthPicker onToggle={toggleDayOfMonth} value={daysOfMonth} />
              ) : null}

              {/* Only a daily template still needs a date — the day it begins.
                  Weekly and monthly get theirs from the pickers above, and
                  start from today. */}
              {recurring && frequency === "DAILY" ? (
                <DateTimeField
                  label="Starts on"
                  mode="date"
                  onClear={() => setStartDate(null)}
                  onPickDate={() => setPicker({ field: "startDate", mode: "date" })}
                  onPickTime={() => setPicker({ field: "startDate", mode: "time" })}
                  value={startDate}
                />
              ) : null}

              {/* Side by side once recurring: two time-only fields are a pair
                  bounding one window, and stacking them read as two unrelated
                  settings. A one-off keeps them stacked — those carry a full
                  date each and do not fit a shared row. */}
              <View
                style={
                  recurring
                    ? { flexDirection: "row", gap: spacing.sm }
                    : { gap: spacing.md }
                }
              >
                <View style={recurring ? { flex: 1 } : undefined}>
                  <DateTimeField
                    label={recurring ? "Shows from" : "Goes live"}
                    mode={recurring ? "time" : "datetime"}
                    onClear={() => setFrom(null)}
                    onPickDate={() => setPicker({ field: "from", mode: "date" })}
                    onPickTime={() => setPicker({ field: "from", mode: "time" })}
                    value={from}
                  />
                </View>
                <View style={recurring ? { flex: 1 } : undefined}>
                  <DateTimeField
                    label={recurring ? "Until" : "Stops showing"}
                    mode={recurring ? "time" : "datetime"}
                    onClear={() => setTo(null)}
                    onPickDate={() => setPicker({ field: "to", mode: "date" })}
                    onPickTime={() => setPicker({ field: "to", mode: "time" })}
                    value={to}
                  />
                </View>
              </View>

              <SingleOptionPicker
                label="Priority"
                onChange={setPriority}
                required
                options={PRIORITIES.map((option) => ({ label: humanizeToken(option), value: option }))}
                value={priority}
              />

            </View>
          </Card>

        </>
      ) : null}

      {attachments.overlays}

      {picker ? (
        <DateTimePicker
          mode={picker.mode}
          onChange={onPicked}
          value={(picker.field === "from" ? from : to) ?? new Date()}
        />
      ) : null}
    </ScreenScrollView>

    {/* One save for the whole form. The sections used to each carry their own,
        which meant three presses to publish and a screen that could sit in a
        half-saved state with no way to tell. */}
    {property ? (
      <PinnedFooter>
        <ActionButton
          disabled={creating}
          icon={Send}
          label={
            creating
              ? "Saving…"
              : isEditingTemplate
                ? "Save recurring notice"
                : recurring
                  ? "Create recurring notice"
                  : "Create notice"
          }
          onPress={create}
        />
      </PinnedFooter>
    ) : null}
    </View>
  );
}

// The step number is a reading order, not a progress tracker — the form is saved
// once, from the bottom, so there is no per-section "done" to show.
function SectionHeading({ step, title }: { step: string; title: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>{step}</Text>
      </View>
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 19, }}>
        {title}
      </Text>
    </View>
  );
}

/**
 * A date, a time, or both.
 *
 * <p>Narrowed by `mode` because a recurring notice has no single date to pick —
 * "every Tuesday at 9am" is a weekday and a time, and offering a full date
 * alongside them invites someone to set a date that the schedule then ignores.
 * That conflation is exactly what the old single field caused: the backend read
 * the weekday out of the start date, so the two could never be set apart.
 */
function DateTimeField({
  label,
  mode = "datetime",
  onClear,
  onPickDate,
  onPickTime,
  value,
}: {
  label: string;
  mode?: "datetime" | "date" | "time";
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
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>{label}</Text>
        {value ? (
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text style={[type.caption, { color: colors.danger, fontWeight: "800" }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.body, { color: value ? colors.ink : colors.muted, fontWeight: "800" }]}>
        {value ? formatByMode(value, mode) : "Not set"}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {mode !== "time" ? (
          <ActionButton icon={CalendarClock} label="Date" onPress={onPickDate} variant="secondary" />
        ) : null}
        {mode !== "date" ? (
          <ActionButton icon={CalendarClock} label="Time" onPress={onPickTime} variant="secondary" />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Which weekday a weekly notice repeats on.
 *
 * <p>Seven single-letter targets rather than a list or a picker sheet: the
 * whole week has to be visible at once for "every Tuesday" to be checkable at a
 * glance, and a sheet would hide the answer behind a tap.
 */
function DayOfWeekPicker({
  onToggle,
  value,
}: {
  onToggle: (day: DayOfWeekName) => void;
  value: DayOfWeekName[];
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
        Repeats on
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        {WEEKDAYS.map((day) => {
          const active = value.includes(day.value);
          return (
            <AnimatedPressable
              accessibilityLabel={day.full}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={day.value}
              onPress={() => onToggle(day.value)}
              // Same reason as the day grid: picking Mon and Tue in quick
              // succession must not lose the second tap.
              tapLockMs={0}
              style={{
                alignItems: "center",
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderRadius: 10,
                borderWidth: 1,
                flex: 1,
                justifyContent: "center",
                paddingVertical: spacing.sm,
              }}
            >
              <Text
                style={{
                  color: active ? colors.onPrimary : colors.muted,
                  fontFamily: active ? fonts.sansBold : fonts.sansMedium,
                  fontSize: 12,
                }}
              >
                {day.short}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Which days of the month a monthly notice repeats on.
 *
 * <p>Multi-select, because "the 1st and the 15th" is the ordinary case for rent
 * reminders and the old model could only hold one day.
 */
function DayOfMonthPicker({
  onToggle,
  value,
}: {
  onToggle: (day: number) => void;
  value: number[];
}) {
  const { colors, fonts, type } = useTheme();
  const [datesOpen, setDatesOpen] = useState(false);

  // Fixed rows of seven so the grid reads as a calendar sheet rather than a
  // wrapped pile of chips whose shape changes with the screen width.
  const weeks = [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19, 20, 21],
    [22, 23, 24, 25, 26, 27, 28],
    [29, 30, 31],
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
          Repeats on days
        </Text>
        {/* The house ⓘ pattern. Only once something is chosen — there are no
            dates to preview before that. */}
        {value.length > 0 ? (
          <AnimatedPressable
            accessibilityLabel="See which dates these land on"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setDatesOpen(true)}
          >
            <Info color={colors.primary} size={15} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
      </View>

      {/* No box, and no box per day. A calendar page is numbers on paper with
          the chosen one circled — 31 bordered cells inside a bordered card read
          as a keypad instead, which is what this was. */}
      <View style={{ gap: 2 }}>
        {weeks.map((week) => (
          <View key={week[0]} style={{ flexDirection: "row", gap: 2 }}>
            {week.map((day) => {
              const active = value.includes(day);
              return (
                <AnimatedPressable
                  accessibilityLabel={`Day ${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={day}
                  onPress={() => onToggle(day)}
                  style={{ alignItems: "center", flex: 1, height: 42, justifyContent: "center" }}
                  // No tap lock. AnimatedPressable defaults to swallowing a
                  // second press within 500ms, which is right for a card that
                  // navigates and wrong here — picking the 30th and the 31st
                  // in quick succession silently dropped the second tap.
                  tapLockMs={0}
                >
                  {/* Fixed pixels, not a percentage with aspectRatio. Yoga will
                      not derive a height from a percentage width, so the view
                      came out non-square on device and borderRadius turned it
                      into a pill rather than a circle. 34 fits the narrowest
                      column seven of these can produce. */}
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: active ? colors.primary : "transparent",
                      borderRadius: 17,
                      height: 34,
                      justifyContent: "center",
                      width: 34,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? colors.onPrimary : colors.ink,
                        fontFamily: active ? fonts.sansBold : fonts.sansMedium,
                        fontSize: 14,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                </AnimatedPressable>
              );
            })}
            {/* Keeps the short last row aligned to the columns above it. */}
            {Array.from({ length: 7 - week.length }, (_, index) => (
              <View key={`pad-${index}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>

      {/* Reads the selection back in words, so the answer does not have to be
          reconstructed by scanning the grid for filled circles. */}
      <Text style={[type.caption, { color: value.length > 0 ? colors.ink : colors.muted, lineHeight: 18 }]}>
        {value.length > 0
          ? `Repeats on ${[...value].sort((left, right) => left - right).join(", ")} of every month.`
          : "Tap the days it should repeat on."}
      </Text>

      {datesOpen ? (
        <ProjectedDatesSheet days={value} onClose={() => setDatesOpen(false)} />
      ) : null}
    </View>
  );
}

/**
 * What the chosen days actually land on over the next year.
 *
 * <p>Worth showing because the clamping is invisible until it happens: someone
 * picking the 31st has no way to know February will fire on the 28th until
 * February, by which time the notice has already gone out.
 */
/**
 * A year of what the chosen days actually become, month by month.
 *
 * <p>A list of strings in a dialog buried the one thing worth seeing — the
 * months where the dates move. Here each month is a row, the dates are chips,
 * and a moved month says so in its own colour, so the exception is findable by
 * scanning rather than by reading twelve lines and comparing them.
 */
function ProjectedDatesSheet({ days, onClose }: { days: number[]; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  const months = upcomingMonthDates(days);
  const shiftedCount = months.filter((month) => month.shifted).length;

  return (
    <SheetShell onClose={onClose} title="Projected dates">
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          {shiftedCount === 0
            ? "Every month is long enough for these days, so they never move."
            : `${shiftedCount} of the next 12 months are too short, so those dates move back to the month's end.`}
        </Text>

        <View style={{ borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
          {months.map((month, index) => (
            <View
              key={month.label}
              style={{
                alignItems: "center",
                // Hairline between rows only — an outer frame already exists.
                borderTopColor: colors.border,
                borderTopWidth: index === 0 ? 0 : 1,
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "space-between",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={[type.body, { color: month.shifted ? colors.warningText : colors.ink }]}>
                {month.label}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, justifyContent: "flex-end" }}>
                {month.days.map((day) => (
                  <View
                    key={day}
                    style={{
                      backgroundColor: month.shifted ? colors.warningSoft : colors.surfaceRaised,
                      borderRadius: 999,
                      minWidth: 30,
                      paddingHorizontal: spacing.xs,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: month.shifted ? colors.warningText : colors.ink,
                        fontFamily: fonts.sansBold,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </SheetShell>
  );
}

function upcomingMonthDates(days: number[]) {
  if (days.length === 0) {
    return [];
  }
  const today = new Date();
  const wanted = [...days].sort((left, right) => left - right);

  return Array.from({ length: 12 }, (_, offset) => {
    const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    // Day 0 of the next month is the last day of this one, which is also what
    // makes February right in a leap year without special-casing it.
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const landings = resolveMonthDays(days, lastDay);

    return {
      days: landings,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(month),
      // Flagged when the month could not take the days as chosen.
      shifted: landings.join(",") !== wanted.join(","),
    };
  });
}

/**
 * Which dates the chosen days land on in a month of {@code lastDay} days.
 *
 * <p>Must match `RecurringNotice.generationDaysIn` exactly — this preview is
 * the only place someone sees the shifting before it happens, and a preview
 * that disagrees with the generator is worse than none.
 *
 * <p>Resolved from the end downwards so days near the month end stay distinct
 * rather than collapsing: {30, 31} is the last two days, not one.
 */
function resolveMonthDays(days: number[], lastDay: number) {
  const resolved: number[] = [];

  for (const day of [...days].sort((left, right) => right - left)) {
    let candidate = Math.min(day, lastDay);
    while (candidate >= 1 && resolved.includes(candidate)) {
      candidate -= 1;
    }
    if (candidate >= 1) {
      resolved.push(candidate);
    }
  }

  return resolved.sort((left, right) => left - right);
}

function formatByMode(value: Date, mode: "datetime" | "date" | "time") {
  if (mode === "date") {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(value);
  }
  if (mode === "time") {
    return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(value);
  }
  return formatDateTime(value);
}

function mergePickedDateTime(current: Date | null, selected: Date, mode: "date" | "time") {
  const base = current ? new Date(current) : new Date();
  if (mode === "date") {
    base.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    return base;
  }
  base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return base;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

/** Rebuilds a Date from a template's "YYYY-MM-DD" day and "HH:mm:ss" time. */
function combine(day: string | null, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const base = day ? new Date(`${day}T00:00:00`) : new Date();
  base.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return base;
}

/** Local calendar date, not UTC — the backend reads these as IST days. */
function toDateOnly(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toTimeOfDay(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:00`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (properties.length === 0) {
    return null;
  }
  return properties.find((property) => property.id === selectedPropertyId) ?? properties[0];
}
