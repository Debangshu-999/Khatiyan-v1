import { useState, type ComponentType } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ChevronRight, PhoneMissed, PhoneOff, ThumbsDown, ThumbsUp, type LucideProps } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { SegmentedChoice } from "@/components/segmented-choice";
import { SheetShell } from "@/components/sheet-shell";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import {
  useSettleEnquiryCallMutation,
  type EnquiryCallResult,
  type EnquiryDetail,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Accepted = "ACCEPTED_INTERESTED" | "ACCEPTED_NOT_INTERESTED";

/**
 * "Record response": how a call went, answered once the handler is back in the
 * app (owner's design, 2026-10-03).
 *
 * <p>Didn't respond and Rejected call save at once as a failed attempt. The two
 * accepted answers open a stacked sheet for the optional duration and note, and
 * for Interested whether to book a visit now. Either accepted answer is a
 * successful response, which is what opens Schedule visit.
 */
export function RecordResponseSheet({
  enquiry,
  onClose,
  onRecorded,
}: {
  /** Carries the call waiting for an answer in `callToSettleId`. */
  enquiry: EnquiryDetail;
  onClose: () => void;
  /** @param scheduleVisit the handler chose Yes to booking a visit now */
  onRecorded: (result: EnquiryCallResult, detail: EnquiryDetail, scheduleVisit: boolean) => void;
}) {
  const { colors, type } = useTheme();
  const [settle] = useSettleEnquiryCallMutation();
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const [saving, setSaving] = useState<EnquiryCallResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const call = enquiry.responses.find((response) => response.id === enquiry.callToSettleId) ?? null;
  const name = enquiry.enquirerName ?? "them";

  async function record(
    result: EnquiryCallResult,
    details: { durationSeconds: number | null; note: string | null; scheduleVisit: boolean },
  ) {
    if (saving || !enquiry.callToSettleId) {
      return;
    }
    setSaving(result);
    try {
      const detail = await settle({
        attemptId: enquiry.callToSettleId,
        callResult: result,
        durationSeconds: details.durationSeconds,
        enquiryId: enquiry.id,
        note: details.note,
        version: enquiry.version,
      }).unwrap();
      onRecorded(result, detail, details.scheduleVisit);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  // A refusal replaces the sheets. What it was answered against has changed,
  // so acknowledging it closes them and the card is read again.
  if (failure) {
    return <AlertModal message={failure} onClose={onClose} />;
  }

  return (
    <>
      <SheetShell onClose={onClose} title="Record response">
        <Text style={[type.modalDescription, { color: colors.muted }]}>
          {call ? `Your call to ${name} on ${formatCallTime(call.respondedAt)}` : `Your call to ${name}`}
        </Text>

        <ResultOption
          busy={saving === "NO_ANSWER"}
          icon={PhoneMissed}
          label="Didn't respond"
          onPress={() => void record("NO_ANSWER", { durationSeconds: null, note: null, scheduleVisit: false })}
          subtitle="Marked as a failed attempt"
        />
        <ResultOption
          busy={saving === "REJECTED"}
          icon={PhoneOff}
          label="Rejected call"
          onPress={() => void record("REJECTED", { durationSeconds: null, note: null, scheduleVisit: false })}
          subtitle="Marked as a failed attempt"
        />
        <ResultOption
          icon={ThumbsUp}
          label="Accepted: Interested"
          onPress={() => setAccepted("ACCEPTED_INTERESTED")}
          trailing
        />
        <ResultOption
          icon={ThumbsDown}
          label="Accepted: Not interested"
          onPress={() => setAccepted("ACCEPTED_NOT_INTERESTED")}
          // They took a Not interested back once already, so this one closes it.
          subtitle={enquiry.tenantChangedMindAt ? "Closes the enquiry. They changed their mind once already" : undefined}
          trailing
        />
      </SheetShell>

      {/* Stacked on the first sheet: back returns to the four answers, the X
          closes both. */}
      {accepted ? (
        <AcceptedCallSheet
          interested={accepted === "ACCEPTED_INTERESTED"}
          onBack={() => setAccepted(null)}
          onClose={onClose}
          onSave={(details) => void record(accepted, details)}
          saving={saving === accepted}
        />
      ) : null}
    </>
  );
}

function AcceptedCallSheet({
  interested,
  onBack,
  onClose,
  onSave,
  saving,
}: {
  interested: boolean;
  onBack: () => void;
  onClose: () => void;
  onSave: (details: { durationSeconds: number | null; note: string | null; scheduleVisit: boolean }) => void;
  saving: boolean;
}) {
  const { colors, type } = useTheme();
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [note, setNote] = useState("");
  const [visit, setVisit] = useState<"YES" | "NOT_YET" | null>(null);
  const [tried, setTried] = useState(false);

  const durationError = describeDurationError(hours, minutes, seconds);
  const visitError = interested && visit === null ? "Choose whether to schedule a visit." : null;

  function save() {
    setTried(true);
    if (durationError || visitError || saving) {
      return;
    }
    const total = Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
    const anyDuration = Boolean(hours || minutes || seconds);
    onSave({
      durationSeconds: anyDuration ? total : null,
      note: note.trim() || null,
      scheduleVisit: visit === "YES",
    });
  }

  return (
    <SheetShell
      onBack={onBack}
      onClose={onClose}
      title={interested ? "Accepted: Interested" : "Accepted: Not interested"}
    >
      <View style={{ gap: 6 }}>
        <Text style={[type.label, { color: durationError ? colors.danger : colors.muted }]}>
          Call duration (optional)
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DurationBox onChangeText={setHours} unit="hr" value={hours} />
          <DurationBox onChangeText={setMinutes} unit="min" value={minutes} />
          <DurationBox onChangeText={setSeconds} unit="sec" value={seconds} />
        </View>
        {durationError ? <Text style={[type.caption, { color: colors.danger }]}>{durationError}</Text> : null}
      </View>

      <FormInput
        label={interested ? "Talking points (optional)" : "What held them back? (optional)"}
        maxLength={500}
        multiline
        onChangeText={setNote}
        placeholder={interested ? "What you spoke about" : "Budget, location, timing"}
        value={note}
      />

      {interested ? (
        <View style={{ gap: 6 }}>
          <Text style={[type.label, { color: tried && visitError ? colors.danger : colors.muted }]}>
            Schedule a visit?
          </Text>
          <SegmentedChoice
            onChange={setVisit}
            options={[
              { label: "Yes", value: "YES" },
              { label: "Not yet", value: "NOT_YET" },
            ]}
            value={visit}
          />
          {tried && visitError ? <Text style={[type.caption, { color: colors.danger }]}>{visitError}</Text> : null}
        </View>
      ) : null}

      <ActionButton
        disabled={saving || Boolean(durationError) || (tried && Boolean(visitError))}
        label={saving ? "Saving" : "Save"}
        onPress={save}
      />
    </SheetShell>
  );
}

/** One box of the hr / min / sec row: two digits, the unit inside on the right. */
function DurationBox({ onChangeText, unit, value }: { onChangeText: (value: string) => void; unit: string; value: string }) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: focused ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        paddingHorizontal: spacing.md,
      }}
    >
      <AppTextInput
        accessibilityLabel={unit === "hr" ? "Hours" : unit === "min" ? "Minutes" : "Seconds"}
        keyboardType="number-pad"
        maxLength={2}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, ""))}
        onFocus={() => setFocused(true)}
        placeholder="0"
        placeholderTextColor={colors.kicker}
        style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 16, minHeight: 46, paddingVertical: 0 }}
        value={value}
      />
      <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13 }}>{unit}</Text>
    </View>
  );
}

function ResultOption({
  busy,
  icon: Icon,
  label,
  onPress,
  subtitle,
  trailing,
}: {
  busy?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  subtitle?: string;
  /** Opens a further step: a chevron on the right. */
  trailing?: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{label}</Text>
        {subtitle ? <Text style={[type.caption, { color: colors.kicker }]}>{subtitle}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : trailing ? (
        <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
      ) : null}
    </AnimatedPressable>
  );
}

/** Null when the three boxes make a real duration, or are all empty. */
function describeDurationError(hours: string, minutes: string, seconds: string) {
  if (Number(hours || 0) > 23) {
    return "Hours can be at most 23.";
  }
  if (Number(minutes || 0) > 59 || Number(seconds || 0) > 59) {
    return "Minutes and seconds can be at most 59.";
  }
  return null;
}

/** "3 Oct, 2:15 pm", in India time. */
export function formatCallTime(value: string) {
  const at = new Date(value);
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(at);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(at);
  return `${day}, ${time.toLowerCase()}`;
}

/** "Didn't respond", "Accepted, interested", for the action log. */
export function describeCallResult(result: EnquiryCallResult) {
  switch (result) {
    case "NO_ANSWER":
      return "Didn't respond";
    case "REJECTED":
      return "Rejected call";
    case "ACCEPTED_INTERESTED":
      return "Accepted, interested";
    case "ACCEPTED_NOT_INTERESTED":
      return "Accepted, not interested";
  }
}

/** "1h 5m 20s", "12m 30s", "45s". */
export function formatCallDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, seconds || (!hours && !minutes) ? `${seconds}s` : null];
  return parts.filter(Boolean).join(" ");
}
