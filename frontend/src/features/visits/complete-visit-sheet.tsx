import { useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CircleHelp, Clock } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { clockTime } from "@/features/enquiry/enquiry-tags";
import { formatSlotTime } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { minutesToTime, timeToMinutes } from "@/features/visits/visit-clock";
import {
  useCompleteVisitFormMutation,
  type VisitCard,
  type VisitImpression,
} from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const IMPRESSIONS: { label: string; value: VisitImpression }[] = [
  { label: "Liked it", value: "LIKED" },
  { label: "Okay with it", value: "OKAY" },
  { label: "Did not like it", value: "DISLIKED" },
];

const MAX_PEOPLE = 20;
const FIELD_HEIGHT = 50;
const HINT_WIDTH = 230;

/**
 * The visit form (user, 2026-10-04), for whoever checked the visitor in or
 * the owner. Arrival and on time or late came from the check-in itself, and
 * are said in chips at the top. This adds when they left, how many came, and
 * what they made of the property.
 *
 * <p>None of it has to be filled. How many came and what they made of it can
 * be left unset, and are then not shown on the card. A time they left that is
 * never given becomes the end of their slot overnight, so the field starts
 * empty with the slot's end as its placeholder.
 */
export function CompleteVisitSheet({ onClose, visit }: { onClose: () => void; visit: VisitCard }) {
  const { colors, fonts } = useTheme();
  const toast = useToast();
  const [save, saveState] = useCompleteVisitFormMutation();
  // Unset until someone picks it: left alone, it is the slot's end.
  const [departed, setDeparted] = useState<number | null>(() =>
    visit.departedAt ? timeToMinutes(visit.departedAt) : null,
  );
  // Digits as typed. Empty is "not recorded": it is optional.
  const [people, setPeople] = useState(visit.partySize ? String(visit.partySize) : "");
  const [peopleError, setPeopleError] = useState<string | undefined>();
  const [impression, setImpression] = useState<VisitImpression | null>(visit.impression);
  const [refusal, setRefusal] = useState<string | null>(null);

  // The server refuses a form with nothing on it, so there is nothing to save yet.
  const nothingFilled = departed === null && people === "" && impression === null;

  async function submit() {
    if (saveState.isLoading || nothingFilled) {
      return;
    }
    const partySize = people === "" ? null : Number(people);
    if (partySize !== null && (partySize < 1 || partySize > MAX_PEOPLE)) {
      setPeopleError(`Enter 1 to ${MAX_PEOPLE}`);
      return;
    }
    try {
      await save({
        departedAt: departed === null ? null : minutesToTime(departed),
        impression,
        partySize,
        visitId: visit.visitId,
      }).unwrap();
      toast.success("Visit saved.");
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  return (
    <SheetShell onClose={onClose} title="Complete visit">
      <ArrivalChips visit={visit} />

      {/* The blue notice, the app's own way of explaining (user, 2026-10-04). */}
      <NoticeBar
        message="Left at is taken as the slot end time unless mentioned otherwise. Anything left out is not recorded."
        title="Fill in visit details"
        tone="info"
      />

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <FieldLabel text="Left at" />
          <LeftAtField onChange={setDeparted} slotEnd={visit.slotEnd} value={departed} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <FieldLabel text="Individuals" />
            <IndividualsHint />
          </View>
          <AppTextInput
            accessibilityLabel="Individuals, the number of people who came together for this visit"
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(text) => {
              setPeople(text.replace(/\D/g, ""));
              setPeopleError(undefined);
            }}
            placeholder="Optional"
            placeholderTextColor={colors.kicker}
            style={{
              backgroundColor: colors.surface,
              borderColor: peopleError ? colors.danger : colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1.5,
              color: colors.ink,
              fontFamily: fonts.sansMedium,
              fontSize: 15,
              minHeight: FIELD_HEIGHT,
              paddingHorizontal: spacing.md,
              paddingVertical: 0,
              textAlignVertical: "center",
            }}
            value={people}
          />
          <FieldError message={peopleError} />
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <FieldLabel text="Did they like the property?" />
        <View style={{ gap: spacing.xs }}>
          {IMPRESSIONS.map((option) => {
            const selected = option.value === impression;
            return (
              <AnimatedPressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option.value}
                // A second tap takes the answer back: it is optional.
                onPress={() => setImpression(selected ? null : option.value)}
                style={{
                  // Grey, and pale blue once chosen: the picker rows' own treatment.
                  backgroundColor: selected ? colors.primarySoft : colors.neutralSoft,
                  borderCurve: "continuous",
                  borderRadius: radii.card,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                }}
              >
                <Text style={{ color: colors.ink, fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 15 }}>
                  {option.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      <ActionButton
        disabled={nothingFilled || saveState.isLoading}
        label={saveState.isLoading ? "Saving" : "Save"}
        onPress={() => void submit()}
      />

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </SheetShell>
  );
}

function FieldLabel({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{text}</Text>;
}

/**
 * What the check-in itself recorded, in two chips (user, 2026-10-04): when
 * they arrived, with a filled green tick, and on time or late, with a filled
 * clock.
 * Late is amber, the colour it has on the visit's card. A visit the owner
 * marked after the slot has no arrival time, and says so in one grey chip.
 */
function ArrivalChips({ visit }: { visit: VisitCard }) {
  const { colors } = useTheme();

  if (visit.checkInMethod === "OWNER" || !visit.checkedInAt) {
    return (
      <View style={{ flexDirection: "row" }}>
        <Chip background={colors.neutralSoft} color={colors.neutralText} label="Marked after the slot" />
      </View>
    );
  }

  const late = visit.late === true;
  const tone = late ? colors.warningText : colors.successText;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
      <Chip
        background={colors.successSoft}
        color={colors.successText}
        icon={<Ionicons color={colors.successText} name="checkmark-circle" size={16} />}
        label={`Arrived at ${clockTime(visit.checkedInAt)}`}
      />
      <Chip
        background={late ? colors.warningSoft : colors.successSoft}
        color={tone}
        // Filled, like the tick beside it (user, 2026-10-04).
        icon={<Ionicons color={tone} name="time" size={16} />}
        label={late ? "Late" : "On time"}
      />
    </View>
  );
}

function Chip({
  background,
  color,
  icon,
  label,
}: {
  background: string;
  color: string;
  icon?: ReactNode;
  label: string;
}) {
  const { fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: background,
        borderRadius: 999,
        flexDirection: "row",
        gap: 5,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      {icon}
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/**
 * When they left, picked on the platform's own clock. Empty until someone
 * picks it, showing the slot's end in grey: that is what the visit takes if
 * nobody says otherwise.
 */
function LeftAtField({
  onChange,
  slotEnd,
  value,
}: {
  onChange: (minutes: number) => void;
  slotEnd: string;
  value: number | null;
}) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  // The picker needs a time to start from: the chosen one, or the slot's end.
  const startFrom = value ?? timeToMinutes(slotEnd);
  const pickerValue = new Date(2000, 0, 1, Math.floor(startFrom / 60), startFrom % 60);

  function onPick(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !selected) {
      return;
    }
    onChange(selected.getHours() * 60 + selected.getMinutes());
  }

  return (
    <>
      <Pressable
        accessibilityLabel={
          value === null
            ? `Left at, not set, taken as ${formatSlotTime(slotEnd)}`
            : `Left at, ${formatSlotTime(minutesToTime(value))}`
        }
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.xs,
          minHeight: FIELD_HEIGHT,
          paddingHorizontal: spacing.md,
        }}
      >
        <Clock color={colors.kicker} size={16} strokeWidth={2.2} />
        <Text
          style={{
            color: value === null ? colors.kicker : colors.ink,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
          }}
        >
          {formatSlotTime(value === null ? slotEnd : minutesToTime(value))}
        </Text>
      </Pressable>
      {open ? <DateTimePicker mode="time" onChange={onPick} value={pickerValue} /> : null}
    </>
  );
}

/**
 * The "?" beside Individuals. Tapping it floats a small card under it saying
 * what the word means here (user, 2026-10-04), and a tap anywhere puts it away.
 *
 * <p>In a window of its own, the way a chart's dropdown opens: inside the
 * sheet's scroll it would be drawn under the rows below it.
 */
function IndividualsHint() {
  const { colors, fonts } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const close = () => setAnchor(null);
  const open = () =>
    trigger.current?.measureInWindow((x, y, width, height) => {
      // Centred under the "?", and kept inside the screen's own margins.
      const left = Math.min(
        Math.max(spacing.md, x + width / 2 - HINT_WIDTH / 2),
        windowWidth - HINT_WIDTH - spacing.md,
      );
      setAnchor({ left, top: y + height + spacing.xs });
    });

  return (
    <>
      {/* collapsable={false} so Android keeps a real view here to measure. */}
      <View collapsable={false} ref={trigger}>
        <AnimatedPressable
          accessibilityLabel="What Individuals means"
          accessibilityRole="button"
          hitSlop={10}
          onPress={open}
        >
          <CircleHelp color={colors.muted} size={15} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>
      {anchor ? (
        <Modal animationType="fade" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible>
          {/* A sibling behind the card, never its parent. */}
          <Pressable
            accessibilityLabel="Close"
            onPress={close}
            style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
          />
          <View
            pointerEvents="none"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 6,
              left: anchor.left,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              position: "absolute",
              shadowColor: "#000000",
              shadowOffset: { height: 6, width: 0 },
              shadowOpacity: 0.14,
              shadowRadius: 14,
              top: anchor.top,
              width: HINT_WIDTH,
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 }}>
              Number of people who came together for this visit.
            </Text>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
