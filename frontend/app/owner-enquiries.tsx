import { useEffect, useMemo, useState } from "react";
import { Linking, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { CalendarPlus, History, Mail, MessageSquare, Phone, User } from "lucide-react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { openDialer } from "@/lib/dial";

import { ListEnd } from "@/components/list-end";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { CountTabPills } from "@/components/filter-bubbles";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { OwnerEnquiryListSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { VisitSheet } from "@/features/enquiry/visit-sheet";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useListPropertyEnquiriesQuery,
  useRespondToEnquiryMutation,
  type EnquiryDetail,
  type EnquiryResponseChannel,
} from "@/store/services/enquiry-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The screen's empty state. It used to be the header artwork, with a borrowed
// concerns illustration for the empty state.
// Shared with the Property workspace card so both entry point and empty state
// use the same enquiries visual language.
const ENQUIRIES_ILLUSTRATION = require("../assets/empty-states/enquiries.png");

/**
 * All: enquiries nobody handles yet. Mine: the ones the viewer handles. An
 * enquiry leaves All the moment it gets a handler (user, 2026-10-02).
 */
type EnquiryTab = "all" | "mine";

const PAGE_SIZE = 6;

/** How close to the bottom counts as "show me more". Matches the alert feeds. */
const LOAD_MORE_THRESHOLD_PX = 240;

export default function OwnerEnquiriesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);

  // No per-resource gate. The backend guards this module with the standing
  // `ensureCanManageProperty` chokepoint, so any manager of the property may
  // answer — and a screen that hid the button would be claiming a restriction
  // the server does not enforce. A ManagerResource lands here when the module
  // is converted, alongside the backend check.

  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const [tab, setTab] = useState<EnquiryTab>("all");
  // Pages the RENDER, not the fetch — the list arrives as one payload. Same
  // shape as the notifications feed so both lists end the same way.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [responding, setResponding] = useState<EnquiryDetail | null>(null);
  const [viewingLog, setViewingLog] = useState<EnquiryDetail | null>(null);
  const [scheduling, setScheduling] = useState<EnquiryDetail | null>(null);

  /**
   * The conversation to open once the respond sheet has actually gone.
   *
   * <p>The sheet used to navigate to the chat itself, from inside its own
   * modal. On Android a modal is a separate native window, so pushing a screen
   * while one is still up puts that screen behind it — the sheet closes and the
   * app is left where it started, which is the "reply over chat does nothing"
   * report. Closing and pushing in the same handler does not help either: both
   * land in one commit, so the window is still there when the push goes out.
   *
   * <p>Holding the id and pushing from an effect fixes the ordering by stating
   * it. The effect cannot run until the render that unmounted the sheet has
   * been committed, so by the time it does there is no modal left to land
   * behind. Navigation also belongs to the screen rather than to a sheet.
   */
  const [pendingChat, setPendingChat] = useState<{ threadId: string; title: string } | null>(null);
  useEffect(() => {
    if (!pendingChat || responding) {
      return;
    }
    setPendingChat(null);
    router.push({
      params: { threadId: pendingChat.threadId, title: pendingChat.title },
      pathname: "/chat/[threadId]",
    });
  }, [pendingChat, responding, router]);

  const enquiriesQuery = useListPropertyEnquiriesQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty,
  });

  const enquiries = useMemo(() => enquiriesQuery.data ?? [], [enquiriesQuery.data]);
  const unhandled = useMemo(() => enquiries.filter((enquiry) => !enquiry.handlerUserId), [enquiries]);
  const mine = useMemo(
    () => (currentUserId ? enquiries.filter((enquiry) => enquiry.handlerUserId === currentUserId) : []),
    [currentUserId, enquiries],
  );
  // Opens on All, unless All is empty and something is in Mine: opening onto
  // an empty tab reads as "no enquiries" when there are some.
  const effectiveTab: EnquiryTab = tab === "all" && unhandled.length === 0 && mine.length > 0 ? "mine" : tab;
  const visible = effectiveTab === "all" ? unhandled : mine;
  const shown = visible.slice(0, visibleCount);
  const hasMore = visibleCount < visible.length;

  function changeTab(next: EnquiryTab) {
    setTab(next);
    setVisibleCount(PAGE_SIZE);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMore) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, visible.length));
    }
  }

  return (
    <ScreenScrollView
      onScroll={handleScroll}
      safeAreaEdges={["top", "bottom"]}
      scrollEventThrottle={16}
    >
      <ScreenHeader
        italicTail="received."
        subtitle={
          selectedProperty
            ? `People asking about ${selectedProperty.name} from its public profile.`
            : "Select a property from Home first."
        }
        title="Enquiries"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Enquiries are scoped to the active owner property."
          icon={MessageSquare}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <View style={{ gap: spacing.md }}>
          {enquiriesQuery.isFetching && enquiries.length === 0 ? (
            // Enquiry-shaped: a name row, the message, and the buttons — three
            // of them, because one card standing in for a list reserves a
            // fraction of the height that arrives.
            <OwnerEnquiryListSkeleton />
          ) : enquiries.length === 0 ? (
            <EmptyState
              description="People who find this property in discovery can ask a question from its profile."
              artwork={ENQUIRIES_ILLUSTRATION}
              artworkTextGap={-6}
              title="No enquiries yet"
            />
          ) : (
            <>
              <CountTabPills
                onChange={changeTab}
                options={[
                  { count: unhandled.length, label: "All", value: "all" as const },
                  { count: mine.length, label: "My enquiries", value: "mine" as const },
                ]}
                value={effectiveTab}
              />
              {visible.length === 0 ? (
                <EmptyState
                  artwork={ENQUIRIES_ILLUSTRATION}
                  artworkTextGap={-6}
                  description={
                    effectiveTab === "all"
                      ? "Every enquiry has a handler. Yours are under My enquiries."
                      : "Enquiries you become the handler for appear here."
                  }
                  title={effectiveTab === "all" ? "Nothing unassigned" : "None handled by you"}
                />
              ) : (
                <>
                  {shown.map((enquiry) => (
                    <EnquiryCard
                      enquiry={enquiry}
                      key={enquiry.id}
                      onRespond={() => setResponding(enquiry)}
                      onSchedule={() => setScheduling(enquiry)}
                      onViewLog={() => setViewingLog(enquiry)}
                    />
                  ))}
                  {/* The list ends by saying so, rather than with a pager whose
                      numbers nobody was using to navigate. */}
                  {!hasMore ? <ListEnd /> : null}
                </>
              )}
            </>
          )}
        </View>
      ) : null}

      {responding ? (
        <RespondSheet
          enquiry={responding}
          onClose={() => setResponding(null)}
          onResponded={(channel, chat) => {
            setResponding(null);
            // Accurate about what happened: the app handed off to the dialer or
            // mail client. Nothing was sent to the enquirer from in here.
            if (channel === "CHAT") {
              // Nothing to confirm: the chat itself opens, which is the whole
              // answer. A toast over a conversation says less than the
              // conversation does. Queued rather than opened here — see
              // pendingChat.
              if (chat) {
                setPendingChat(chat);
              }
              return;
            }
            toast.show(channel === "EMAIL" ? "Marked as emailed." : "Marked as called.", "success");
          }}
        />
      ) : null}

      {viewingLog ? <ActionLogSheet enquiry={viewingLog} onClose={() => setViewingLog(null)} /> : null}

      {/* The chat's own visit sheet, opened from the card (user, 2026-10-02). */}
      {scheduling && selectedProperty ? (
        <VisitSheet
          enquiryId={scheduling.id}
          onClose={() => setScheduling(null)}
          propertyId={selectedProperty.id}
          viewer={scheduling.viewerMayAct === false ? "OTHER_MANAGEMENT" : "ACTING_MANAGEMENT"}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function EnquiryCard({
  enquiry,
  onRespond,
  onSchedule,
  onViewLog,
}: {
  enquiry: EnquiryDetail;
  onRespond: () => void;
  onSchedule: () => void;
  onViewLog: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  // Greyed and unactionable, but still listed for a day — see the module doc.
  // Nothing should vanish between two glances at the screen.
  //
  // By the clock, not by the status. EXPIRED is only what the server's sweep
  // has already recorded, and that runs on a cron — so an enquiry whose
  // deadline passed an hour ago is still NEW, and reading the status alone left
  // the card with no expired tag and a live Respond button on a question the
  // enquirer has already been freed to ask again. Only NEW ages out: a
  // RESPONDED enquiry is finished, and the date passing does not un-answer it.
  const isExpired = enquiry.status === "EXPIRED" || hasLapsed(enquiry);
  const isNew = isNewToday(enquiry) && !isExpired;
  const canAct = !isExpired && enquiry.viewerMayAct !== false;

  return (
    <Card style={{ overflow: "hidden" }}>
      {isNew ? <NewRibbon /> : null}
      {/* Dimmed as a whole rather than restyling every line: an expired enquiry
          is still readable, just plainly no longer something to act on. */}
      <View style={{ gap: spacing.xs, opacity: isExpired ? 0.55 : 1 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, paddingRight: isNew ? 44 : 0 }}>
          <User color={colors.ink} fill={colors.ink} size={14} />
          <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>
            {enquiry.enquirerName ?? "Someone"}
          </Text>
        </View>

        {/* When it was asked and when it runs out, both as pills straight
            under the name (user, 2026-10-02); the phone number went, the
            respond sheet already carries it. */}
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 10.5 }}>
              {formatWhen(enquiry.createdAt)}
            </Text>
          </View>
          <ExpiryChip expired={isExpired} expiresAt={enquiry.expiresAt} />
        </View>

        {/* The concern cards' description face, a weight heavier
            (user, 2026-10-02). */}
        <Text style={[type.description, { color: colors.ink, fontFamily: fonts.sansSemiBold, marginTop: 2 }]}>
          {enquiry.message}
        </Text>

        {/* Respond and Schedule visit share the row; the log is a disc beside
            them. What was done and by whom lives behind it rather than on the
            card — history on every card buries the message that matters. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            {/* Blocked once expired, and refused by the server too: the card may
                have been rendered before the sweep ran. */}
            <ActionButton compact disabled={!canAct} label="Respond" onPress={onRespond} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionButton compact disabled={!canAct} icon={CalendarPlus} label="Schedule visit" onPress={onSchedule} variant="secondary" />
          </View>
          <ActionLogButton count={enquiry.responses.length} onPress={onViewLog} />
        </View>
      </View>
    </Card>
  );
}

/**
 * Raised today and nobody has claimed it: new (user, 2026-10-02). It drops off
 * the next calendar day, or the moment a handler takes it on.
 */
function isNewToday(enquiry: EnquiryDetail) {
  return calendarDaysAgo(new Date(enquiry.createdAt)) <= 0 && !enquiry.handlerUserId;
}

/** The ribbon's square in the card's corner; the band crosses it at 45 degrees. */
const RIBBON_BOX = 76;
/** The darker folds where the band tucks behind the card's two edges. */
const RIBBON_TAIL = 6;

/**
 * The NEW tag, drawn as the sale sticker it was modelled on (user,
 * 2026-10-02): a red band across the card's top-right corner, reading down to
 * the right, with a darker fold at each end where it wraps the edge. The card's
 * own rounding clips the corner.
 *
 * <p>Shown only while {@link isNewToday}: a reply under first-response mode
 * makes the replier the handler, so an answered enquiry has already lost it.
 */
function NewRibbon() {
  const { colors, fonts } = useTheme();
  // Right-angled triangles, square corner up and right: each sits against the
  // band's outer edge where it meets the card edge, the fold of the wrap.
  const tail = {
    borderLeftColor: "transparent",
    borderLeftWidth: RIBBON_TAIL,
    borderTopColor: RIBBON_FOLD,
    borderTopWidth: RIBBON_TAIL,
    height: 0,
    position: "absolute" as const,
    width: 0,
  };
  return (
    <View
      accessibilityLabel="New enquiry"
      pointerEvents="none"
      style={{ height: RIBBON_BOX, overflow: "hidden", position: "absolute", right: 0, top: 0, width: RIBBON_BOX, zIndex: 1 }}
    >
      <View style={[tail, { left: 5, top: 0 }]} />
      <View style={[tail, { left: RIBBON_BOX - RIBBON_TAIL, top: RIBBON_BOX - 11 }]} />
      <View
        style={{
          backgroundColor: colors.danger,
          paddingVertical: 3,
          position: "absolute",
          right: -30,
          shadowColor: "#000000",
          shadowOffset: { height: 1, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 2,
          elevation: 2,
          top: 16,
          transform: [{ rotate: "45deg" }],
          width: 110,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.2, textAlign: "center" }}>
          NEW
        </Text>
      </View>
    </View>
  );
}

/** The underside of the band, seen where it folds back. */
const RIBBON_FOLD = "#991B1B";

/**
 * Opens the action log. Outlined container, ink glyph, no fill — the house icon
 * treatment, kept small so the two buttons beside it get the width.
 *
 * <p>Greyed with nothing to show rather than hidden: an owner checking "has
 * anyone dealt with this" needs the same control to answer "no" as to answer
 * "yes", and a button that appears only after the fact is one they never learn
 * is there.
 */
function ActionLogButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const empty = count === 0;

  return (
    <AnimatedPressable
      accessibilityLabel={empty ? "Action log, nothing yet" : `Action log, ${count} action${count === 1 ? "" : "s"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: empty }}
      disabled={empty}
      onPress={onPress}
      style={{
        alignItems: "center",
        // A filled disc rather than an outlined square. Beside the Respond
        // button — a solid block of the same height — an outlined box read as a
        // second, weaker button competing with it, where a disc reads as the
        // quiet secondary it is.
        backgroundColor: colors.surfaceSunken,
        borderRadius: 999,
        // Smaller (user, 2026-10-02), so Respond and Schedule visit beside it
        // get the width.
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <History color={empty ? colors.muted : colors.ink} size={17} strokeWidth={2} />
    </AnimatedPressable>
  );
}

/**
 * Whether this enquiry's window has closed. Answered or not.
 *
 * <p>By the clock, not by the status. `EXPIRED` is only what the server's sweep
 * has already recorded, and that runs on a cron — so an enquiry whose deadline
 * passed an hour ago is still `NEW`, and reading the status alone left it
 * counted as new, listed under the New tab, badged NEW, carrying no expired tag
 * and offering a live Respond button.
 *
 * <p>A reply inside the window does not reopen it either. The date is the life
 * of the question: a month-old enquiry somebody called about once is closed,
 * and it read as live because its status was `RESPONDED` rather than `EXPIRED`
 * and nothing was comparing the date.
 */
function hasLapsed(enquiry: EnquiryDetail) {
  return Date.parse(enquiry.expiresAt) <= Date.now();
}

/** What was done, by whom, when — the whole history, newest first. */
function ActionLogSheet({ enquiry, onClose }: { enquiry: EnquiryDetail; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <SheetShell onClose={onClose} title="Action log">
      <Text style={[type.modalDescription, { color: colors.muted }]}>
        Every time someone reached out to {firstName(enquiry.enquirerName)}.
      </Text>

      {enquiry.responses.map((response) => (
        <View
          key={response.id}
          style={{
            borderColor: colors.border,
            borderLeftColor: colors.jade,
            borderLeftWidth: 4,
            borderWidth: 1,
            gap: 3,
            padding: spacing.md,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            {/* Chat uses the Chats tab's own glyph (user, 2026-10-02); it showed
                the phone. */}
            {response.channel === "EMAIL" ? (
              <Mail color={colors.jade} size={13} strokeWidth={2.4} />
            ) : response.channel === "CHAT" ? (
              <MaterialCommunityIcons color={colors.jade} name="chat-outline" size={14} />
            ) : (
              <Phone color={colors.jade} size={13} strokeWidth={2.4} />
            )}
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
              {response.channel === "EMAIL" ? "Emailed" : response.channel === "CHAT" ? "Chatted" : "Called"}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {response.respondedByName ?? "Someone"} · {formatWhen(response.respondedAt)}
          </Text>
          {response.note ? (
            <Text style={[type.modalDescription, { color: colors.muted, marginTop: 2 }]}>
              {response.note}
            </Text>
          ) : null}
        </View>
      ))}
    </SheetShell>
  );
}

function RespondSheet({
  enquiry,
  onClose,
  onResponded,
}: {
  enquiry: EnquiryDetail;
  onClose: () => void;
  /**
   * @param chat the conversation to open, for a chat reply only. Handed up
   *             rather than opened here: this sheet is a modal, and a screen
   *             pushed from inside one lands behind it.
   */
  onResponded: (channel: EnquiryResponseChannel, chat?: { threadId: string; title: string }) => void;
}) {
  const { colors, type } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [respond] = useRespondToEnquiryMutation();

  const emailChannel = enquiry.reachableChannels.find((channel) => channel.channel === "EMAIL");
  const callChannel = enquiry.reachableChannels.find((channel) => channel.channel === "CALL_BACK");

  /**
   * Hands the conversation to the phone, and records that it happened.
   *
   * <p>The hand-off comes first and is what must not fail: the record is an
   * internal note, but the dialer opening is the actual reply. If recording
   * fails the owner is still mid-call, so it is logged into the error line
   * rather than blocking anything.
   */
  /**
   * Answers in chat: opens the conversation, then hands it to the screen.
   *
   * <p>
   * The order is the opposite of the phone and email paths, and has to be. There
   * the hand-off IS the reply and the record is a note about it, so the dialer
   * opens first and a failed write is swallowed. Here the write is what CREATES
   * the conversation — there is nothing to navigate to until the server answers,
   * so a failure has to stop and say so rather than push an empty screen.
   */
  async function chooseChat() {
    setError(null);
    const title = enquiry.enquirerName ?? "Enquiry";

    // Already answered in chat, so this is "Open chat" and there is nothing to
    // record. Going through the mutation again wrote a second, identical row
    // into the action log every time the owner reopened the conversation, and
    // made reading an existing thread depend on a write succeeding.
    if (enquiry.chatThreadId) {
      onResponded("CHAT", { threadId: enquiry.chatThreadId, title });
      return;
    }

    try {
      const detail = await respond({ channel: "CHAT", enquiryId: enquiry.id, note: null, version: enquiry.version }).unwrap();
      if (!detail.chatThreadId) {
        setError("The conversation could not be opened. Try again.");
        return;
      }
      onResponded("CHAT", { threadId: detail.chatThreadId, title });
    } catch {
      setError("Could not start the chat. Try again.");
    }
  }

  async function choose(channel: EnquiryResponseChannel, target: string | undefined) {
    setError(null);

    try {
      if (channel === "EMAIL") {
        await Linking.openURL(`mailto:${target}`);
      } else {
        // Through the shared helper, so the dialer shows a local number here
        // exactly as it does everywhere else.
        openDialer(target);
      }
    } catch {
      setError(
        channel === "EMAIL"
          ? "No email app is set up on this device."
          : "Could not open the dialer on this device.",
      );
      return;
    }

    try {
      await respond({ channel, enquiryId: enquiry.id, note: null, version: enquiry.version }).unwrap();
    } catch {
      // The reply is already happening; a failed bookkeeping write must not
      // look like a failed response.
    }
    onResponded(channel);
  }

  return (
    <SheetShell onClose={onClose} title={`Respond to ${firstName(enquiry.enquirerName)}`}>
      {/* "nothing is sent from inside the app" went with the dash. It stopped
          being true when chat became a real reply: that one IS sent from in
          here, and the line was promising the opposite directly above it. */}
      <Text style={[type.modalDescription, { color: colors.muted }]}>
        Reach them directly through these available channels.
      </Text>

      {/* Only what actually works. A greyed row saying "no verified email"
          was a dead control that also announced a fact about the enquirer —
          which is the very thing reachableChannels exists to withhold, since a
          channel someone declined is not management's business and showing it
          invites working around it. Absent says the same thing without either
          problem. */}
      {callChannel ? (
        <ChannelOption
          icon={Phone}
          label="Call back"
          onPress={() => void choose("CALL_BACK", callChannel.target)}
          subtitle={callChannel.target}
        />
      ) : null}

      {emailChannel ? (
        <ChannelOption
          icon={Mail}
          label="Email"
          onPress={() => void choose("EMAIL", emailChannel.target)}
          subtitle={emailChannel.target}
        />
      ) : null}

      {/* Never conditional, unlike the two above. Chat needs no phone number
          and no verified address, so it is the one reply that works however
          little the enquirer chose to share — which is what makes declining the
          other two a real choice rather than a way to go unanswerable, and what
          keeps this sheet from ever being empty. */}
      <ChannelOption
        icon={MessageSquare}
        label={enquiry.chatThreadId ? "Open chat" : "Chat"}
        onPress={() => void chooseChat()}
        subtitle={
          enquiry.chatThreadId
            ? "Continue the conversation"
            : `Message ${firstName(enquiry.enquirerName)} inside the app`
        }
      />

      {error ? (
        <Text style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

    </SheetShell>
  );
}

/**
 * One way of getting back to the enquirer.
 *
 * <p>Every one rendered is one that works — the unreachable ones are left out
 * rather than greyed — so this no longer carries an unusable state, and the
 * `dashed` and `disabled` props that dressed one went with it.
 */
function ChannelOption({
  icon: Icon,
  label,
  onPress,
  subtitle,
}: {
  icon: typeof Phone;
  label: string;
  onPress: () => void;
  subtitle: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      // A grey card, no outline (user, 2026-10-02): the black border made each
      // option read as a form field.
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: 14,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {/* Ink, not primary. These are equal choices of how to reach someone —
          blue made each one read as the recommended action, which none is. */}
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {label}
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </AnimatedPressable>
  );
}


function firstName(fullName: string | null) {
  if (!fullName) {
    return "them";
  }
  return fullName.trim().split(/\s+/)[0];
}

/**
 * "Today at 4:32 pm", "3 days ago at 9:05 am".
 *
 * <p>Relative day, absolute time. An owner scanning a list cares how long the
 * question has been sitting there, not its calendar date — but the time of day
 * still matters for deciding whether calling right now is reasonable.
 *
 * <p>Day distance is measured in Asia/Kolkata calendar days, not in elapsed
 * 24-hour blocks: 11pm and 1am are "yesterday" and "today" to a reader even
 * though only two hours separate them.
 */
function formatWhen(value: string) {
  const asked = new Date(value);
  const days = calendarDaysAgo(asked);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: DISPLAY_ZONE,
  }).format(asked);

  if (days <= 0) {
    return `Today at ${time}`;
  }
  if (days === 1) {
    return `Yesterday at ${time}`;
  }
  return `${days} days ago at ${time}`;
}

const DISPLAY_ZONE = "Asia/Kolkata";

/** Whole calendar days between then and now, in the display zone. */
function calendarDaysAgo(then: Date) {
  const startOfDay = (date: Date) => {
    // en-CA renders as YYYY-MM-DD, which parses back as a clean date boundary.
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_ZONE }).format(date);
    return new Date(`${iso}T00:00:00Z`).getTime();
  };
  return Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
}

/** The date this enquiry stops being actionable, or that it already has. */
function formatExpiryDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: DISPLAY_ZONE,
  }).format(new Date(value));
}

/**
 * How long is left, or that the window has closed.
 *
 * <p>Present on every card, not only near the end: an owner should not have to
 * learn the seven-day rule by watching an enquiry disappear.
 */
function ExpiryChip({ expired, expiresAt }: { expired: boolean; expiresAt: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={{
        backgroundColor: expired ? colors.neutralSoft : colors.surfaceSunken,
        borderRadius: 999,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 10.5 }}>
        {expired ? `Expired ${formatExpiryDate(expiresAt)}` : `Expires ${formatExpiryDate(expiresAt)}`}
      </Text>
    </View>
  );
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;
}
