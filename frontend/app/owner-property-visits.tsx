import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarClock, ChevronDown, ChevronUp, Clock, Lock, Minus, Plus, Users } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FieldError } from "@/components/field-error";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { GhostIcon, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  propertyApi,
  type PropertyVisitSlot,
  type PropertyVisitSlots,
  type VisitDay,
  useClearPropertyVisitDaysMutation,
  useCreatePropertyVisitSlotsMutation,
  useGetPropertyVisitSlotsQuery,
  useSavePropertyVisitSlotsMutation,
} from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Property visits (user, 2026-09-30): the slots, day by day, in which tenants
 * can book a visit. Opened from the Property workspace.
 *
 * <ul>
 *   <li>All seven days are on the screen, and each is set and saved on its
 *       own: its number of slots, 0 to 5 (0 means no visits that day), and
 *       its visitors-per-slot limit.</li>
 *   <li>Slots are named Slot 1, 2, 3 by start time. No minimum length, each
 *       starting and ending the same day. Back-to-back is fine (11:00 end,
 *       11:00 start), but slots never share time. The server checks the same,
 *       and so does the database.</li>
 *   <li>Edited under Property settings: the owner, and managers with that
 *       access. Every save sends the version it loaded, and a stale one is
 *       refused and the screen refreshes. A day being edited keeps its
 *       changes through that refresh.</li>
 * </ul>
 */
export default function OwnerPropertyVisitsScreen() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const { canManage, canView } = usePropertyPermissions(property?.id);
  const canEdit = canManage("PROPERTY_SETTINGS");
  const visible = canView("PROPERTY_SETTINGS");
  const slotsQuery = useGetPropertyVisitSlotsQuery(property?.id ?? "", { skip: !property || !visible });
  const data = slotsQuery.data;
  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={property && !canEdit ? <ViewOnlyChip /> : null}
        italicTail="Hours"
        subtitle={
          property
            ? `When tenants can book a visit to ${property.name}.`
            : "Select a property from Home to set its visit slots."
        }
        title="Visiting"
      />

      {!property ? (
        <EmptyState
          compact
          description="Choose an active property from Home to set its visit slots."
          icon={CalendarClock}
          title="No property selected"
        />
      ) : !visible ? (
        <EmptyState
          compact
          description="The property owner has not given you access to property settings."
          icon={Lock}
          title="You cannot view visit slots"
        />
      ) : !data ? (
        // The real editor, drawn as its own placeholder: every line of sample
        // data is a Ghost, so none of it reads as the property's own.
        <SkeletonBoundary>
          <VisitSlotsEditor canEdit={false} data={SAMPLE} propertyId={property.id} />
        </SkeletonBoundary>
      ) : (
        <VisitSlotsEditor canEdit={canEdit} data={data} propertyId={property.id} />
      )}
    </ScreenScrollView>
  );
}

const DAY_ORDER: VisitDay[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const DAY_FULL: Record<VisitDay, string> = {
  FRIDAY: "Friday",
  MONDAY: "Monday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  THURSDAY: "Thursday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
};

const MAX_SLOTS_PER_DAY = 5;
const MAX_VISITORS_PER_SLOT = 50;
/** A new first slot runs 9 to 11 AM. */
const FIRST_SLOT_START = 9 * 60;
const NEW_SLOT_MINUTES = 2 * 60;
/** 11:59 PM: a slot starts and ends the same day. */
const LAST_MINUTE = 23 * 60 + 59;

/** What the editor draws while the real slots load. Never shown as text. */
const SAMPLE: PropertyVisitSlots = {
  configured: true,
  days: DAY_ORDER.map((day) => ({
    day,
    slots: [
      { endTime: "11:00", number: 1, startTime: "10:00" },
      { endTime: "17:00", number: 2, startTime: "16:00" },
    ],
    visitorsPerSlot: 2,
  })),
  propertyId: "",
  version: 0,
};

/** "10:30" or "10:30:00" to minutes of the day. */
function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "10", "10:30": the clock face without the AM or PM. */
function clockFace(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  const minute = minutes % 60;
  return minute === 0 ? String(hour) : `${hour}:${String(minute).padStart(2, "0")}`;
}

function meridiem(minutes: number): "AM" | "PM" {
  return minutes >= 12 * 60 ? "PM" : "AM";
}

/** "10–11 AM", "11 AM–1 PM". */
function formatRange(start: number, end: number): string {
  return meridiem(start) === meridiem(end)
    ? `${clockFace(start)}–${clockFace(end)} ${meridiem(end)}`
    : `${clockFace(start)} ${meridiem(start)}–${clockFace(end)} ${meridiem(end)}`;
}

function formatTime(minutes: number): string {
  return `${clockFace(minutes)} ${meridiem(minutes)}`;
}

function formatDuration(start: number | null, end: number | null): string | null {
  if (start == null || end == null || end <= start) {
    return null;
  }
  const duration = end - start;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return hours > 0 ? `${hours} hr` : `${minutes} min`;
}

function visitorsForDay(data: PropertyVisitSlots, day: VisitDay): number {
  return data.days.find((entry) => entry.day === day)?.visitorsPerSlot ?? 1;
}

function savedSlots(data: PropertyVisitSlots, day: VisitDay): PropertyVisitSlot[] {
  return data.days.find((entry) => entry.day === day)?.slots ?? [];
}

type SlotRow = { end: number | null; key: string; start: number | null };

/** One day as it is being edited: its slots and its visitors-per-slot limit. */
type DayDraft = { rows: SlotRow[]; visitors: number };

let rowKey = 0;
function newRow(start: number | null, end: number | null): SlotRow {
  rowKey += 1;
  return { end, key: `slot-${rowKey}`, start };
}

/**
 * The slot "+" adds: back to back with the last one (user, 2026-09-30), so it
 * never starts out overlapping. The first runs 9 to 11 AM. Two hours long,
 * cut at 11:59 PM, and left for the owner to pick when the day is full.
 */
function nextRow(rows: SlotRow[]): SlotRow {
  const last = rows[rows.length - 1];
  if (!last) {
    return newRow(FIRST_SLOT_START, FIRST_SLOT_START + NEW_SLOT_MINUTES);
  }
  const start = last.end;
  if (start == null || start >= LAST_MINUTE) {
    return newRow(null, null);
  }
  return newRow(start, Math.min(start + NEW_SLOT_MINUTES, LAST_MINUTE));
}

function draftFrom(data: PropertyVisitSlots, day: VisitDay): DayDraft {
  return {
    rows: savedSlots(data, day).map((slot) => newRow(toMinutes(slot.startTime), toMinutes(slot.endTime))),
    visitors: visitorsForDay(data, day),
  };
}

function draftsFrom(data: PropertyVisitSlots): Record<VisitDay, DayDraft> {
  return Object.fromEntries(DAY_ORDER.map((day) => [day, draftFrom(data, day)])) as Record<VisitDay, DayDraft>;
}

/** Whether a day's draft differs from what is saved for it. */
function isChanged(draft: DayDraft, data: PropertyVisitSlots, day: VisitDay): boolean {
  const saved = savedSlots(data, day);
  const rows = [...draft.rows].sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
  const sameSlots =
    rows.length === saved.length &&
    rows.every(
      (row, index) => row.start === toMinutes(saved[index].startTime) && row.end === toMinutes(saved[index].endTime),
    );
  // A day with no slots has no limit to differ on.
  return !sameSlots || (rows.length > 0 && draft.visitors !== visitorsForDay(data, day));
}

/** Each row's problem, or nothing. Missing times only count once Save was pressed. */
function rowErrors(rows: SlotRow[], attempted: boolean): (string | null)[] {
  const errors: (string | null)[] = rows.map((row) => {
    if (row.start == null || row.end == null) {
      return attempted ? "Pick a start and end time." : null;
    }
    // A time picker cannot go past midnight, so ending before the start is
    // the only way a slot can fail to be one day.
    return row.end <= row.start ? "Must end after it starts, on the same day." : null;
  });
  // Back to back is fine: only a slot starting before the last one ended overlaps.
  const timed = rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => row.start != null && row.end != null && row.end > row.start)
    .sort((a, b) => (a.row.start ?? 0) - (b.row.start ?? 0));
  for (let position = 1; position < timed.length; position += 1) {
    const previous = timed[position - 1];
    const current = timed[position];
    if ((current.row.start ?? 0) < (previous.row.end ?? 0) && errors[current.index] == null) {
      errors[current.index] = `Overlaps Slot ${previous.index + 1}.`;
    }
  }
  return errors;
}

/**
 * All seven days stay on the screen, each with its own slot times and visitor
 * limit. A day is saved independently, so editing Monday never changes Tuesday.
 *
 * <p>A day with unsaved changes keeps them when the saved slots change under
 * it: after another day is saved, or after a stale save refreshes the screen.
 * It is marked "Not saved" until it is saved or its changes are discarded.
 */
function VisitSlotsEditor({
  canEdit,
  data,
  propertyId,
}: {
  canEdit: boolean;
  data: PropertyVisitSlots;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const form = useFormErrors<never>();
  const [createSlots, createState] = useCreatePropertyVisitSlotsMutation();
  const [saveSlots, saveState] = useSavePropertyVisitSlotsMutation();
  const [clearDays, clearState] = useClearPropertyVisitDaysMutation();
  const [expandedDay, setExpandedDay] = useState<VisitDay | null>(data.configured ? null : DAY_ORDER[0]);
  const [drafts, setDrafts] = useState<Record<VisitDay, DayDraft>>(() => draftsFrom(data));
  const [attemptedDay, setAttemptedDay] = useState<VisitDay | null>(null);
  const [savingDay, setSavingDay] = useState<VisitDay | null>(null);
  const busy = createState.isLoading || saveState.isLoading || clearState.isLoading;

  // New saved slots: a day nobody has touched takes them, a day with unsaved
  // changes keeps its own (they were edits against the slots saved before).
  const previousData = useRef(data);
  useEffect(() => {
    const before = previousData.current;
    previousData.current = data;
    if (before === data) {
      return;
    }
    setDrafts((current) =>
      Object.fromEntries(
        DAY_ORDER.map((day) => [day, isChanged(current[day], before, day) ? current[day] : draftFrom(data, day)]),
      ) as Record<VisitDay, DayDraft>,
    );
  }, [data]);

  function updateDraft(day: VisitDay, change: (draft: DayDraft) => DayDraft) {
    setDrafts((current) => ({ ...current, [day]: change(current[day]) }));
  }

  function setCount(day: VisitDay, count: number) {
    updateDraft(day, (draft) => {
      if (count <= draft.rows.length) {
        return { ...draft, rows: draft.rows.slice(0, count) };
      }
      const rows = [...draft.rows];
      while (rows.length < count) {
        rows.push(nextRow(rows));
      }
      return { ...draft, rows };
    });
    setAttemptedDay(null);
  }

  function setTime(day: VisitDay, key: string, edge: "start" | "end", minutes: number) {
    updateDraft(day, (draft) => ({
      ...draft,
      rows: draft.rows.map((row) => (row.key === key ? { ...row, [edge]: minutes } : row)),
    }));
  }

  function setVisitors(day: VisitDay, count: number) {
    updateDraft(day, (draft) => ({ ...draft, visitors: count }));
  }

  function discard(day: VisitDay) {
    setDrafts((current) => ({ ...current, [day]: draftFrom(data, day) }));
    setAttemptedDay(null);
  }

  function applyServerState(day: VisitDay, updated: PropertyVisitSlots) {
    // The saved day now matches the server. The others follow the effect above.
    setDrafts((current) => ({ ...current, [day]: draftFrom(updated, day) }));
    dispatch(propertyApi.util.upsertQueryData("getPropertyVisitSlots", propertyId, updated));
  }

  async function saveDay(day: VisitDay) {
    const { rows, visitors } = drafts[day];
    const errors = rowErrors(rows, true);
    setAttemptedDay(day);
    form.dismissServerError();
    if (errors.some((error) => error != null)) {
      return;
    }

    const serverSlots = savedSlots(data, day);
    setSavingDay(day);
    try {
      let updated: PropertyVisitSlots;
      if (rows.length === 0) {
        if (!data.configured || serverSlots.length === 0 || data.version == null) {
          toast.ok("No visits on " + DAY_FULL[day]);
          setExpandedDay(null);
          return;
        }
        updated = await clearDays({ days: [day], propertyId, version: data.version }).unwrap();
      } else {
        const body = {
          days: [day],
          slots: [...rows]
            .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
            .map((row) => ({ endTime: toHhmm(row.end ?? 0), startTime: toHhmm(row.start ?? 0) })),
          visitorsPerSlot: visitors,
        };
        updated =
          data.configured && data.version != null
            ? await saveSlots({ body, propertyId, version: data.version }).unwrap()
            : await createSlots({ body, propertyId }).unwrap();
      }

      applyServerState(day, updated);
      toast.ok("Visit settings saved for " + DAY_FULL[day]);
      setAttemptedDay(null);
      setExpandedDay(null);
    } catch (error) {
      form.failFromServer(errorMessage(error));
    } finally {
      setSavingDay(null);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <NoticeBar
        message="A day with zero slots is a no-visit day."
        title="Choose the number of visit slots for each day."
        tone="info"
      />

      {DAY_ORDER.map((day) => {
        const { rows, visitors } = drafts[day];
        const changed = canEdit && isChanged(drafts[day], data, day);
        const open = expandedDay === day;
        const errors = rowErrors(rows, attemptedDay === day);
        const summary =
          rows.length === 0
            ? "No visits day"
            : rows.length +
              (rows.length === 1 ? " slot" : " slots") +
              " · " +
              visitors +
              (visitors === 1 ? " visitor per slot" : " visitors per slot");
        const ToggleIcon = open ? ChevronUp : ChevronDown;

        return (
          <Card key={day}>
            <Pressable
              accessibilityLabel={DAY_FULL[day] + ", " + summary + (changed ? ", not saved" : "")}
              accessibilityRole="button"
              onPress={() => setExpandedDay(open ? null : day)}
              style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <GhostText ghostWidth="45%" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}>
                  {DAY_FULL[day]}
                </GhostText>
                <GhostText ghostWidth="70%" style={[type.caption, { color: rows.length === 0 ? colors.muted : colors.primary }]}>
                  {summary}
                </GhostText>
                {/* Said in words, not only by colour: this day's changes are
                    only on this screen until it is saved. */}
                {changed ? (
                  <Text style={[type.caption, { color: colors.warningText, fontFamily: fonts.sansBold }]}>Not saved</Text>
                ) : null}
              </View>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 34,
                  justifyContent: "center",
                  width: 34,
                }}
              >
                <GhostIcon color={colors.ink} icon={ToggleIcon} size={17} strokeWidth={2.3} />
              </View>
            </Pressable>

            {open ? (
              <View style={{ gap: spacing.sm }}>
                {canEdit ? (
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderCurve: "continuous",
                      borderRadius: radii.card,
                      borderWidth: 1,
                      padding: spacing.md,
                    }}
                  >
                    <Stepper
                      label="Number of slots"
                      max={MAX_SLOTS_PER_DAY}
                      min={0}
                      onChange={(count) => setCount(day, count)}
                      value={rows.length}
                      valueLabel={rows.length === 0 ? "No visits" : String(rows.length)}
                    />
                  </View>
                ) : null}

                {rows.length > 0 ? (
                  <>
                    {canEdit ? (
                      <View
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderCurve: "continuous",
                          borderRadius: radii.card,
                          borderWidth: 1,
                          padding: spacing.md,
                        }}
                      >
                        <Stepper
                          label="Visitors per slot"
                          max={MAX_VISITORS_PER_SLOT}
                          min={1}
                          onChange={(count) => setVisitors(day, count)}
                          value={visitors}
                        />
                      </View>
                    ) : null}

                    {/* Grey, not pale blue, and an outlined icon rather than a
                        tinted disc: the app's rules for fills and icons. */}
                    <View
                      style={{
                        alignItems: "flex-start",
                        backgroundColor: colors.surfaceSunken,
                        borderCurve: "continuous",
                        borderRadius: radii.card,
                        flexDirection: "row",
                        gap: spacing.sm,
                        padding: spacing.md,
                      }}
                    >
                      <View
                        style={{
                          alignItems: "center",
                          borderColor: colors.ink,
                          borderRadius: 999,
                          borderWidth: 1,
                          height: 36,
                          justifyContent: "center",
                          width: 36,
                        }}
                      >
                        <Users color={colors.ink} size={18} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
                          {visitors + (visitors === 1 ? " visitor per slot" : " visitors per slot")}
                        </Text>
                        <Text style={[type.caption, { color: colors.muted }]}>
                          {"Applies to all " + DAY_FULL[day] + " slots."}
                        </Text>
                      </View>
                    </View>

                    <View style={{ gap: spacing.sm }}>
                      {rows.map((row, index) => (
                        <View
                          key={row.key}
                          style={{
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            borderCurve: "continuous",
                            borderRadius: radii.card,
                            borderWidth: 1,
                            gap: spacing.sm,
                            padding: spacing.md,
                          }}
                        >
                          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 21 }}>
                              {"SLOT " + (index + 1)}
                            </Text>
                            {formatDuration(row.start, row.end) ? (
                              <View
                                style={{
                                  alignItems: "center",
                                  backgroundColor: colors.surfaceSunken,
                                  borderRadius: 999,
                                  flexDirection: "row",
                                  gap: 4,
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: 4,
                                }}
                              >
                                <Clock color={colors.muted} size={14} />
                                <Text style={[type.caption, { color: colors.inkSoft, fontFamily: fonts.sansMedium }]}>
                                  {formatDuration(row.start, row.end)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {canEdit ? (
                            <>
                              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                                <SlotTimeField
                                  label="Starts"
                                  onChange={(minutes) => setTime(day, row.key, "start", minutes)}
                                  value={row.start}
                                />
                                <SlotTimeField
                                  label="Ends"
                                  onChange={(minutes) => setTime(day, row.key, "end", minutes)}
                                  value={row.end}
                                />
                              </View>
                              <FieldError message={errors[index] ?? undefined} />
                            </>
                          ) : (
                            <Text style={[type.description, { color: colors.inkSoft }]}>
                              {formatRange(row.start ?? 0, row.end ?? 0)}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={[type.description, { color: colors.muted }]}>
                    Interested people will not be able to book a visit on this day.
                  </Text>
                )}

                {canEdit ? (
                  <View style={{ flexDirection: "row", gap: spacing.xs }}>
                    {changed ? (
                      <ActionButton disabled={busy} label="Discard" onPress={() => discard(day)} variant="secondary" />
                    ) : null}
                    <ActionButton
                      disabled={busy}
                      label={savingDay === day ? "Saving…" : rows.length === 0 ? "Save no visits" : "Save " + DAY_FULL[day]}
                      onPress={() => void saveDay(day)}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </View>
  );
}

/** A count set with − and +, inside its limits. */
function Stepper({
  label,
  max,
  min,
  onChange,
  value,
  valueLabel,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
  valueLabel?: string;
}) {
  const { colors, fonts } = useTheme();
  const button = (icon: typeof Minus, next: number, enabled: boolean, name: string) => {
    const Icon = icon;
    return (
      <AnimatedPressable
        accessibilityLabel={name}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={() => onChange(next)}
        style={{
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderRadius: 999,
          borderWidth: 1,
          height: 34,
          justifyContent: "center",
          opacity: enabled ? 1 : 0.4,
          width: 34,
        }}
      >
        <Icon color={colors.ink} size={16} strokeWidth={2.4} />
      </AnimatedPressable>
    );
  };
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 14 }}>{label}</Text>
      {button(Minus, value - 1, value > min, `Fewer, ${label.toLowerCase()}`)}
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sansBold,
          fontSize: 15,
          minWidth: 66,
          textAlign: "center",
        }}
      >
        {valueLabel ?? value}
      </Text>
      {button(Plus, value + 1, value < max, `More, ${label.toLowerCase()}`)}
    </View>
  );
}

/** A time you tap to pick, showing "Starts" or "Ends" until one is chosen. */
function SlotTimeField({ label, onChange, value }: { label: string; onChange: (minutes: number) => void; value: number | null }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  // The picker needs a date to start from: the chosen time, or 10 AM.
  const pickerValue = new Date(2000, 0, 1, Math.floor((value ?? 600) / 60), (value ?? 600) % 60);

  function onPick(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !selected) {
      return;
    }
    onChange(selected.getHours() * 60 + selected.getMinutes());
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityLabel={value == null ? `${label}, not set` : `${label}, ${formatTime(value)}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderRadius: radii.sm,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.xs,
          minHeight: 44,
          paddingHorizontal: spacing.sm,
        }}
      >
        <Clock color={colors.kicker} size={15} />
        {value == null ? (
          <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        ) : (
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{formatTime(value)}</Text>
        )}
      </Pressable>
      {open ? <DateTimePicker mode="time" onChange={onPick} value={pickerValue} /> : null}
    </View>
  );
}
