import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import {
  dayParts,
  formatSlotRange,
  formatSpotsLeft,
  formatVisitWhen,
} from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { PropertyVisitsIcon } from "@/features/property/property-control-icons";
import {
  useGetVisitAvailabilityQuery,
  useRescheduleVisitMutation,
  useScheduleVisitMutation,
  type EnquiryParty,
  type Visit,
  type VisitAvailability,
  type VisitSlotAvailability,
} from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Day = VisitAvailability["days"][number];

// Ghost, so the loading sheet has the shape of the real one and none of this
// reads as the property's actual hours.
const SAMPLE_DAYS: Day[] = ["2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"].map(
  (date) => ({
    date,
    slots: [
      { capacity: 3, endTime: "11:00:00", spotsLeft: 3, startTime: "10:00:00" },
      { capacity: 3, endTime: "17:00:00", spotsLeft: 1, startTime: "16:00:00" },
      { capacity: 3, endTime: "19:00:00", spotsLeft: 0, startTime: "18:00:00" },
    ],
  }),
);

/**
 * Picks a date and one of the property's visit slots on it.
 *
 * <p>One sheet for both booking and moving a visit: the choice is the same, and
 * only the heading, the note under it and the button differ. Pass `visit` to
 * move it.
 *
 * <p>The slots, and the places left in each, are the server's. A full slot is
 * shown and cannot be picked. Two people can still go for the last place at
 * once, so a refusal after tapping is possible, and the list is read again
 * when it happens.
 */
export function VisitSheet({
  enquiryId,
  onClose,
  propertyId,
  viewer,
  visit,
}: {
  enquiryId: string;
  onClose: () => void;
  propertyId: string;
  viewer: EnquiryParty;
  /** The visit being moved. Left out when booking a new one. */
  visit?: Visit | null;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const availability = useGetVisitAvailabilityQuery(propertyId, { refetchOnMountOrArgChange: true });
  const [scheduleVisit, scheduleState] = useScheduleVisitMutation();
  const [rescheduleVisit, rescheduleState] = useRescheduleVisitMutation();
  const [date, setDate] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const moving = Boolean(visit);
  const saving = scheduleState.isLoading || rescheduleState.isLoading;
  const loading = availability.isLoading;
  const days = useMemo(() => availability.data?.days ?? [], [availability.data]);

  // Opens on the first day that still has a place, so the common case is one
  // tap on a slot and one on the button.
  useEffect(() => {
    if (date || days.length === 0) {
      return;
    }
    const firstOpen = days.find((day) => day.slots.some((slot) => slot.spotsLeft > 0));
    setDate((firstOpen ?? days[0]).date);
  }, [date, days]);

  const selectedDay = days.find((day) => day.date === date) ?? null;

  async function submit() {
    if (!date || !slotStart || saving) {
      return;
    }
    try {
      if (visit) {
        await rescheduleVisit({ date, slotStart, version: visit.version, visitId: visit.id }).unwrap();
        toast.success(`Visit moved to ${formatVisitWhen(date, slotStart)}.`);
      } else {
        await scheduleVisit({ date, enquiryId, slotStart }).unwrap();
        toast.success(`Visit scheduled for ${formatVisitWhen(date, slotStart)}.`);
      }
      onClose();
    } catch (error) {
      setFailure(errorMessage(error));
      // Most refusals here are a slot that filled up a moment ago. Show what is left now.
      setSlotStart(null);
      void availability.refetch();
    }
  }

  const note = !visit
    ? null
    : visit.missed
      ? `Missed: ${formatVisitWhen(visit.date, visit.slotStart)}.`
      : `Now: ${formatVisitWhen(visit.date, visit.slotStart)}.`;
  const changesLeft =
    visit && viewer === "ENQUIRER"
      ? visit.tenantReschedulesLeft === 1
        ? "1 change left."
        : `${visit.tenantReschedulesLeft} changes left.`
      : null;

  return (
    <SheetShell onClose={onClose} title={moving ? "Reschedule visit" : "Schedule a visit"}>
      {note ? (
        <Text style={[type.description, { color: colors.muted }]}>
          {changesLeft ? `${note} ${changesLeft}` : note}
        </Text>
      ) : null}

      {loading ? (
        <SkeletonBoundary>
          <View style={{ gap: spacing.md }}>
            <DayStrip days={SAMPLE_DAYS} onPick={() => undefined} selected={SAMPLE_DAYS[1].date} />
            <View style={{ gap: spacing.sm }}>
              {SAMPLE_DAYS[0].slots.map((slot) => (
                <SlotRow key={slot.startTime} onPick={() => undefined} selected={false} slot={slot} />
              ))}
            </View>
          </View>
        </SkeletonBoundary>
      ) : null}

      {/* No hours set: an empty state carrying the Visiting Hours card's own
          mark (user, 2026-10-02), so management recognises where to set them. */}
      {!loading && days.length === 0 ? (
        <EmptyState
          artworkNode={<PropertyVisitsIcon size={64} />}
          compact
          description={
            availability.isError
              ? "Could not load the visit slots. Close this and try again."
              : viewer !== "ENQUIRER"
                ? "Set them in Property workspace, under Visiting Hours."
                : "Visits open up here once the property sets its hours."
          }
          title={availability.isError ? "Slots unavailable" : "No visiting hours yet"}
        />
      ) : null}

      {!loading && days.length > 0 ? (
        <>
          <DayStrip
            days={days}
            onPick={(picked) => {
              setDate(picked);
              setSlotStart(null);
            }}
            selected={date}
          />

          <View style={{ gap: spacing.sm }}>
            {(selectedDay?.slots ?? []).map((slot) => (
              <SlotRow
                current={Boolean(
                  visit &&
                    visit.upcoming &&
                    selectedDay &&
                    visit.date === selectedDay.date &&
                    visit.slotStart === slot.startTime,
                )}
                key={slot.startTime}
                onPick={() => setSlotStart(slot.startTime)}
                selected={slotStart === slot.startTime}
                slot={slot}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", paddingTop: spacing.xs }}>
            <ActionButton
              disabled={!date || !slotStart || saving}
              label={saving ? "Saving" : moving ? "Move visit" : "Schedule visit"}
              onPress={() => void submit()}
            />
          </View>
        </>
      ) : null}

      {failure ? <AlertModal message={failure} onClose={() => setFailure(null)} /> : null}
    </SheetShell>
  );
}

const DAY_CARD_SIZE = 66;

/** The dates on offer, side by side. A sideways scroll: thirty days do not fit a phone's width. */
function DayStrip({
  days,
  onPick,
  selected,
}: {
  days: Day[];
  onPick: (date: string) => void;
  selected: string | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.xs }}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      {days.map((day) => {
        const parts = dayParts(day.date);
        const picked = day.date === selected;
        return (
          <AnimatedPressable
            accessibilityLabel={`${parts.weekday} ${parts.day} ${parts.month}`}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            key={day.date}
            onPress={() => onPick(day.date)}
            // Square, on a grey fill (user, 2026-10-02). The picked day keeps
            // its blue edge so the choice still reads at a glance.
            style={{
              alignItems: "center",
              backgroundColor: colors.neutralSoft,
              borderColor: picked ? colors.primary : "transparent",
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1.5,
              gap: 1,
              height: DAY_CARD_SIZE,
              justifyContent: "center",
              width: DAY_CARD_SIZE,
            }}
          >
            <GhostText ghostWidth={26} style={[type.caption, { color: colors.muted }]}>
              {parts.weekday}
            </GhostText>
            <GhostText ghostWidth={20} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>
              {parts.day}
            </GhostText>
            <GhostText ghostWidth={24} style={[type.caption, { color: colors.muted }]}>
              {parts.month}
            </GhostText>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

function SlotRow({
  current = false,
  onPick,
  selected,
  slot,
}: {
  /** The slot the visit is already in. Shown, and not offered again. */
  current?: boolean;
  onPick: () => void;
  selected: boolean;
  slot: VisitSlotAvailability;
}) {
  const { colors, fonts, type } = useTheme();
  const full = slot.spotsLeft <= 0;
  const unavailable = full || current;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, selected }}
      disabled={unavailable}
      onPress={onPick}
      style={{
        alignItems: "center",
        // A pale blue fill marks the chosen slot (user, 2026-10-02).
        backgroundColor: selected ? colors.primarySoft : "transparent",
        borderColor: selected ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: selected ? 1.5 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <GhostText
        ghostWidth="48%"
        style={{
          color: unavailable ? colors.muted : colors.ink,
          fontFamily: fonts.sansMedium,
          fontSize: 15,
        }}
      >
        {formatSlotRange(slot.startTime, slot.endTime)}
      </GhostText>
      <GhostText ghostWidth="22%" style={[type.caption, { color: colors.muted }]}>
        {current ? "Current" : formatSpotsLeft(slot.spotsLeft)}
      </GhostText>
    </AnimatedPressable>
  );
}
