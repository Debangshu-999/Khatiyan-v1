import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Clock, Megaphone } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { FieldError } from "@/components/field-error";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { MealGlyph, MEAL_LABEL, formatMealTime, formatMealWindow } from "@/features/food/food-ui";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import {
  useDelayMealMutation,
  useSaveMealTimingsMutation,
  type MealSchedule,
  type MealSlot,
} from "@/store/services/food-api";
import type { MealType } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The meal timetable and one-day delays (2026-09-28). The server decides which
 * meal is next and whether a delay is allowed. These screens only show it.
 */

/** "20:45:00" to a Date today at that time, for the native time picker. */
function toDate(time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** A Date's time as "HH:mm", which is what the API takes. */
function toHhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Minutes into the day, in IST, right now. */
function nowIstMinutes(): number {
  const ist = new Date(Date.now() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * Whether a meal can still be changed: not started, and more than the cutoff
 * before its start. `startTime` carries the day's delay, so the cutoff moves
 * with it. A delay and taking a dish off share it (2026-09-29). The server has
 * the last word.
 */
export function beforeCutoff(slot: MealSlot, cutoffMinutes: number): boolean {
  return slot.status === "UPCOMING" && nowIstMinutes() < minutesOf(slot.startTime) - cutoffMinutes;
}

/** Whether the Delay button can still be offered. */
export function canStillDelay(slot: MealSlot, cutoffMinutes: number): boolean {
  return beforeCutoff(slot, cutoffMinutes);
}

/** "Delayed by 45 min" in amber. The tenant's Up next and the owner's card share it. */
export function DelayedChip({ minutes }: { minutes: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.warningSoft,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <MaterialCommunityIcons color={colors.warningText} name="clock-alert-outline" size={13} />
      <Text style={{ color: colors.warningText, fontFamily: fonts.sansBold, fontSize: 11.5 }}>
        Delayed by {minutes} min
      </Text>
    </View>
  );
}

/** Shown where the next meal would be, once the day's last meal is over. */
export function MealsDoneForToday() {
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <MaterialCommunityIcons color={colors.jade} name="check-circle-outline" size={22} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>All meals are done for today</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
            Tomorrow's first meal shows after midnight.
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** The standing timetable, one row per served meal, with Edit for managers. */
export function MealTimingsCard({
  onEdit,
  schedule,
}: {
  /** Left out for a read-only manager. */
  onEdit?: () => void;
  schedule: MealSchedule;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <MaterialCommunityIcons color={colors.ink} name="clock-outline" size={18} />
        <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>Meal timings</Text>
        {onEdit ? (
          <Text onPress={onEdit} style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>
            Edit
          </Text>
        ) : null}
      </View>
      <View style={{ gap: spacing.xs }}>
        {schedule.timings.map((timing) => (
          <View key={timing.mealType} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <MealGlyph color={colors.muted} meal={timing.mealType} size={16} />
            <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sans, fontSize: 13 }}>
              {MEAL_LABEL[timing.mealType]}
            </Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
              {formatMealWindow(timing.startTime, timing.endTime)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * "Meal notices": a reminder that notices about meals should follow the meal
 * timings and delays (user, 2026-09-28). Advice only, nothing is enforced, so
 * it is the owner's call.
 */
function MealNoticesAdvisory({
  link,
  message,
  ownLine = false,
}: {
  link: { label: string; onPress: () => void };
  message: string;
  /** Puts "Go to …" on a line of its own, for a message that leaves no room after it. */
  ownLine?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <NoticeBar
      icon={Megaphone}
      message={
        <>
          {message}
          {/* "Go to" in the message's colour, the place in blue. */}
          {ownLine ? "\nGo to " : " Go to "}
          <Text onPress={link.onPress} style={{ color: colors.primary, fontFamily: fonts.sansBold }}>
            {link.label}
          </Text>
        </>
      }
      title="Meal notices"
      tone="warning"
    />
  );
}

/** A time you tap to change, opening the native time picker. */
function TimeField({ label, onChange, value }: { label: string; onChange: (value: Date) => void; value: Date }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  function onPick(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !selected) {
      return;
    }
    onChange(selected);
  }

  return (
    <View style={{ flex: 1, gap: spacing.xxs }}>
      <Text style={[type.caption, { color: colors.kicker }]}>{label}</Text>
      <Pressable
        accessibilityLabel={`${label}, ${formatMealTime(toHhmm(value))}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
        }}
      >
        <Clock color={colors.kicker} size={15} />
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {formatMealTime(toHhmm(value))}
        </Text>
      </Pressable>
      {open ? <DateTimePicker mode="time" onChange={onPick} value={value} /> : null}
    </View>
  );
}

/**
 * Edits the whole timetable at once. The server checks the meals run in order
 * without overlapping, since moving one can collide with the next.
 */
export function MealTimingsSheet({
  onClose,
  propertyId,
  schedule,
}: {
  onClose: () => void;
  propertyId: string;
  schedule: MealSchedule;
}) {
  const router = useGuardedRouter();
  const toast = useToast();
  const form = useFormErrors<never>();
  const [save, saveState] = useSaveMealTimingsMutation();
  const [times, setTimes] = useState(() =>
    schedule.timings.map((timing) => ({
      end: toDate(timing.endTime),
      mealType: timing.mealType,
      start: toDate(timing.startTime),
    })),
  );

  function set(mealType: MealType, edge: "start" | "end", value: Date) {
    setTimes((current) => current.map((row) => (row.mealType === mealType ? { ...row, [edge]: value } : row)));
  }

  // A meal starts and ends on the same day (user, 2026-09-29), so its end is
  // after its start on the clock. 11 pm to 1 am is said here, while picking,
  // rather than refused after Save.
  const crossing = (row: { end: Date; start: Date }) =>
    minutesOf(toHhmm(row.end)) <= minutesOf(toHhmm(row.start));
  const anyCrossing = times.some(crossing);

  async function submit() {
    try {
      await save({
        propertyId,
        timings: times.map((row) => ({ endTime: toHhmm(row.end), mealType: row.mealType, startTime: toHhmm(row.start) })),
      }).unwrap();
      toast.ok("Meal timings saved");
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell animated onClose={onClose} title="Meal timings">
      {times.map((row, index) => (
        // A little more room under the title before the first meal.
        <View key={row.mealType} style={{ gap: spacing.xs, marginTop: index === 0 ? spacing.sm : 0 }}>
          <MealHeading mealType={row.mealType} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TimeField label="Starts" onChange={(value) => set(row.mealType, "start", value)} value={row.start} />
            <TimeField label="Ends" onChange={(value) => set(row.mealType, "end", value)} value={row.end} />
          </View>
          {crossing(row) ? (
            <FieldError message={`${MEAL_LABEL[row.mealType]} must start and end on the same day, and end after it starts.`} />
          ) : null}
        </View>
      ))}
      <MealNoticesAdvisory
        link={{
          label: "Recurring notices",
          onPress: () => {
            onClose();
            router.push({ params: { tab: "recurring" }, pathname: "/owner-notices" });
          },
        }}
        message={'Notices about meals should follow these timings. If one announces a meal, like a recurring "Dinner ready", change its time to match.'}
      />
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={saveState.isLoading || anyCrossing}
          label={saveState.isLoading ? "Saving…" : "Save timings"}
          onPress={() => void submit()}
        />
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

function MealHeading({ mealType }: { mealType: MealType }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <MealGlyph color={colors.ink} meal={mealType} size={17} />
      <Text style={[type.bodyStrong, { color: colors.ink }]}>{MEAL_LABEL[mealType]}</Text>
    </View>
  );
}

/**
 * Pushes one of today's meals later, like delaying a notice: pick the new
 * start, the end moves with it, and it is today only. Tenants on a meal plan
 * are told.
 */
export function DelayMealSheet({
  onClose,
  propertyId,
  slot,
}: {
  onClose: () => void;
  propertyId: string;
  slot: MealSlot;
}) {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const form = useFormErrors<"time">();
  const [delay, delayState] = useDelayMealMutation();
  const [picked, setPicked] = useState(() => {
    const start = toDate(slot.startTime);
    start.setMinutes(start.getMinutes() + 15);
    return start;
  });

  const lengthMinutes = minutesOf(slot.endTime) - minutesOf(slot.startTime);
  const newEnd = new Date(picked.getTime() + lengthMinutes * 60_000);
  const addedMinutes = minutesOf(toHhmm(picked)) - minutesOf(slot.startTime);

  async function submit() {
    if (!form.validate(addedMinutes > 0 ? {} : { time: `Pick a time later than ${formatMealTime(slot.startTime)}.` })) {
      return;
    }
    try {
      await delay({ mealType: slot.mealType, newStartTime: toHhmm(picked), propertyId }).unwrap();
      toast.ok(`${MEAL_LABEL[slot.mealType]} delayed to ${formatMealTime(toHhmm(picked))}`);
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell animated onClose={onClose} title={`Delay ${MEAL_LABEL[slot.mealType].toLowerCase()}`}>
      <View style={{ flexDirection: "row" }}>
        <TimeField
          label="NEW START TIME"
          onChange={(value) => {
            setPicked(value);
            form.clearField("time");
          }}
          value={picked}
        />
      </View>
      <FieldError message={form.errors.time} />

      {/* Old window, arrow, new window (user, 2026-09-28). */}
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13.5, textDecorationLine: "line-through" }}>
          {formatMealWindow(slot.startTime, slot.endTime)}
        </Text>
        <MaterialCommunityIcons color={colors.kicker} name="arrow-right" size={16} />
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
          {formatMealWindow(toHhmm(picked), toHhmm(newEnd))}
        </Text>
      </View>
      <NoticeBar
        message="Tomorrow keeps the usual time. Everyone on a meal plan is notified."
        title="Today only"
        tone="info"
      />

      <MealNoticesAdvisory
        link={{
          label: "Upcoming notices",
          onPress: () => {
            onClose();
            router.push("/owner-upcoming-notices");
          },
        }}
        ownLine
        message={'Notices about this meal should follow the delay. If one announces it, like a recurring "Dinner ready", delay it too.'}
      />

      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={delayState.isLoading || form.blocked}
          icon={Clock}
          label={delayState.isLoading ? "Delaying…" : `Delay ${MEAL_LABEL[slot.mealType].toLowerCase()}`}
          onPress={() => void submit()}
        />
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}
