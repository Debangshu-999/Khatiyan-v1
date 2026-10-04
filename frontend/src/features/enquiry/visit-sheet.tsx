import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CalendarDays } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { CancelVisitForm, notInterestedLine, type CancelVisitAnswer } from "@/features/enquiry/cancel-visit-form";
import { GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import {
  dayParts,
  formatSlotRange,
  formatSpotsLeft,
  formatVisitShort,
  formatVisitSlot,
} from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { PropertyVisitsIcon } from "@/features/property/property-control-icons";
import { useSendChatMessageMutation } from "@/store/services/chat-api";
import {
  useCancelVisitMutation,
  useGetVisitAvailabilityQuery,
  useGetVisitMoveOptionsQuery,
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
 * <p>One sheet for booking a visit and for managing one: the choice is the
 * same, and only the heading, the line under it and the buttons differ. Pass
 * `visit` to manage it.
 *
 * <p>Nothing is booked, moved or cancelled without a confirmation naming who
 * and when (user, 2026-10-03). The enquirer can also send their pick to the
 * property as a chat message instead of booking it.
 *
 * <p>The slots, and the places left in each, are the server's. A full slot is
 * shown and cannot be picked. Two people can still go for the last place at
 * once, so a refusal after confirming is possible, and the list is read again
 * when it happens.
 */
export function VisitSheet({
  enquiryId,
  loadingVisit = false,
  notInterestedCloses = false,
  onBack,
  onClose,
  personName,
  propertyId,
  threadId,
  viewer,
  visit,
}: {
  enquiryId: string;
  /** The enquirer changed their mind once, so Not interested now closes the enquiry at once. */
  notInterestedCloses?: boolean;
  /**
   * Set when this sheet is stacked on another, such as Running late (user,
   * 2026-10-04): a back arrow, and the device's back button, return to the
   * sheet underneath. The X still closes.
   */
  onBack?: () => void;
  onClose: () => void;
  /**
   * Who the visit is for, named in management's confirmations. The enquirer
   * reads "your visit" instead.
   */
  personName?: string | null;
  propertyId: string;
  /** The enquiry's conversation: lets the enquirer send their pick as a message. */
  threadId?: string | null;
  viewer: EnquiryParty;
  /** The visit being managed. Left out when booking a new one. */
  visit?: Visit | null;
  /**
   * The visit is being read and has not arrived. The sheet opens as "Manage
   * visit" with its loading shape, rather than as a booking for a moment.
   */
  loadingVisit?: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // Booking reads the property's open slots. Moving reads where THIS visit
  // may go right now (2026-10-04): on its own day that includes later slots
  // today, and running late it may be those alone. The server decides.
  const availability = useGetVisitAvailabilityQuery(propertyId, {
    refetchOnMountOrArgChange: true,
    skip: Boolean(visit),
  });
  const moveOptions = useGetVisitMoveOptionsQuery(visit?.id ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !visit,
  });
  const [scheduleVisit, scheduleState] = useScheduleVisitMutation();
  const [rescheduleVisit, rescheduleState] = useRescheduleVisitMutation();
  const [cancelVisit, cancelState] = useCancelVisitMutation();
  const [sendMessage, sendState] = useSendChatMessageMutation();
  const [confirming, setConfirming] = useState<"book" | "cancel" | null>(null);
  // Cancelling asks first whether they are still interested, and why
  // (owner's design, 2026-10-03), then confirms.
  const [cancelling, setCancelling] = useState(false);
  const [cancelAnswer, setCancelAnswer] = useState<CancelVisitAnswer | null>(null);
  // The day the person tapped. Null until they tap one, and the default below
  // stands in.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const moving = Boolean(visit);
  // Cancel visit is the sheet's second step, drawn in place of Manage visit
  // with a back arrow, not a sheet stacked on top (user, 2026-10-03).
  const cancelStep = cancelling && Boolean(visit);
  const enquirer = viewer === "ENQUIRER";
  // Booking, or a visit that can still be moved. A visit that cannot (its day
  // has come, or the tenant has used both changes) opens here only to be
  // cancelled, with the reason it cannot move in place of the slots.
  const picking = !visit || visit.canReschedule;
  const busy = scheduleState.isLoading || rescheduleState.isLoading || cancelState.isLoading || sendState.isLoading;
  const loading = (visit ? moveOptions.isLoading : availability.isLoading) || loadingVisit;
  const days = useMemo(
    () => (visit ? moveOptions.data?.days : availability.data?.days) ?? [],
    [availability.data, moveOptions.data, visit],
  );

  // Opens on the first day that still has a place, so the common case is one
  // tap on a slot and one on the button. Worked out in the render, not set by
  // an effect: an effect lands one render after the slots do, and that render
  // drew the sheet with no day and no slots, so on a first open (nothing
  // cached) the sheet shrank by its slot rows and sprang back (2026-10-03).
  const defaultDate = useMemo(
    () => (days.find((day) => day.slots.some((slot) => slot.spotsLeft > 0)) ?? days[0])?.date ?? null,
    [days],
  );
  const date = pickedDate ?? defaultDate;

  const selectedDay = days.find((day) => day.date === date) ?? null;
  const selectedSlot = selectedDay?.slots.find((slot) => slot.startTime === slotStart) ?? null;
  // Date and slot, the way both lines of the sheet and every confirmation say them.
  const picked = date && selectedSlot ? formatVisitSlot(date, selectedSlot.startTime, selectedSlot.endTime) : null;
  const current = visit ? formatVisitSlot(visit.date, visit.slotStart, visit.slotEnd) : null;
  // The pill under the title says a visit by its day and start alone.
  const currentShort = visit ? formatVisitShort(visit.date, visit.slotStart) : null;
  const pickedShort = date && selectedSlot ? formatVisitShort(date, selectedSlot.startTime) : null;
  const name = personName?.trim() || null;

  async function book() {
    setConfirming(null);
    if (!date || !slotStart || !picked || busy) {
      return;
    }
    try {
      if (visit) {
        await rescheduleVisit({ date, slotStart, version: visit.version, visitId: visit.id }).unwrap();
        toast.success(`Visit moved to ${picked}.`);
      } else {
        await scheduleVisit({ date, enquiryId, slotStart }).unwrap();
        toast.success(`Visit scheduled for ${picked}.`);
      }
      onClose();
    } catch (error) {
      setFailure(errorMessage(error));
      // Most refusals here are a slot that filled up a moment ago. Show what is left now.
      setSlotStart(null);
      if (visit) {
        void moveOptions.refetch();
      } else {
        void availability.refetch();
      }
    }
  }

  async function cancel() {
    setConfirming(null);
    if (!visit || !cancelAnswer || busy) {
      return;
    }
    try {
      // No toast: the bar changing back to Schedule visit is the confirmation,
      // as with ending a conversation.
      await cancelVisit({
        reason: cancelAnswer.reason,
        stillInterested: cancelAnswer.stillInterested,
        version: visit.version,
        visitId: visit.id,
      }).unwrap();
      onClose();
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }

  /**
   * The enquirer's pick, as a message in the enquiry's conversation rather
   * than a booking (user, 2026-10-03). Nothing is booked: the property reads it
   * and books, or answers.
   */
  async function sendAsText() {
    if (!threadId || !picked || busy) {
      return;
    }
    try {
      await sendMessage({
        body: moving ? `I want to reschedule my visit to ${picked}.` : `I want to schedule my visit on ${picked}.`,
        threadId,
      }).unwrap();
      onClose();
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }

  // The line under the title (user, 2026-10-03). The tenant has two
  // reschedules before the visit date and two more after a miss, and the
  // server sends the count that applies today. The property's side moves a
  // visit as often as it needs to.
  const left = visit?.tenantReschedulesLeft ?? 0;
  // Used up is said in the same pill, in so many words (user, 2026-10-03).
  const usedUp = Boolean(visit && enquirer && left === 0);
  const rescheduleLine = !visit
    ? null
    : enquirer
      ? usedUp
        ? "No reschedules left"
        : `${left} ${left === 1 ? "Reschedule" : "Reschedules"} left`
      : "Can reschedule anytime";
  // A missed visit's date is shown in red (user, 2026-10-03).
  const currentTint = visit?.missed ? colors.danger : colors.ink;
  // Management's confirmations name the person; the enquirer's say "your".
  const theirVisit = name ? `${name}'s visit` : "their visit";

  return (
    // "Manage visit", not "Reschedule": it moves the visit and cancels it
    // (user, 2026-10-03).
    <SheetShell
      // Straight under the title, in a grey pill: what may still be done with
      // the visit (user, 2026-10-03).
      belowTitle={
        !cancelStep && visit && (picking || usedUp) && rescheduleLine ? (
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: colors.neutralSoft,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11.5 }}>{rescheduleLine}</Text>
          </View>
        ) : null
      }
      onBack={cancelStep ? () => setCancelling(false) : onBack}
      onClose={onClose}
      title={cancelStep ? "Cancel visit" : moving || loadingVisit ? "Manage visit" : "Schedule a visit"}
    >
      {cancelStep && visit ? (
        <CancelVisitForm
          canReschedule={visit.canReschedule}
          enquirer={enquirer}
          notInterestedCloses={notInterestedCloses}
          onReschedule={() => setCancelling(false)}
          onSubmit={(answer) => {
            setCancelAnswer(answer);
            setConfirming("cancel");
          }}
        />
      ) : (
        <>
          {visit && !picking && !usedUp ? (
            <Text style={[type.description, { color: colors.muted }]}>
              {visit.rescheduleRefusal ?? "This visit can no longer be moved."}
            </Text>
          ) : null}

          {/* The visit as it stands, in a grey pill: a calendar, then its day and
              start. Once a new slot is picked it is struck through, with an arrow
              to the new one in the same pill (user, 2026-10-03). */}
          {visit && currentShort ? (
            <View
              style={{
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: colors.neutralSoft,
                borderRadius: radii.pill,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.xs,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 6,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
                <CalendarDays color={currentTint} size={14} strokeWidth={2.2} />
                <Text style={{ color: currentTint, fontFamily: fonts.sansBold, fontSize: 13 }}>
                  {visit.missed ? " Missed: " : ": "}
                  <Text style={picking && pickedShort ? { textDecorationLine: "line-through" } : undefined}>
                    {currentShort}
                  </Text>
                </Text>
              </View>
              {picking && pickedShort ? (
                <>
                  <MaterialCommunityIcons color={colors.kicker} name="arrow-right" size={16} />
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{pickedShort}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          {picking && loading ? (
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
          {picking && !loading && days.length === 0 ? (
            <EmptyState
              artworkNode={<PropertyVisitsIcon size={64} />}
              compact
              description={
                (visit ? moveOptions.isError : availability.isError)
                  ? "Could not load the visit slots. Close this and try again."
                  : visit
                    ? // Moving, and the server offers nowhere to move it to right now.
                      moveOptions.data?.refusal ?? "There is no slot to move this visit to right now."
                    : viewer !== "ENQUIRER"
                      ? "Set them in Property workspace, under Visiting Hours."
                      : "Visits open up here once the property sets its hours."
              }
              title={
                (visit ? moveOptions.isError : availability.isError)
                  ? "Slots unavailable"
                  : visit
                    ? "No slot to move to"
                    : "No visiting hours yet"
              }
            />
          ) : null}

          {picking && !loading && days.length > 0 ? (
            <>
              <DayStrip
                days={days}
                onPick={(day) => {
                  setPickedDate(day);
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
                    // A second tap on the picked slot unpicks it (user, 2026-10-03).
                    onPick={() => setSlotStart((chosen) => (chosen === slot.startTime ? null : slot.startTime))}
                    selected={slotStart === slot.startTime}
                    slot={slot}
                  />
                ))}
              </View>

              {/* The enquirer can send the pick as a message instead, beside the
                  button that books it (user, 2026-10-03). */}
              <View style={{ flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs }}>
                {enquirer && threadId ? (
                  <ActionButton
                    disabled={!picked || busy}
                    label="Send as text"
                    onPress={() => void sendAsText()}
                    variant="outline"
                  />
                ) : null}
                <ActionButton
                  disabled={!picked || busy}
                  label={busy ? "Saving" : moving ? "Reschedule" : "Schedule visit"}
                  onPress={() => setConfirming("book")}
                />
              </View>
            </>
          ) : null}

          {visit?.canCancel ? (
            <View style={{ flexDirection: "row" }}>
              <ActionButton
                disabled={busy}
                label="Cancel visit"
                onPress={() => setCancelling(true)}
                variant="dangerQuiet"
              />
            </View>
          ) : null}
        </>
      )}

      {confirming === "book" && picked ? (
        <ConfirmDialog
          bullets={
            moving && enquirer
              ? [left === 1 ? "This is your last reschedule." : `This uses one of your ${left} reschedules.`]
              : undefined
          }
          confirmLabel={moving ? "Reschedule" : "Schedule visit"}
          message={
            moving
              ? enquirer
                ? `Do you want to reschedule your visit to ${picked}?`
                : `Do you want to reschedule ${theirVisit} to ${picked}?`
              : enquirer
                ? `Do you want to schedule your visit on ${picked}?`
                : `Do you want to schedule a visit for ${name ?? "them"} on ${picked}?`
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => void book()}
          title={moving ? "Reschedule visit?" : "Schedule visit?"}
        />
      ) : null}

      {confirming === "cancel" && current && cancelAnswer ? (
        <ConfirmDialog
          bullets={
            cancelAnswer.stillInterested
              ? enquirer
                ? ["Your place in the slot is freed.", "You can book another visit while your enquiry is open."]
                : ["Their place in the slot is freed.", "They can book another visit while their enquiry is open."]
              : [
                  enquirer ? "Your place in the slot is freed." : "Their place in the slot is freed.",
                  notInterestedLine(enquirer, notInterestedCloses),
                ]
          }
          cancelLabel="Keep visit"
          confirmLabel="Cancel visit"
          destructive
          message={
            enquirer
              ? `Do you want to cancel your visit on ${current}?`
              : `Do you want to cancel ${theirVisit} on ${current}?`
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => void cancel()}
          title="Cancel this visit?"
        />
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
            // Square, borderless, on a grey fill; the picked day turns pale
            // blue like a chosen slot (user, 2026-10-02).
            style={{
              alignItems: "center",
              backgroundColor: picked ? colors.primarySoft : colors.neutralSoft,
              borderCurve: "continuous",
              borderRadius: radii.card,
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
        // Borderless: grey, and pale blue once chosen (user, 2026-10-02).
        backgroundColor: selected ? colors.primarySoft : colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
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
