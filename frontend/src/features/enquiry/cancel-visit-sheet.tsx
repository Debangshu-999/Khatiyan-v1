import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";

import { SegmentedChoice } from "@/components/segmented-choice";
import { SheetShell } from "@/components/sheet-shell";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type CancelVisitAnswer = { reason: string; stillInterested: boolean };

/**
 * Cancelling a visit, stacked on Manage visit (owner's design, 2026-10-03).
 * Asks whether they are still interested, and why, both required.
 *
 * <p>Interested: reschedule is offered first, and cancelling anyway keeps the
 * enquiry Interested. Not interested: the enquiry is marked so and closes by
 * itself in 7 days.
 */
export function CancelVisitSheet({
  canReschedule,
  enquirer,
  onBack,
  onClose,
  onReschedule,
  onSubmit,
}: {
  /** The visit can still be moved, so "Reschedule instead" is worth offering. */
  canReschedule: boolean;
  /** The enquirer is cancelling their own visit: "Are you still interested?". */
  enquirer: boolean;
  onBack: () => void;
  onClose: () => void;
  /** Back to the slots, to move the visit instead. */
  onReschedule: () => void;
  onSubmit: (answer: CancelVisitAnswer) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [interest, setInterest] = useState<"YES" | "NO" | null>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const interestError = interest === null ? "Choose one." : null;
  const reasonError = reason.trim() ? null : "Give a reason for cancelling.";

  function submit() {
    setTried(true);
    if (interestError || reasonError) {
      return;
    }
    onSubmit({ reason: reason.trim(), stillInterested: interest === "YES" });
  }

  return (
    <SheetShell onBack={onBack} onClose={onClose} title="Cancel visit">
      <View style={{ gap: 6 }}>
        <Text style={[type.label, { color: tried && interestError ? colors.danger : colors.muted }]}>
          {enquirer ? "Are you still interested?" : "Are they still interested?"}
        </Text>
        <SegmentedChoice
          onChange={setInterest}
          options={[
            { label: "Interested", value: "YES" },
            { label: "Not interested", value: "NO" },
          ]}
          value={interest}
        />
        {tried && interestError ? <Text style={[type.caption, { color: colors.danger }]}>{interestError}</Text> : null}
      </View>

      {/* Still interested: moving it is offered before cancelling it. */}
      {interest === "YES" ? (
        <View
          style={{
            backgroundColor: colors.neutralSoft,
            borderCurve: "continuous",
            borderRadius: radii.card,
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          <Text style={[type.description, { color: colors.ink, fontFamily: fonts.sansSemiBold }]}>
            You can reschedule instead of cancelling.
          </Text>
          {canReschedule ? (
            <ActionButton compact icon={CalendarClock} label="Reschedule instead" onPress={onReschedule} variant="secondary" />
          ) : null}
        </View>
      ) : null}

      {interest === "NO" ? (
        <Text style={[type.description, { color: colors.danger }]}>
          {enquirer
            ? "Your enquiry will be marked not interested and close by itself in 7 days."
            : "Their enquiry will be marked not interested and close by itself in 7 days."}
        </Text>
      ) : null}

      <View style={{ gap: 6 }}>
        <FormInput
          error={tried && reasonError ? reasonError : undefined}
          label="Reason for cancelling"
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder={enquirer ? "Exams that week" : "Room no longer free"}
          required
          value={reason}
        />
      </View>

      <ActionButton label="Cancel visit" onPress={submit} variant="dangerFilled" />
    </SheetShell>
  );
}
