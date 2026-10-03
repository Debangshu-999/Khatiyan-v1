import { useState, type ComponentType } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  CalendarCheck,
  CalendarPlus,
  CircleHelp,
  MessageSquareOff,
  Smile,
  ThumbsDown,
  ThumbsUp,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { SuccessTick } from "@/components/success-tick";
import { VisitSheet } from "@/features/enquiry/visit-sheet";
import { formatVisitDay, formatVisitWhen } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import {
  useClearEnquirySentimentMutation,
  useEndEnquiryConversationMutation,
  useSetEnquirySentimentMutation,
  type EnquiryChatActions,
  type EnquirySentiment,
} from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The strip of actions above an enquiry chat's message box.
 *
 * <p>The handler's side, once the enquirer has replied: their reading of the
 * enquirer, then either a visit to schedule or the conversation to end. The
 * enquirer's side: a visit to schedule. Both sides see a booked visit and can
 * move it from here.
 *
 * <p>It draws what the server says is possible and decides nothing itself.
 * Renders nothing at all when there is nothing to offer, so a chat that has no
 * actions keeps its full height.
 */
export function EnquiryActionBar({
  actions,
  counterpartName,
  threadId,
}: {
  actions: EnquiryChatActions;
  /** The other person in the chat: the enquirer, for management. Named in confirmations. */
  counterpartName?: string | null;
  /** This chat, so the enquirer can send a visit pick as a message. */
  threadId?: string | null;
}) {
  const { colors } = useTheme();
  const [endConversation, endState] = useEndEnquiryConversationMutation();
  const [sentimentOpen, setSentimentOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "info" } | null>(null);

  const { sentiment, visit } = actions;
  const management = actions.viewer !== "ENQUIRER";
  // The handler's reading is shown to management only. The server never sends
  // it to the enquirer, so this is the second of two locks, not the only one.
  const showsSentiment = management && (actions.canSetSentiment || sentiment !== null);

  if (actions.ended || !actions.answered) {
    return null;
  }
  if (!showsSentiment && !actions.canScheduleVisit && !actions.canEndConversation && !visit) {
    return null;
  }

  async function end() {
    setConfirmEnd(false);
    try {
      // No toast (user, 2026-10-02): the chat closing is the confirmation.
      await endConversation({ enquiryId: actions.enquiryId, version: actions.enquiryVersion }).unwrap();
    } catch (error) {
      setNotice({ message: errorMessage(error), tone: "error" });
    }
  }

  // A visit still to happen fixes the reading in place (user, 2026-10-03).
  // Changing it then would do nothing, so the pill only states it.
  const sentimentLocked = Boolean(visit?.upcoming);

  return (
    <View style={{ backgroundColor: colors.chatSurface }}>
      {/* One row that slides sideways (user, 2026-10-03). Wrapping onto a
          second line pushed the message box up and took space from the chat. */}
      <ScrollView
        contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md }}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, paddingTop: spacing.sm }}
      >
        {showsSentiment ? (
          // Undecided reads as a question on a grey fill; a decision shows its
          // thumb in a faded green or red (user, 2026-10-02). "Not decided" in
          // the sheet takes it back to the question.
          <BarPill
            filled={sentiment === null}
            icon={sentiment === "INTERESTED" ? ThumbsUp : sentiment === "NOT_INTERESTED" ? ThumbsDown : Smile}
            iconColor={sentiment === "INTERESTED" ? colors.jade : sentiment === "NOT_INTERESTED" ? colors.danger : undefined}
            label={
              sentiment === "INTERESTED"
                ? "Interested"
                : sentiment === "NOT_INTERESTED"
                  ? "Not interested"
                  : "Are they interested?"
            }
            onPress={actions.canSetSentiment && !sentimentLocked ? () => setSentimentOpen(true) : undefined}
          />
        ) : null}

        {actions.canScheduleVisit ? (
          <BarPill icon={CalendarPlus} label="Schedule visit" onPress={() => setVisitOpen(true)} />
        ) : null}

        {visit ? (
          <BarPill
            icon={CalendarCheck}
            iconColor={visit.missed ? undefined : colors.jade}
            label={
              visit.missed
                ? `Visit missed: ${formatVisitDay(visit.date)}`
                : `Scheduled: ${formatVisitWhen(visit.date, visit.slotStart)}`
            }
            onPress={() =>
              visit.canReschedule || visit.canCancel
                ? setVisitOpen(true)
                : setNotice({
                    message: visit.rescheduleRefusal ?? "This visit can no longer be moved.",
                    tone: "info",
                  })
            }
          />
        ) : null}

        {actions.canEndConversation ? (
          <BarPill
            busy={endState.isLoading}
            icon={MessageSquareOff}
            label="End"
            onPress={() => setConfirmEnd(true)}
          />
        ) : null}
      </ScrollView>

      {sentimentOpen ? (
        <SentimentModal actions={actions} onClose={() => setSentimentOpen(false)} />
      ) : null}

      {visitOpen ? (
        <VisitSheet
          enquiryId={actions.enquiryId}
          onClose={() => setVisitOpen(false)}
          personName={counterpartName}
          propertyId={actions.propertyId}
          threadId={threadId}
          viewer={actions.viewer}
          visit={visit}
        />
      ) : null}

      {confirmEnd ? (
        <ConfirmDialog
          bullets={[
            "The chat closes for both of you.",
            "The enquiry ends now.",
            "They can enquire again later.",
          ]}
          confirmLabel="End conversation"
          destructive
          message="This cannot be undone."
          onCancel={() => setConfirmEnd(false)}
          onConfirm={() => void end()}
          title="End this conversation?"
        />
      ) : null}

      {notice ? (
        <AlertModal message={notice.message} onClose={() => setNotice(null)} tone={notice.tone} />
      ) : null}
    </View>
  );
}

/** Status tints on the bar are softened a touch, so they read as state, not alarm. */
const STATUS_ICON_OPACITY = 0.75;

/**
 * One action on the bar: a grey outline (user, 2026-10-02; it was black), so
 * the bar reads as a set of options beside the message box and not as a
 * second send button.
 *
 * @param filled    a grey fill, for a question still open ("Are they interested?").
 * @param iconColor a status colour for the glyph, shown slightly faded.
 */
function BarPill({
  busy = false,
  filled = false,
  icon: Icon,
  iconColor,
  label,
  onPress,
}: {
  busy?: boolean;
  filled?: boolean;
  icon: ComponentType<LucideProps>;
  iconColor?: string;
  label: string;
  /** Left out for a pill that only states something, such as a sentiment another manager set. */
  onPress?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const quiet = !onPress;
  const tint = quiet ? colors.muted : colors.ink;

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole={quiet ? "text" : "button"}
      disabled={quiet || busy}
      hitSlop={4}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: filled ? colors.neutralSoft : "transparent",
        borderColor: colors.borderStrong,
        borderRadius: radii.pill,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 7,
      }}
    >
      {busy ? (
        <ActivityIndicator color={tint} size="small" />
      ) : (
        <Icon
          color={iconColor ?? tint}
          size={14}
          strokeWidth={2.2}
          style={iconColor ? { opacity: STATUS_ICON_OPACITY } : undefined}
        />
      )}
      <Text numberOfLines={1} style={{ color: tint, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** What a pick does: set a reading, or take it back to undecided. */
type SentimentChoice = EnquirySentiment | "UNDECIDED";

/**
 * The handler's reading of the enquirer: interested or not.
 *
 * <p>A bottom sheet (user, 2026-10-02). Options are grey cards with no
 * outline; the chosen one carries the green tick on its right. Once a reading
 * is set, "Not decided" joins them to clear it, and with it the Schedule visit
 * or End conversation it had offered.
 */
function SentimentModal({ actions, onClose }: { actions: EnquiryChatActions; onClose: () => void }) {
  const [setSentiment, setState] = useSetEnquirySentimentMutation();
  const [clearSentiment, clearState] = useClearEnquirySentimentMutation();
  const [choosing, setChoosing] = useState<SentimentChoice | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // They took a Not interested back once already, so this one closes the
  // enquiry (owner's design, 2026-10-03). Asked first.
  const [confirmingClose, setConfirmingClose] = useState(false);
  const busy = setState.isLoading || clearState.isLoading;

  async function choose(choice: SentimentChoice, confirmed = false) {
    if (busy) {
      return;
    }
    if (choice === "NOT_INTERESTED" && actions.notInterestedCloses && !confirmed) {
      setConfirmingClose(true);
      return;
    }
    setConfirmingClose(false);
    // Choosing what is already chosen changes nothing, so it just closes.
    if (choice === (actions.sentiment ?? "UNDECIDED")) {
      onClose();
      return;
    }
    setChoosing(choice);
    try {
      if (choice === "UNDECIDED") {
        await clearSentiment({ enquiryId: actions.enquiryId, version: actions.enquiryVersion }).unwrap();
      } else {
        await setSentiment({ enquiryId: actions.enquiryId, sentiment: choice, version: actions.enquiryVersion }).unwrap();
      }
      onClose();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setChoosing(null);
    }
  }

  // A refusal replaces the picker. What it was chosen against has changed, so
  // acknowledging it closes both and the bar is read again.
  if (failure) {
    return <AlertModal message={failure} onClose={onClose} />;
  }

  if (confirmingClose) {
    return (
      <ConfirmDialog
        confirmLabel="Close enquiry"
        destructive
        message="They changed their mind once already, so marking them not interested closes this enquiry and its chat."
        onCancel={() => setConfirmingClose(false)}
        onConfirm={() => void choose("NOT_INTERESTED", true)}
        title="Close this enquiry?"
      />
    );
  }

  return (
    <SheetShell onClose={onClose} title="Enquiry sentiment">
      <SentimentOption
        busy={choosing === "INTERESTED"}
        icon={ThumbsUp}
        label="Interested"
        onPress={() => void choose("INTERESTED")}
        selected={actions.sentiment === "INTERESTED"}
      />
      <SentimentOption
        busy={choosing === "NOT_INTERESTED"}
        icon={ThumbsDown}
        label="Not interested"
        onPress={() => void choose("NOT_INTERESTED")}
        selected={actions.sentiment === "NOT_INTERESTED"}
      />
      {actions.sentiment ? (
        <SentimentOption
          busy={choosing === "UNDECIDED"}
          icon={CircleHelp}
          label="Not decided"
          onPress={() => void choose("UNDECIDED")}
          selected={false}
        />
      ) : null}
    </SheetShell>
  );
}

function SentimentOption({
  busy,
  icon: Icon,
  label,
  onPress,
  selected,
}: {
  busy: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 }}>{label}</Text>
      {busy ? <ActivityIndicator color={colors.primary} size="small" /> : selected ? <SuccessTick /> : null}
    </AnimatedPressable>
  );
}
