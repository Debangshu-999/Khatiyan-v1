import { useEffect, useMemo, useState } from "react";
import { Linking, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { History, Mail, MessageSquare, Phone, User } from "lucide-react-native";

import { openDialer } from "@/lib/dial";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { CountTabPills } from "@/components/filter-bubbles";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { OwnerEnquiryListSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
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
const ENQUIRIES_ILLUSTRATION = require("../assets/workspace/enquiries.png");

type EnquiryFilter = "new" | "all";

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

  const [filter, setFilter] = useState<EnquiryFilter>("new");
  // Pages the RENDER, not the fetch — the list arrives as one payload. Same
  // shape as the notifications feed so both lists end the same way.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [responding, setResponding] = useState<EnquiryDetail | null>(null);
  const [viewingLog, setViewingLog] = useState<EnquiryDetail | null>(null);

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
  const openCount = enquiries.filter(awaitingAnswer).length;

  // Unanswered first by default, and "All" when there is nothing waiting —
  // opening onto an empty filter reads as "no enquiries" when there are plenty.
  const effectiveFilter: EnquiryFilter = filter === "new" && openCount === 0 ? "all" : filter;
  const visible = effectiveFilter === "new" ? enquiries.filter(awaitingAnswer) : enquiries;
  const shown = visible.slice(0, visibleCount);
  const hasMore = visibleCount < visible.length;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMore) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, visible.length));
    }
  }

  function changeFilter(next: EnquiryFilter) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
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
          {/* No "n enquiries" heading. It only ever counted the filter already
              chosen, so the number moved when a tab was tapped and the other
              tab gave no hint of what it held. The tabs carry their own counts,
              which is the whole picture on one line. */}
          <CountTabPills
            onChange={changeFilter}
            options={[
              // All leads, as on every other filter strip in the app — the
              // widest set first, then the narrowing of it. The screen still
              // OPENS on New when anything is unanswered; where a tab sits and
              // which one is selected are separate questions.
              { count: enquiries.length, label: "All", value: "all" as const },
              { count: openCount, label: "New", value: "new" as const },
            ]}
            value={effectiveFilter}
          />
          {enquiriesQuery.isFetching && enquiries.length === 0 ? (
            // Enquiry-shaped: a name row, the message, and the Respond
            // button — three of them, because one card standing in for a list
            // reserves a fraction of the height that arrives.
            <OwnerEnquiryListSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState
              description={
                enquiries.length > 0
                  ? "Nothing is waiting on you."
                  : "People who find this property in discovery can ask a question from its profile."
              }
              artwork={ENQUIRIES_ILLUSTRATION}
              title={enquiries.length > 0 ? "All answered" : "No enquiries yet"}
            />
          ) : (
            <>
              {shown.map((enquiry) => (
                <EnquiryCard
                  enquiry={enquiry}
                  key={enquiry.id}
                  onRespond={() => setResponding(enquiry)}
                  onViewLog={() => setViewingLog(enquiry)}
                />
              ))}
              {/* The list ends by saying so, rather than with a pager whose
                  numbers nobody was using to navigate. */}
              {!hasMore ? (
                <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                  That&apos;s all for now
                </Text>
              ) : null}
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
    </ScreenScrollView>
  );
}

function EnquiryCard({
  enquiry,
  onRespond,
  onViewLog,
}: {
  enquiry: EnquiryDetail;
  onRespond: () => void;
  onViewLog: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  // Status, not `responses.length` — the New filter and both badges count on
  // status, and a pill disagreeing with the number beside it is worse than
  // either being wrong on its own.
  const isNew = awaitingAnswer(enquiry);
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

  return (
    <Card>
      {/* Dimmed as a whole rather than restyling every line: an expired enquiry
          is still readable, just plainly no longer something to act on. */}
      <View style={{ gap: spacing.xs, opacity: isExpired ? 0.55 : 1 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.xs }}>
            <User color={colors.ink} fill={colors.ink} size={14} />
            <Text style={[type.display, { color: colors.ink, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>
              {enquiry.enquirerName ?? "Someone"}
            </Text>
          </View>
          {isNew ? (
            <View
              style={{
                borderColor: colors.primary,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: spacing.sm,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 10 }}>
                NEW
              </Text>
            </View>
          ) : null}
          {/* No EXPIRED pill here. The chip at the foot of the card already
              says "Expired 24 Aug", which is the same fact and the useful half
              of it — a bare EXPIRED above it was the word twice. NEW keeps its
              pill because nothing else on the card carries it. */}
        </View>

        {enquiry.enquirerPhone ? (
          <Text style={[type.caption, { color: colors.kicker }]}>
            {enquiry.enquirerPhone}
          </Text>
        ) : null}

        <Text style={[type.quote, { color: colors.ink, marginTop: 2 }]}>
          {enquiry.message}
        </Text>

        {/* Respond takes the row; the log is a square beside it. What was done
            and by whom lives behind that button rather than on the card — it is
            history, and history on every card buries the message that matters. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            {/* Blocked once expired, and refused by the server too: the card may
                have been rendered before the sweep ran. */}
            <ActionButton disabled={isExpired} label="Respond" onPress={onRespond} />
          </View>
          <ActionLogButton count={enquiry.responses.length} onPress={onViewLog} />
        </View>

        {/* When it was asked and when it runs out, on one line each and both on
            the left — a right-aligned time read as a separate column of numbers
            rather than as part of the same sentence. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: 2 }}>
          <Text style={[type.caption, { color: colors.kicker, flex: 1 }]}>
            {formatWhen(enquiry.createdAt)}
          </Text>
          <ExpiryChip expired={isExpired} expiresAt={enquiry.expiresAt} />
        </View>
      </View>
    </Card>
  );
}

/**
 * Opens the action log. Outlined container, ink glyph, no fill — the house icon
 * treatment, matched in height to the Respond button beside it.
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
        height: 48,
        justifyContent: "center",
        width: 48,
      }}
    >
      <History color={empty ? colors.muted : colors.ink} size={20} strokeWidth={2} />
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

/** Still genuinely waiting on someone. */
function awaitingAnswer(enquiry: EnquiryDetail) {
  return enquiry.status === "NEW" && !hasLapsed(enquiry);
}

/** What was done, by whom, when — the whole history, newest first. */
function ActionLogSheet({ enquiry, onClose }: { enquiry: EnquiryDetail; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <SheetShell onClose={onClose} title="Action log">
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
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
            {response.channel === "EMAIL" ? (
              <Mail color={colors.jade} size={13} strokeWidth={2.4} />
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
            <Text style={[type.caption, { color: colors.muted, marginTop: 2 }]}>
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
      const detail = await respond({ channel: "CHAT", enquiryId: enquiry.id, note: null }).unwrap();
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
      await respond({ channel, enquiryId: enquiry.id, note: null }).unwrap();
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
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
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
      style={{
        alignItems: "center",
        borderColor: colors.ink,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1.5,
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
