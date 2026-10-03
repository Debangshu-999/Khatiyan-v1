import { useState } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, CalendarClock } from "lucide-react-native";

import { SegmentedChoice } from "@/components/segmented-choice";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type CancelVisitAnswer = { reason: string; stillInterested: boolean };

/**
 * Cancelling a visit: the body of Manage visit's second step, drawn on the
 * same sheet rather than stacked on it (user, 2026-10-03). The sheet supplies
 * the title, the back arrow and the X. Asks whether they are still
 * interested, and why, both required.
 *
 * <p>Interested: reschedule is offered first, and cancelling anyway keeps the
 * enquiry Interested. Not interested: the enquiry is marked so and closes by
 * itself in 7 days, or at once when the enquirer has already changed their
 * mind once.
 */
export function CancelVisitForm({
  canReschedule,
  enquirer,
  notInterestedCloses,
  onReschedule,
  onSubmit,
}: {
  /** The visit can still be moved, so "Reschedule instead" is worth offering. */
  canReschedule: boolean;
  /** The enquirer is cancelling their own visit: "Are you still interested?". */
  enquirer: boolean;
  /** A second Not interested: the enquiry closes at once instead of in 7 days. */
  notInterestedCloses: boolean;
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
    <>
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

      {/* A red warning icon before the line (user, 2026-10-03). */}
      {interest === "NO" ? (
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <AlertTriangle color={colors.danger} size={16} strokeWidth={2.2} style={{ marginTop: 2 }} />
          <Text style={[type.description, { color: colors.danger, flex: 1 }]}>
            {notInterestedLine(enquirer, notInterestedCloses)}
          </Text>
        </View>
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
    </>
  );
}

/** What Not interested does to the enquiry, in the words both steps use. */
export function notInterestedLine(enquirer: boolean, closesNow: boolean): string {
  const whose = enquirer ? "Your" : "Their";
  return closesNow
    ? `${whose} enquiry will be marked not interested and closed.`
    : `${whose} enquiry will be marked not interested and close by itself in 7 days.`;
}
