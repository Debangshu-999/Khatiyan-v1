import { useEffect, useMemo, useState } from "react";
import { ImageBackground, Linking, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  AlarmClock,
  AlertCircle,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  CircleCheck,
  CirclePlay,
  Clock,
  Hourglass,
  QrCode,
  UserCheck,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectionTabs } from "@/components/selection-tabs";
import { GhostBlock, GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { ClosesInChip, CountPill, TagPill, clockTime } from "@/features/enquiry/enquiry-tags";
import { ManageVisitSheet } from "@/features/enquiry/manage-visit-sheet";
import { formatVisitShort } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { PropertyVisitsIcon } from "@/features/property/property-control-icons";
import { RunningLateSheet } from "@/features/visits/running-late-sheet";
import { indiaDate, useNow } from "@/features/visits/visit-clock";
import { VisitStateChip, type VisitStatus } from "@/features/visits/visit-state-chip";
import { VisitorPassSheet } from "@/features/visits/visitor-pass-sheet";
import {
  useDeclineMissedVisitMutation,
  useGetMyVisitsQuery,
  type MyVisit,
} from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The three tabs (user, 2026-10-04): by the visit's own date against today's in India. */
type Tab = "today" | "upcoming" | "history";

const TAB_COPY: Record<Tab, { empty: string; emptyTitle: string; noun: [string, string] }> = {
  history: {
    empty: "Visits you have made, and ones that were missed, are kept here.",
    emptyTitle: "No past visits",
    noun: ["past visit", "past visits"],
  },
  today: {
    empty: "A visit booked for today shows here, with your visitor pass.",
    emptyTitle: "No visits today",
    noun: ["visit today", "visits today"],
  },
  upcoming: {
    empty: "Book a visit from an enquiry's chat once the property has replied.",
    emptyTitle: "No upcoming visits",
    noun: ["upcoming visit", "upcoming visits"],
  },
};

/** The map behind the Nearby tab's "View on map" card, faded under Directions here. */
const NEARBY_MAP_PREVIEW = require("../assets/images/nearby-map-preview.png");

/**
 * The visits this person booked (user, 2026-10-04), opened from the Account
 * tab under Enquiries, Visits and Bookings.
 *
 * <ul>
 * <li>Three tabs (user, 2026-10-04): Today, Upcoming and History, by the
 * visit's date. A missed visit still asking "Are you still interested?" is in
 * History, and History's tab counts those, so the question is not lost there.</li>
 * <li>The visitor pass shows from an hour before the slot until the day is
 * over, the slot having ended or not.</li>
 * <li>Running late opens by itself once half the slot has gone with nobody
 * checking them in, and offers a later slot the same day at no cost. Once the
 * slot has ended the card offers Manage visit again: the visit is theirs to
 * reschedule at any time until it is done.</li>
 * <li>Each card says where the visit stands in a chip beside the name, as the
 * property's own cards do.</li>
 * <li>A visit nobody checked in becomes No visit after midnight. It asks "Are
 * you still interested?" for a week: yes moves it, no expires the enquiry, and
 * silence expires it when the week is up.</li>
 * </ul>
 */
export default function MyVisitsScreen() {
  const toast = useToast();
  const now = useNow();
  const query = useGetMyVisitsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [decline, declineState] = useDeclineMissedVisitMutation();

  const [passFor, setPassFor] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [lateId, setLateId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Running late opens by itself once for a visit. "I'm on my way" is an
  // answer, so it is not asked again until the screen is opened afresh.
  const [askedLate, setAskedLate] = useState<string[]>([]);

  const visits = useMemo(() => query.data ?? [], [query.data]);
  // Today in India, read again as the clock ticks, so the tabs turn over at midnight.
  const today = indiaDate(now);
  const byTab = useMemo(() => {
    const bySlot = (left: MyVisit, right: MyVisit) =>
      left.date.localeCompare(right.date) || left.slotStart.localeCompare(right.slotStart);
    return {
      // The server lists latest first, which is how a history reads.
      history: visits.filter((visit) => visit.date < today),
      today: visits.filter((visit) => visit.date === today).sort(bySlot),
      // Soonest first.
      upcoming: visits.filter((visit) => visit.date > today).sort(bySlot),
    } satisfies Record<Tab, MyVisit[]>;
  }, [today, visits]);
  // The tab the visitor picked. Until they pick, the first one with anything in it.
  const [pickedTab, setPickedTab] = useState<Tab | null>(null);
  const tab: Tab =
    pickedTab ??
    (byTab.today.length > 0 ? "today" : byTab.upcoming.length > 0 ? "upcoming" : byTab.history.length > 0 ? "history" : "today");
  const list = byTab[tab];
  // Still to happen today, and still asking for an answer: what each tab's count is for.
  const dueToday = byTab.today.filter((visit) => visit.state === "SCHEDULED" && visit.enquiryOpen).length;
  const awaitingAnswer = byTab.history.filter(isAskingStillInterested).length;
  const managing = managingId ? visits.find((visit) => visit.visitId === managingId) ?? null : null;
  const late = lateId ? visits.find((visit) => visit.visitId === lateId) ?? null : null;
  const declining = decliningId ? visits.find((visit) => visit.visitId === decliningId) ?? null : null;

  // Not asked again once they have said "I'm on my way": the server remembers that.
  const runningLate =
    visits.find(
      (visit) => isRunningLate(visit, now) && !visit.runningLateAt && !askedLate.includes(visit.visitId),
    ) ?? null;
  const nothingOpen = !passFor && !managingId && !lateId && !decliningId;
  useEffect(() => {
    if (runningLate && nothingOpen) {
      setAskedLate((asked) => [...asked, runningLate.visitId]);
      setLateId(runningLate.visitId);
    }
  }, [nothingOpen, runningLate]);

  /** "Are you still interested?" answered No: the enquiry expires now. */
  async function confirmDecline(visit: MyVisit) {
    try {
      await decline(visit.visitId).unwrap();
      setDecliningId(null);
      toast.show("Your enquiry has been closed.", "success");
    } catch (error) {
      setDecliningId(null);
      setRefusal(errorMessage(error));
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="visits."
        subtitle="Your property visits, with your visitor pass on the day."
        title="My"
      />

      <View style={{ gap: spacing.md }}>
        <SelectionTabs<Tab>
          active={tab}
          bleed={spacing.lg}
          distributed
          onChange={setPickedTab}
          options={[
            { badge: dueToday, label: "Today", value: "today" },
            { label: "Upcoming", value: "upcoming" },
            { badge: awaitingAnswer, label: "History", value: "history" },
          ]}
        />

        {query.isLoading && !query.data ? (
          // The real cards, drawn as their own placeholder: every leaf is a Ghost.
          <SkeletonBoundary>
            <View style={{ gap: spacing.md }}>
              {SAMPLE.map((visit) => (
                <MyVisitCard key={visit.visitId} now={now} onDecline={noop} onLate={noop} onManage={noop} onPass={noop} visit={visit} />
              ))}
            </View>
          </SkeletonBoundary>
        ) : list.length === 0 ? (
          <EmptyState
            // The Property screen's own Visiting Hours mark (user, 2026-10-04).
            artworkNode={<PropertyVisitsIcon size={64} />}
            description={TAB_COPY[tab].empty}
            title={TAB_COPY[tab].emptyTitle}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            <CountPill count={list.length} noun={TAB_COPY[tab].noun} />
            {list.map((visit) => (
              <MyVisitCard
                key={visit.visitId}
                now={now}
                onDecline={() => setDecliningId(visit.visitId)}
                onLate={() => setLateId(visit.visitId)}
                onManage={() => setManagingId(visit.visitId)}
                onPass={() => setPassFor(visit.visitId)}
                visit={visit}
              />
            ))}
          </View>
        )}
      </View>

      {passFor ? <VisitorPassSheet onClose={() => setPassFor(null)} visitId={passFor} /> : null}

      {/* Reschedule does not swap this sheet for Manage visit: it stacks that
          one on top, and its back arrow comes back here (user, 2026-10-04). */}
      {late ? (
        <RunningLateSheet
          onClose={() => setLateId(null)}
          onReschedule={() => setManagingId(late.visitId)}
          visit={late}
        />
      ) : null}

      {/* Move or cancel: the chat's own visit sheet, which offers exactly what
          the server allows now. After Running late in the tree, so it is the
          one on top when both are open. Its X closes the pair. */}
      {managing && managing.enquiryId ? (
        <ManageVisitSheet
          enquiryId={managing.enquiryId}
          onBack={lateId ? () => setManagingId(null) : undefined}
          onClose={() => {
            setManagingId(null);
            setLateId(null);
          }}
          propertyId={managing.propertyId}
        />
      ) : null}

      {declining ? (
        <ConfirmDialog
          bullets={["Your enquiry with this property will be closed.", "You can enquire again whenever you like."]}
          cancelLabel="Keep it"
          confirmLabel={declineState.isLoading ? "Closing" : "Not interested"}
          destructive
          message={`You will no longer be able to reschedule your visit to ${declining.propertyName}.`}
          onCancel={() => setDecliningId(null)}
          onConfirm={() => void confirmDecline(declining)}
          title="No longer interested?"
        />
      ) : null}

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </ScreenScrollView>
  );
}

/** A No visit whose enquiry is still open: "Are you still interested?", for the week after it. */
function isAskingStillInterested(visit: MyVisit) {
  return visit.state === "MISSED" && visit.enquiryOpen && Boolean(visit.answerBy);
}

/**
 * Half the slot gone with the slot still on, and nobody has checked them in.
 * Once it has ended there is nothing to be on the way to.
 */
function isRunningLate(visit: MyVisit, now: number) {
  return (
    visit.state === "SCHEDULED" &&
    visit.enquiryOpen &&
    now >= Date.parse(visit.runningLateFrom) &&
    now <= Date.parse(visit.slotEndsAt)
  );
}

/**
 * Where the visit stands, for the chip beside the property's name (user,
 * 2026-10-04):
 *
 * <ul>
 * <li>Upcoming: their slot has not started.</li>
 * <li>Started: it has. Running late, once they have said they are on their way.</li>
 * <li>Pending: the slot ended with nobody checking them in. It is No visit at midnight.</li>
 * <li>Visited: checked in.</li>
 * <li>No visit: nobody checked them in by midnight.</li>
 * </ul>
 *
 * None once its enquiry is over with the visit never having happened.
 */
function myVisitStatus(visit: MyVisit, now: number): VisitStatus | null {
  if (visit.state === "VISITED") {
    return { icon: CircleCheck, label: "Visited", tone: "green" };
  }
  if (visit.state === "MISSED") {
    return { icon: CalendarX, label: "No visit", tone: "red" };
  }
  if (visit.state !== "SCHEDULED" || !visit.enquiryOpen) {
    return null;
  }
  if (now < Date.parse(visit.slotStartsAt)) {
    return { icon: Clock, label: "Upcoming", tone: "muted" };
  }
  if (now > Date.parse(visit.slotEndsAt)) {
    return { icon: Hourglass, label: "Pending", tone: "amber" };
  }
  return visit.runningLateAt
    ? { icon: AlarmClock, label: "Running late", tone: "red" }
    : { icon: CirclePlay, label: "Started", tone: "blue" };
}

function MyVisitCard({
  now,
  onDecline,
  onLate,
  onManage,
  onPass,
  visit,
}: {
  /** The time now, re-read on a timer, so the pass and running late follow the slot. */
  now: number;
  onDecline: () => void;
  onLate: () => void;
  onManage: () => void;
  onPass: () => void;
  visit: MyVisit;
}) {
  const { colors, fonts, type } = useTheme();
  const scheduled = visit.state === "SCHEDULED" && visit.enquiryOpen;
  const missed = visit.state === "MISSED";
  const visited = visit.state === "VISITED";
  const status = myVisitStatus(visit, now);
  // From an hour before the slot until the day is over (user, 2026-10-04).
  const passOpen = scheduled && now >= Date.parse(visit.passOpensAt) && now < Date.parse(visit.passClosesAt);
  const slotStarted = now >= Date.parse(visit.slotStartsAt);
  const late = isRunningLate(visit, now);
  // "Are you still interested?", for the week after a No visit.
  const asking = isAskingStillInterested(visit);
  // Nothing more can come of it: attended, or its enquiry is over.
  const over = !visit.enquiryOpen && !scheduled;

  return (
    <Card style={{ gap: spacing.xs }}>
      <View style={{ gap: spacing.xs, opacity: over ? 0.55 : 1 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <GhostIcon color={colors.ink} icon={HomeMark} size={20} />
          {/* Smaller, and a long name runs onto a second line rather than
              being cut short by the chip beside it (user, 2026-10-04). */}
          <GhostText
            ghostWidth="55%"
            style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 23 }}
          >
            {visit.propertyName}
          </GhostText>
          {/* Where the visit stands, beside the name, as on the property's own cards (user, 2026-10-04). */}
          {status ? (
            <GhostPill height={16} width={72}>
              <VisitStateChip {...status} />
            </GhostPill>
          ) : null}
        </View>
        {/* No rule under the name (user, 2026-10-04): the pills follow it directly. */}

        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <GhostPill height={18} width={126}>
            <TagPill
              icon={missed ? CalendarX : CalendarCheck}
              iconColor={missed ? colors.danger : colors.successText}
              label={formatVisitShort(visit.date, visit.slotStart)}
            />
          </GhostPill>
          <GhostPill height={18} width={84}>
            <TagPill label={visit.referenceCode} />
          </GhostPill>
          {/* What the check-in recorded, in grey pills, the property's own wording (user, 2026-10-04). */}
          {visited && visit.checkedInAt ? (
            <TagPill
              icon={CheckCircle2}
              iconColor={colors.successText}
              label={
                visit.checkInMethod === "OWNER"
                  ? "Marked attended by the owner"
                  : `Checked in ${clockTime(visit.checkedInAt)}, ${visit.late ? "late" : "on time"}`
              }
            />
          ) : null}
          {visited && visit.checkedInByName && visit.checkInMethod !== "OWNER" ? (
            <TagPill icon={UserCheck} label={`Visit handled by ${visit.checkedInByName}`} />
          ) : null}
          {/* They said "I'm on my way". */}
          {scheduled && visit.runningLateAt ? (
            <TagPill icon={Clock} iconColor={colors.danger} label={`Running late, said ${clockTime(visit.runningLateAt)}`} />
          ) : null}
          {scheduled && !passOpen && !slotStarted ? (
            <TagPill icon={QrCode} label={`Pass opens ${clockTime(visit.passOpensAt)}`} />
          ) : null}
          {asking && visit.answerBy ? <ClosesInChip closesAt={visit.answerBy} /> : null}
        </View>

        {asking ? (
          <View
            style={{
              alignItems: "flex-start",
              backgroundColor: colors.dangerSoft,
              borderCurve: "continuous",
              borderRadius: radii.card,
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ paddingTop: 2 }}>
              <GhostIcon color={colors.danger} icon={AlertCircle} size={15} strokeWidth={2.4} />
            </View>
            <GhostText ghostWidth="90%" style={[type.description, { color: colors.danger, flex: 1 }]}>
              You were not checked in for this visit. Are you still interested? Reschedule it to say yes.
            </GhostText>
          </View>
        ) : null}
      </View>

      {/* The way there, over the buttons, for a visit still to happen (user, 2026-10-04). */}
      {scheduled && visit.directionsUrl ? (
        <DirectionsCard onPress={() => void Linking.openURL(visit.directionsUrl as string)} />
      ) : null}

      {/* No View property (user, 2026-10-04): a card with nothing left to do
          carries no buttons. */}
      {asking || scheduled ? (
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            // Clear of the grey pills, unless Directions already stands between them.
            marginTop: scheduled && visit.directionsUrl ? spacing.xs : spacing.md,
          }}
        >
          {asking ? (
            <>
              <View style={{ flex: 1 }}>
                <ActionButton compact label="Not interested" onPress={onDecline} variant="dangerQuiet" />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton compact label="Yes, reschedule" onPress={onManage} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <GhostBlock>
                  {late ? (
                    <ActionButton compact label="Running late?" onPress={onLate} variant="secondary" />
                  ) : (
                    <ActionButton compact icon={CalendarCheck} label="Manage visit" onPress={onManage} variant="secondary" />
                  )}
                </GhostBlock>
              </View>
              {passOpen ? (
                <View style={{ flex: 1 }}>
                  <ActionButton compact icon={QrCode} label="Visitor pass" onPress={onPass} />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Directions (user, 2026-10-04): Google Maps, from wherever the visitor is to
 * the property. The link names only the destination, so the app fills in the
 * start itself. The Nearby tab's map sits faded underneath.
 */
function DirectionsCard({ onPress }: { onPress: () => void }) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <AnimatedPressable
      accessibilityHint="Opens Google Maps"
      accessibilityLabel="Directions to the property"
      accessibilityRole="link"
      onPress={onPress}
      // Clear of the grey pills above it (user, 2026-10-04).
      style={{ marginTop: spacing.md }}
    >
      <ImageBackground
        // Less faded than it began (user, 2026-10-04): the map should read as a map.
        imageStyle={{ borderRadius: radii.card, opacity: isDark ? 0.4 : 0.6 }}
        resizeMode="cover"
        source={NEARBY_MAP_PREVIEW}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <MaterialCommunityIcons color={colors.ink} name="directions" size={20} />
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>Directions</Text>
        </View>
      </ImageBackground>
    </AnimatedPressable>
  );
}

/** The Home tab's house, solid, shaped like a lucide icon for GhostIcon: the My enquiries card's own mark. */
function HomeMark({ color, size }: LucideProps) {
  return <MaterialCommunityIcons color={color} name="home" size={Number(size ?? 24)} />;
}

function noop() {}

/** Sample cards for the loading state. Never shown as text: every leaf is a Ghost. */
const SAMPLE: MyVisit[] = ["sample-1", "sample-2"].map((visitId) => ({
  answerBy: null,
  checkInMethod: null,
  checkedInAt: null,
  checkedInByName: null,
  date: "2026-10-07",
  directionsUrl: null,
  enquiryId: "sample-enquiry",
  enquiryOpen: true,
  late: null,
  noVisitAt: null,
  runningLateAt: null,
  passClosesAt: "2099-01-02T00:00:00Z",
  passOpensAt: "2099-01-01T00:00:00Z",
  propertyId: "sample-property",
  propertyName: "Sample property",
  referenceCode: "VIS-0000",
  runningLateFrom: "2099-01-01T00:00:00Z",
  slotEnd: "12:00:00",
  slotEndsAt: "2099-01-01T00:00:00Z",
  slotStart: "11:00:00",
  slotStartsAt: "2099-01-01T00:00:00Z",
  state: "SCHEDULED",
  version: 0,
  visitId,
}));
