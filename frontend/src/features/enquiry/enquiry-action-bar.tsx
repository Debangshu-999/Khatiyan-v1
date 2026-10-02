import { useState, type ComponentType } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  MessageSquareOff,
  Smile,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { CenterModal } from "@/components/center-modal";
import { useToast } from "@/components/toast";
import { VisitSheet } from "@/features/enquiry/visit-sheet";
import { formatVisitDay, formatVisitWhen } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import {
  useEndEnquiryConversationMutation,
  useSetEnquirySentimentMutation,
  type EnquiryChatActions,
  type EnquirySentiment,
} from "@/store/services/enquiry-chat-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
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
export function EnquiryActionBar({ actions }: { actions: EnquiryChatActions }) {
  const { colors } = useTheme();
  const toast = useToast();
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
      await endConversation({ enquiryId: actions.enquiryId, version: actions.enquiryVersion }).unwrap();
      toast.success("Conversation ended.");
    } catch (error) {
      setNotice({ message: errorMessage(error), tone: "error" });
    }
  }

  return (
    <View
      style={{
        backgroundColor: colors.chatSurface,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
      }}
    >
      {showsSentiment ? (
        <BarPill
          icon={sentiment === "INTERESTED" ? ThumbsUp : sentiment === "NOT_INTERESTED" ? ThumbsDown : Smile}
          label={
            sentiment === "INTERESTED"
              ? "Interested"
              : sentiment === "NOT_INTERESTED"
                ? "Not interested"
                : "Enquiry sentiment?"
          }
          onPress={actions.canSetSentiment ? () => setSentimentOpen(true) : undefined}
        />
      ) : null}

      {actions.canScheduleVisit ? (
        <BarPill icon={CalendarPlus} label="Schedule visit" onPress={() => setVisitOpen(true)} />
      ) : null}

      {visit ? (
        <BarPill
          icon={CalendarCheck}
          label={
            visit.missed
              ? `Visit missed: ${formatVisitDay(visit.date)}`
              : `Scheduled: ${formatVisitWhen(visit.date, visit.slotStart)}`
          }
          onPress={() =>
            visit.canReschedule
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
          label="End conversation"
          onPress={() => setConfirmEnd(true)}
        />
      ) : null}

      {sentimentOpen ? (
        <SentimentModal actions={actions} onClose={() => setSentimentOpen(false)} />
      ) : null}

      {visitOpen ? (
        <VisitSheet
          enquiryId={actions.enquiryId}
          onClose={() => setVisitOpen(false)}
          propertyId={actions.propertyId}
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

/**
 * One action on the bar: outlined, never filled, so the bar reads as a set of
 * options beside the message box and not as a second send button.
 */
function BarPill({
  busy = false,
  icon: Icon,
  label,
  onPress,
}: {
  busy?: boolean;
  icon: ComponentType<LucideProps>;
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
        borderColor: quiet ? colors.borderStrong : colors.ink,
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
        <Icon color={tint} size={14} strokeWidth={2.2} />
      )}
      <Text style={{ color: tint, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{label}</Text>
    </AnimatedPressable>
  );
}

/**
 * The handler's reading of the enquirer: interested or not.
 *
 * <p>A centred modal, closed by its cross or by choosing. The backdrop does
 * nothing, as with every centred modal in the app.
 */
function SentimentModal({ actions, onClose }: { actions: EnquiryChatActions; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const [setSentiment, state] = useSetEnquirySentimentMutation();
  const [choosing, setChoosing] = useState<EnquirySentiment | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function choose(sentiment: EnquirySentiment) {
    if (state.isLoading) {
      return;
    }
    // Choosing what is already chosen changes nothing, so it just closes.
    if (sentiment === actions.sentiment) {
      onClose();
      return;
    }
    setChoosing(sentiment);
    try {
      await setSentiment({
        enquiryId: actions.enquiryId,
        sentiment,
        version: actions.enquiryVersion,
      }).unwrap();
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

  return (
    <CenterModal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "space-between",
              marginBottom: spacing.xs,
            }}
          >
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20 }}>
              Enquiry sentiment
            </Text>
            <AnimatedPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceSunken,
                borderRadius: 999,
                height: 32,
                justifyContent: "center",
                width: 32,
              }}
            >
              <X color={colors.ink} size={16} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

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
        </View>
      </View>
    </CenterModal>
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
        borderColor: selected ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: selected ? 1.5 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 }}>{label}</Text>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : selected ? (
        <Check color={colors.primary} size={18} strokeWidth={2.6} />
      ) : null}
    </AnimatedPressable>
  );
}
