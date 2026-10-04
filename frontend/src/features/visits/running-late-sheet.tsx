import { useState } from "react";
import { Text, View } from "react-native";
import { ClockAlert } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { GhostBlock, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { formatSlotTime, formatSpotsLeft } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import {
  useGetVisitMoveOptionsQuery,
  useMarkRunningLateMutation,
  useRescheduleVisitMutation,
  type MyVisit,
} from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Running late (user, 2026-10-04): half the visitor's slot has gone and
 * nobody has checked them in. They can move to a later slot the same day at no
 * cost, or say they are on their way.
 *
 * <p>Reschedule is always under the slots: another day is theirs to pick
 * whether or not a slot is left today, and it uses one of their two
 * reschedules. When none is left, the button says why instead of opening.
 *
 * <p>What is on offer is the server's: this draws the slots it is given.
 */
export function RunningLateSheet({
  onClose,
  onReschedule,
  visit,
}: {
  /** The sheet's close. "I'm on my way" tells the property first, then closes too. */
  onClose: () => void;
  /** Open the visit sheet to pick another day. */
  onReschedule: () => void;
  visit: MyVisit;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const options = useGetVisitMoveOptionsQuery(visit.visitId, { refetchOnMountOrArgChange: true });
  const [reschedule, rescheduleState] = useRescheduleVisitMutation();
  const [sayOnMyWay, onMyWayState] = useMarkRunningLateMutation();
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const todaySlots = options.data?.days.find((day) => day.date === visit.date)?.slots ?? [];
  const noSlotToday = !options.isLoading && todaySlots.length === 0;

  /**
   * "I'm on my way" (user, 2026-10-04): the owner and every manager are told,
   * once. Said already, it only closes the sheet.
   */
  async function onMyWay() {
    if (visit.runningLateAt) {
      onClose();
      return;
    }
    try {
      await sayOnMyWay(visit.visitId).unwrap();
      toast.success("The property knows you are on your way.");
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  async function move() {
    if (!slotStart || rescheduleState.isLoading) {
      return;
    }
    try {
      await reschedule({ date: visit.date, slotStart, version: visit.version, visitId: visit.visitId }).unwrap();
      toast.success(`Visit moved to ${formatSlotTime(slotStart)} today.`);
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
      // Usually a slot that filled a moment ago. Show what is left now.
      setSlotStart(null);
      void options.refetch();
    }
  }

  /** Another day, unless both of their reschedules are used: then why not, in the server's words. */
  function anotherDay() {
    const refused = options.data?.anotherDayRefusal;
    if (refused) {
      setRefusal(refused);
      return;
    }
    onReschedule();
  }

  return (
    <SheetShell onClose={onClose} title="Running late?">
      {/* The yellow notice, the app's own way of saying take care (user, 2026-10-04). */}
      <NoticeBar
        icon={ClockAlert}
        message={
          noSlotToday
            ? options.data?.refusal ??
              "No slot is left today. Reschedule to another day. It uses one of your two reschedules."
            : "Move to a later slot today at no cost. Rescheduling to another day uses one of your two reschedules."
        }
        title={`Your ${formatSlotTime(visit.slotStart)} slot is under way`}
        tone="warning"
      />

      {options.isLoading ? (
        <SkeletonBoundary>
          <GhostBlock height={52}>
            <View style={{ height: 52 }} />
          </GhostBlock>
        </SkeletonBoundary>
      ) : todaySlots.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {todaySlots.map((slot) => {
            const selected = slot.startTime === slotStart;
            return (
              <AnimatedPressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={slot.startTime}
                // A second tap unpicks it, as on the visit sheet.
                onPress={() => setSlotStart(selected ? null : slot.startTime)}
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? colors.primarySoft : colors.neutralSoft,
                  borderCurve: "continuous",
                  borderRadius: radii.card,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                }}
              >
                <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15 }}>
                  {formatSlotTime(slot.startTime)} to {formatSlotTime(slot.endTime)}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]}>{formatSpotsLeft(slot.spotsLeft)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}

      {/* Always here, under the slots (user, 2026-10-04). */}
      <ActionButton disabled={options.isLoading} label="Reschedule" onPress={anotherDay} variant="primaryQuiet" />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          {/* The soft edge, not the ink outline (user, 2026-10-04). */}
          <ActionButton
            disabled={onMyWayState.isLoading}
            label={onMyWayState.isLoading ? "Telling them" : "I'm on my way"}
            onPress={() => void onMyWay()}
            variant="secondary"
          />
        </View>
        {noSlotToday ? null : (
          <View style={{ flex: 1 }}>
            <ActionButton
              disabled={!slotStart || rescheduleState.isLoading}
              label={rescheduleState.isLoading ? "Moving" : "Move visit"}
              onPress={() => void move()}
            />
          </View>
        )}
      </View>

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </SheetShell>
  );
}
