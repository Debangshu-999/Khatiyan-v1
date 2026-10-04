import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlarmClock,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CirclePlay,
  Clock,
  ClipboardList,
  ClipboardPenLine,
  ClockAlert,
  Hourglass,
  User,
  UserCheck,
} from "lucide-react-native";
import type { ReactNode } from "react";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilteredQueue } from "@/components/filtered-queue";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectionTabs } from "@/components/selection-tabs";
import { GhostBlock, GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { CountPill, TagPill, clockTime, daysAgo } from "@/features/enquiry/enquiry-tags";
import { formatSlotRange, formatVisitShort } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { PropertyVisitsIcon } from "@/features/property/property-control-icons";
import { CompleteVisitSheet } from "@/features/visits/complete-visit-sheet";
import { useVisitTabsSeen } from "@/features/visits/use-visit-tabs-seen";
import { VisitStateChip, type VisitStatus } from "@/features/visits/visit-state-chip";
import { MarkAttendanceSheet } from "@/features/visits/mark-attendance-sheet";
import { useNow } from "@/features/visits/visit-clock";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyVisitsQuery,
  useMarkMissedCheckInMutation,
  type PropertyVisits,
  type VisitCard,
} from "@/store/services/enquiry-chat-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { EnquiryCardSheet } from "./owner-enquiries";

type Tab = "today" | "upcoming" | "missed";
type Range = "ALL" | "WEEK" | "NEXT_WEEK" | "MONTH";

const INDIA = "Asia/Kolkata";

/**
 * The space under the Earlier today card, riding the bottom of the screen or
 * resting under the slots. One number for both, or the card would shift as it
 * changes over. Tightened twice at the user's asking (2026-10-04).
 */
const EARLIER_CARD_GAP = spacing.md;

const RANGE_HEADINGS: Record<Range, string> = {
  ALL: "All upcoming visits",
  MONTH: "Visits this month",
  NEXT_WEEK: "Visits next week",
  WEEK: "Visits this week",
};

/**
 * The Visitor Management System, VMS on the Home tool and once called Manage
 * Visits (user, 2026-10-04), a property tool open to every manager.
 *
 * <ul>
 * <li>Today: every visit booked for today. From the moment its slot starts
 * until the day is over a card offers Mark attendance, to whoever is at the
 * property: a visitor who turns up after their slot is still let in with
 * their pass. Once the slot has ended unmarked, the card says it becomes No
 * visit after midnight, and the owner alone can mark a missed check-in for
 * someone who came and was never scanned.</li>
 * <li>Upcoming: from tomorrow, with a filter for this week, next week, this
 * month, or everything booked (30 days ahead).</li>
 * <li>Missed: No visits whose enquiry is still open. Read only: a missed
 * visit is the visitor's to move.</li>
 * </ul>
 *
 * <p>No card here moves or cancels a visit. That is done from the enquiry,
 * until two hours before the slot. View enquiry opens that enquiry's own card
 * in a sheet over this screen, with its usual buttons.
 */
export default function OwnerVisitsScreen() {
  return <VisitsScreen view="main" />;
}

/**
 * Manage Visits, and its second screen, Earlier today.
 *
 * <p>Earlier today lists the visits of today's slots that have ended, the
 * same cards with their slot under the name (user, 2026-10-04). It is this
 * component again, in another view, because the cards and everything their
 * buttons open are the same: the route file only names the view.
 */
export function VisitsScreen({ view }: { view: "main" | "earlier" }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useGuardedRouter();
  const toast = useToast();
  const now = useNow();

  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = selectedPropertyId
    ? properties.find((candidate) => candidate.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;

  // Read fresh on every visit to the screen: visitors book, move and cancel
  // from their side, which nothing on this device hears about.
  const visitsQuery = useGetPropertyVisitsQuery(property?.id ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !property,
  });
  const [markMissed, markMissedState] = useMarkMissedCheckInMutation();

  const [tab, setTab] = useState<Tab>("today");
  const [range, setRange] = useState<Range>("ALL");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [missedCheckInId, setMissedCheckInId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Upcoming and Missed count what has been added to them since the tab was
  // last looked at, not everything in them (user, 2026-10-04): a tab that has
  // been visited shows no count, until something new arrives. A tab is seen
  // when it is left, or when the screen is, so the count stays readable while
  // its list is open, as on the Enquiries tabs. Today counts what is still to
  // come instead.
  const { markSeen, seenAt } = useVisitTabsSeen(
    currentUserId && property ? `${currentUserId}.${property.id}` : null,
  );
  const openTab = useRef(tab);
  openTab.current = tab;
  useFocusEffect(
    useCallback(
      () => () => {
        if (openTab.current !== "today") markSeen(openTab.current);
      },
      [markSeen],
    ),
  );
  function changeTab(next: Tab) {
    if (next !== tab && tab !== "today") markSeen(tab);
    setTab(next);
  }

  // The Earlier today card is fixed to the bottom of the screen, always
  // (user, 2026-10-04): with one slot left the list is short, and a card
  // sitting in its place under that slot read as having moved up. So there is
  // one card, at the bottom, and the list keeps a space its size at its foot
  // so the last slot can scroll clear of it.
  //
  // Two earlier versions, both gone, and neither should come back: a copy
  // that changed over with the in-flow card while scrolling (it lagged and
  // snapped on a phone), then one chosen by whether the list fits the screen
  // (the card moved up when it did).
  // View enquiry: the visit's enquiry card, in a sheet over this screen
  // (user, 2026-10-04). It never leaves for the Enquiries screen.
  const [viewingEnquiryId, setViewingEnquiryId] = useState<string | null>(null);
  // A reply over chat opens the conversation, once the sheet has gone: a
  // screen pushed while a modal is still up lands behind it.
  const [pendingChat, setPendingChat] = useState<{ threadId: string; title: string } | null>(null);
  useEffect(() => {
    if (!pendingChat || viewingEnquiryId) {
      return;
    }
    setPendingChat(null);
    router.push({
      params: { threadId: pendingChat.threadId, title: pendingChat.title },
      pathname: "/chat/[threadId]",
    });
  }, [pendingChat, router, viewingEnquiryId]);

  const today = useMemo(() => visitsQuery.data?.today ?? [], [visitsQuery.data]);
  const upcoming = useMemo(() => visitsQuery.data?.upcoming ?? [], [visitsQuery.data]);
  const missed = useMemo(() => visitsQuery.data?.missed ?? [], [visitsQuery.data]);
  const viewerIsOwner = visitsQuery.data?.viewerIsOwner ?? false;

  const upcomingBy = useMemo(() => {
    const { monthEnd, nextWeekEnd, weekEnd } = endsOfWeekAndMonth();
    return {
      ALL: upcoming,
      MONTH: upcoming.filter((visit) => visit.date <= monthEnd),
      // The Monday to Sunday after this week's (user, 2026-10-04).
      NEXT_WEEK: upcoming.filter((visit) => visit.date > weekEnd && visit.date <= nextWeekEnd),
      WEEK: upcoming.filter((visit) => visit.date <= weekEnd),
    } satisfies Record<Range, VisitCard[]>;
  }, [upcoming]);

  const marking = markingId ? today.find((visit) => visit.visitId === markingId) ?? null : null;
  const completing = completingId ? today.find((visit) => visit.visitId === completingId) ?? null : null;
  const missedCheckIn = missedCheckInId ? today.find((visit) => visit.visitId === missedCheckInId) ?? null : null;

  function viewEnquiry(visit: VisitCard) {
    setViewingEnquiryId(visit.enquiryId);
  }

  /** The owner marks a visitor nobody scanned, then fills the visit form. */
  async function confirmMissedCheckIn(visit: VisitCard) {
    try {
      await markMissed(visit.visitId).unwrap();
      setMissedCheckInId(null);
      toast.success(`${visit.prospectName ?? "Visitor"} marked as attended.`);
      setCompletingId(visit.visitId);
    } catch (error) {
      setMissedCheckInId(null);
      setRefusal(errorMessage(error));
    }
  }

  const loading = visitsQuery.isLoading && !visitsQuery.data;
  const list = tab === "today" ? today : tab === "upcoming" ? upcomingBy[range] : missed;
  // A visit moved to another day still shows on Today, as Rescheduled. It is
  // not one of today's visits any more, so the counts leave it out.
  const comingToday = today.filter((visit) => visit.state !== "RESCHEDULED").length;
  // The tab's own badge counts only what the tab still lists: visits in a slot
  // that is on now or still to come. It used to be the day's total, so it went
  // on saying 1 with nothing left on the tab, for a visit already attended in
  // a slot that had ended (user, 2026-10-04). The day's total stays in the
  // "n visits today" pill.
  const stillListedToday = today.filter(
    (visit) => visit.state !== "RESCHEDULED" && now <= Date.parse(visit.slotEndsAt),
  ).length;
  // New on Upcoming: booked, or moved onto a later day, since it was seen.
  const newUpcoming = seenAt
    ? upcoming.filter((visit) => Date.parse(visit.placedAt) > seenAt.upcoming).length
    : 0;
  // New on Missed: became No visit since it was seen. Until the night's sweep
  // has stamped it, the end of its slot stands in.
  const newMissed = seenAt
    ? missed.filter((visit) => Date.parse(visit.noVisitAt ?? visit.slotEndsAt) > seenAt.missed).length
    : 0;
  // A slot that has ended leaves Today (user, 2026-10-04): its visits move to
  // Earlier today, in the order the day ran, earliest slot first. What is left is the slot that is on
  // now, at the top, and the ones still to come, with or without visits.
  const earlier = today
    .filter((visit) => now > Date.parse(visit.slotEndsAt))
    .sort((left, right) => left.slotStart.localeCompare(right.slotStart));
  const pendingReview = earlier.filter((visit) => visit.state === "SCHEDULED").length;
  const slots = groupBySlot(
    today.filter((visit) => now <= Date.parse(visit.slotEndsAt)),
    (visitsQuery.data?.todaySlots ?? []).filter((slot) => now <= Date.parse(slot.endsAt)),
  );
  // Always there on Today, with or without anything in it yet: it is where
  // a slot's visits will go when it ends (user, 2026-10-04).
  const showEarlierCard = view === "main" && tab === "today" && Boolean(property);
  // How many of today's slots are over, the ones nobody came in included.
  // Said beside the day's count once the first has ended (user, 2026-10-04).
  const slotsToday = groupBySlot(today, visitsQuery.data?.todaySlots ?? []);
  const slotsCompleted = slotsToday.filter((slot) => now > Date.parse(slot.slotEndsAt)).length;
  // Every one of today's slots is over: the chip says so in words, not as a number (user, 2026-10-04).
  const allSlotsCompleted = slotsToday.length > 0 && slotsCompleted === slotsToday.length;

  const cards = loading ? (
    // The real cards, drawn as their own placeholder: every line of sample
    // data is a Ghost, so none of it reads as a real visitor's.
    <SkeletonBoundary>
      <View style={{ gap: spacing.md }}>
        {SAMPLE.map((visit) => (
          <VisitCardView currentUserId={null} key={visit.visitId} now={now} onViewEnquiry={noop} tab="upcoming" viewerIsOwner={false} visit={visit} />
        ))}
      </View>
    </SkeletonBoundary>
  ) : (tab === "today" ? slots.length === 0 : list.length === 0) ? (
    <EmptyState
      description={
        tab === "today"
          ? earlier.length > 0
            ? "Today's slots are over. Their visits are under Earlier today."
            : "Visits booked for today show here, with Mark attendance once a slot starts."
          : tab === "upcoming"
            ? upcoming.length > 0
              ? "Pick another range to see the rest."
              : "Visits booked from tomorrow onwards show here."
            : "A visit nobody was checked in for shows here until its enquiry ends."
      }
      // The Property screen's own Visiting Hours mark (user, 2026-10-04).
      artworkNode={<PropertyVisitsIcon size={64} />}
      title={
        tab === "today"
          ? earlier.length > 0
            ? "No more slots today"
            : "No visits today"
          : tab === "upcoming"
            ? "No upcoming visits"
            : "No missed visits"
      }
    />
  ) : tab === "today" ? (
    <View style={{ gap: spacing.lg }}>
      {slots.map((slot) => (
        <SlotSection key={slot.key} now={now} slot={slot}>
          {slot.visits.length === 0 ? <EmptySlot /> : null}
          {slot.visits.map((visit) => (
            <VisitCardView
              currentUserId={currentUserId}
              key={visit.visitId}
              now={now}
              onComplete={() => setCompletingId(visit.visitId)}
              onMarkAttendance={() => setMarkingId(visit.visitId)}
              onMissedCheckIn={() => setMissedCheckInId(visit.visitId)}
              onViewEnquiry={() => viewEnquiry(visit)}
              tab={tab}
              viewerIsOwner={viewerIsOwner}
              visit={visit}
            />
          ))}
        </SlotSection>
      ))}
    </View>
  ) : (
    <View style={{ gap: spacing.md }}>
      {list.map((visit) => (
        <VisitCardView
          currentUserId={currentUserId}
          key={visit.visitId}
          now={now}
          onViewEnquiry={() => viewEnquiry(visit)}
          tab={tab}
          viewerIsOwner={viewerIsOwner}
          visit={visit}
        />
      ))}
    </View>
  );

  const sheets = (
    <>
      {viewingEnquiryId && property ? (
        <EnquiryCardSheet
          enquiryId={viewingEnquiryId}
          onClose={() => setViewingEnquiryId(null)}
          onOpenChat={(chat) => {
            setViewingEnquiryId(null);
            setPendingChat(chat);
          }}
          propertyId={property.id}
        />
      ) : null}

      {marking ? (
        <MarkAttendanceSheet
          onCheckedIn={(card) => {
            setMarkingId(null);
            // Whoever checked them in fills the form: straight on to it.
            setCompletingId(card.visitId);
          }}
          onClose={() => setMarkingId(null)}
          visit={marking}
        />
      ) : null}

      {completing ? <CompleteVisitSheet onClose={() => setCompletingId(null)} visit={completing} /> : null}

      {missedCheckIn ? (
        <ConfirmDialog
          bullets={[
            "Use this when they came and nobody scanned their pass.",
            "It can only be marked today, before midnight.",
          ]}
          confirmLabel={markMissedState.isLoading ? "Marking" : "Mark as attended"}
          message={`${missedCheckIn.prospectName ?? "This visitor"} will be recorded as having visited.`}
          onCancel={() => setMissedCheckInId(null)}
          onConfirm={() => void confirmMissedCheckIn(missedCheckIn)}
          title="Mark a missed check-in?"
        />
      ) : null}

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </>
  );

  // Earlier today: the visits of the slots that have ended, as their own screen.
  if (view === "earlier") {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          italicTail="today."
          subtitle={
            property
              ? `Visits from the slots that have ended at ${property.name} today.`
              : "Select a property from Home first."
          }
          title="Earlier"
        />
        {loading ? (
          <SkeletonBoundary>
            <View style={{ gap: spacing.md }}>
              {SAMPLE.map((visit) => (
                <VisitCardView currentUserId={null} key={visit.visitId} now={now} onViewEnquiry={noop} tab="upcoming" viewerIsOwner={false} visit={visit} />
              ))}
            </View>
          </SkeletonBoundary>
        ) : earlier.length === 0 ? (
          <EmptyState
            artworkNode={<PropertyVisitsIcon size={64} />}
            description="Visits move here once their slot has ended."
            title="Nothing earlier today"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            <CountPill count={earlier.length} noun={["visit", "visits"]} />
            {earlier.map((visit) => (
              <VisitCardView
                currentUserId={currentUserId}
                key={visit.visitId}
                now={now}
                onComplete={() => setCompletingId(visit.visitId)}
                onMarkAttendance={() => setMarkingId(visit.visitId)}
                onMissedCheckIn={() => setMissedCheckInId(visit.visitId)}
                onViewEnquiry={() => viewEnquiry(visit)}
                showSlot
                tab="today"
                viewerIsOwner={viewerIsOwner}
                visit={visit}
              />
            ))}
          </View>
        )}
        {sheets}
      </ScreenScrollView>
    );
  }

  const earlierCard = (
    <EarlierTodayCard
      count={earlier.length}
      onPress={() => router.push("/owner-visits-earlier")}
      pendingReview={pendingReview}
    />
  );

  return (
    <>
    <ScreenScrollView
      // The same gap under the space the list keeps for the card as under the
      // card itself (user, 2026-10-04): scrolled to the end, the list stops
      // just above it, with no extra space beneath.
      contentContainerStyle={{ paddingBottom: EARLIER_CARD_GAP }}
      safeAreaEdges={["top", "bottom"]}
    >
      <ScreenHeader
        // "Visitor Management System", VMS on the Home tool. It was "Manage
        // visits" (user, 2026-10-04).
        italicTail="System."
        subtitle={
          property
            ? `Everyone coming to see ${property.name}, and who has arrived.`
            : "Select a property from Home first."
        }
        title="Visitor Management"
      />

      {!property && !propertiesQuery.isFetching ? (
        <EmptyState
          artworkNode={<PropertyVisitsIcon size={64} />}
          description="Visits are scoped to the active owner property."
          title="No property selected"
        />
      ) : null}

      {property ? (
        <View style={{ gap: spacing.md }}>
          <SelectionTabs<Tab>
            active={tab}
            bleed={spacing.lg}
            distributed
            onChange={changeTab}
            options={[
              { badge: stillListedToday, label: "Today", value: "today" },
              { badge: newUpcoming, label: "Upcoming", value: "upcoming" },
              { badge: newMissed, label: "Missed", value: "missed" },
            ]}
          />

          {tab === "upcoming" ? (
            <FilteredQueue<Range>
              count={loading ? undefined : upcomingBy[range].length}
              heading={RANGE_HEADINGS[range]}
              headingNode={loading ? undefined : <CountPill count={upcomingBy[range].length} noun={["visit", "visits"]} />}
              onChange={setRange}
              options={[
                { count: upcomingBy.ALL.length, label: "All", value: "ALL" },
                { count: upcomingBy.WEEK.length, label: "This week", value: "WEEK" },
                { count: upcomingBy.NEXT_WEEK.length, label: "Next week", value: "NEXT_WEEK" },
                { count: upcomingBy.MONTH.length, label: "This month", value: "MONTH" },
              ]}
              value={range}
            >
              {cards}
            </FilteredQueue>
          ) : (
            <View style={{ gap: spacing.md }}>
              {loading ? null : (
                <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  <CountPill
                    count={tab === "today" ? comingToday : list.length}
                    kind={tab === "missed" ? "missed" : undefined}
                    noun={tab === "today" ? ["visit today", "visits today"] : ["visit", "visits"]}
                  />
                  {tab === "today" && slotsCompleted > 0 ? (
                    <SlotsCompletedPill all={allSlotsCompleted} count={slotsCompleted} />
                  ) : null}
                </View>
              )}
              {cards}
            </View>
          )}
        </View>
      ) : null}

      {/* The space the list keeps at its foot for the card below: the card
          itself, unseen and untouchable, so the space is exactly its size
          whatever the font scale. */}
      {showEarlierCard && !loading ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ opacity: 0 }}
        >
          {earlierCard}
        </View>
      ) : null}

      {sheets}
    </ScreenScrollView>
    {/* The slots that have ended, behind one card (user, 2026-10-04). Fixed
        to the bottom of the screen, on a strip of the page's own colour so
        the list passes under it. */}
    {showEarlierCard && !loading ? (
      <View
        pointerEvents="box-none"
        style={{
          backgroundColor: colors.background,
          bottom: 0,
          left: 0,
          paddingBottom: insets.bottom + EARLIER_CARD_GAP,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          position: "absolute",
          right: 0,
        }}
      >
        {earlierCard}
      </View>
    ) : null}
    </>
  );
}

/**
 * One visit. It shows data and View enquiry, never Manage (user, 2026-10-04).
 * Today's cards add what the door needs: Mark attendance while the slot is on,
 * the visit form once they are in, and for the owner a missed check-in after it.
 */
function VisitCardView({
  currentUserId,
  now,
  onComplete,
  onMarkAttendance,
  onMissedCheckIn,
  onViewEnquiry,
  showSlot = false,
  tab,
  viewerIsOwner,
  visit,
}: {
  /** Who is reading, so the one who checked a visitor in is told "you". */
  currentUserId: string | null;
  /** The time now, re-read on a timer, so the buttons follow the slot. */
  now: number;
  onComplete?: () => void;
  onMarkAttendance?: () => void;
  onMissedCheckIn?: () => void;
  onViewEnquiry: () => void;
  /** Says the slot under the name: on Earlier today, where no slot heading stands over the card. */
  showSlot?: boolean;
  tab: Tab;
  viewerIsOwner: boolean;
  visit: VisitCard;
}) {
  const { colors, fonts, type } = useTheme();
  const scheduled = visit.state === "SCHEDULED";
  const visited = visit.state === "VISITED";
  // Left behind on the day it was moved off: where it went, and nothing to do.
  const rescheduled = visit.state === "RESCHEDULED";
  const slotStarted = now >= Date.parse(visit.slotStartsAt);
  const slotEnded = now > Date.parse(visit.slotEndsAt);
  const onToday = tab === "today";
  // At the door, from the start of the slot until the day is over: someone
  // who turns up late still has their pass (user, 2026-10-04).
  const canMark = onToday && scheduled && slotStarted;
  // Nobody scanned them and the slot is over: No visit at midnight, unless the owner marks it.
  const unmarked = onToday && scheduled && slotEnded;
  const visitHandledBy =
    visit.checkedInByUserId && visit.checkedInByUserId === currentUserId ? "you" : visit.checkedInByName ?? null;

  return (
    <Card style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {/* Solid, as on the enquiry's own card (user, 2026-10-04). */}
        <GhostIcon color={colors.ink} fill={colors.ink} icon={User} size={22} />
        <GhostText
          ghostWidth="50%"
          numberOfLines={1}
          style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }}
        >
          {visit.prospectName ?? "Visitor"}
        </GhostText>
        {/* Where the visit stands, large, beside the name (user, 2026-10-04).
            Today only: on the other tabs the tab itself says it. */}
        {onToday ? <VisitStateChip {...todayStatus(visit, now)} /> : null}
      </View>
      {/* No rule under the name (user, 2026-10-04): the pills follow it directly. */}

      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {showSlot ? <TagPill icon={Clock} label={formatSlotRange(visit.slotStart, visit.slotEnd)} /> : null}
        {tab === "missed" ? (
          <TagPill icon={CalendarX} iconColor={colors.danger} label={`No visit ${daysAgo(visit.noVisitAt ?? visit.slotEndsAt)}`} />
        ) : null}
        {/* Not on Today, where the slot's own heading gives the time. */}
        {onToday ? null : (
          <GhostPill height={18} width={120}>
            <TagPill icon={CalendarCheck} iconColor={colors.successText} label={formatVisitShort(visit.date, visit.slotStart)} />
          </GhostPill>
        )}
        {rescheduled && visit.rescheduledToDate && visit.rescheduledToSlotStart ? (
          <TagPill
            icon={CalendarCheck}
            iconColor={colors.successText}
            label={`Moved to ${formatVisitShort(visit.rescheduledToDate, visit.rescheduledToSlotStart)}`}
          />
        ) : null}
        <GhostPill height={18} width={84}>
          <TagPill label={visit.referenceCode} />
        </GhostPill>
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
        {/* Whoever checked them in handled the visit (user, 2026-10-04). Who
            handles its enquiry is on the enquiry's own card, behind View enquiry. */}
        {visited && visitHandledBy && visit.checkInMethod !== "OWNER" ? (
          <TagPill icon={UserCheck} label={`Visit handled by ${visitHandledBy}`} />
        ) : null}
        {/* They said "I'm on my way" (user, 2026-10-04). */}
        {scheduled && visit.runningLateAt ? (
          <TagPill icon={Clock} iconColor={colors.danger} label={`Running late, said ${clockTime(visit.runningLateAt)}`} />
        ) : null}
      </View>

      {/* What the visit form recorded, in one grey box under the tags: a form
          mark at the start, then each thing as its own point in a heavier
          grey (user, 2026-10-04). Only what was filled in: the form is optional. */}
      {visited && (visit.partySize || visit.impression) ? (
        <View
          style={{
            alignItems: "flex-start",
            backgroundColor: colors.neutralSoft,
            borderCurve: "continuous",
            borderRadius: radii.card,
            flexDirection: "row",
            gap: spacing.sm,
            marginTop: 2,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={{ paddingTop: 1 }}>
            <ClipboardPenLine color={colors.neutralText} size={15} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            {visitFormPoints(visit).map((point) => (
              <View key={point} style={{ alignItems: "flex-start", flexDirection: "row", gap: 5 }}>
                <Text style={{ color: colors.neutralText, fontFamily: fonts.sansSemiBold, fontSize: 12.5, lineHeight: 17 }}>
                  {"\u2022"}
                </Text>
                <Text
                  style={{ color: colors.neutralText, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 12.5, lineHeight: 17 }}
                >
                  {point}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* The yellow notice, the app's own (user, 2026-10-04). It was loose red
          text, then a red box: neither was the notice bar. */}
      {unmarked ? (
        <View style={{ marginTop: 2 }}>
          <NoticeBar
            message="Their pass can still be scanned today. It will be marked No visit after midnight."
            title="Not checked in"
            tone="warning"
          />
        </View>
      ) : null}

      {/* Missed cards carry nothing to press: a missed visit is the visitor's to move.
          The buttons stand clear of the grey pills above them (user, 2026-10-04). */}
      {tab === "missed" ? null : (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <GhostBlock>
              {/* A grey border and blue text (user, 2026-10-04). */}
              <ActionButton compact label="View enquiry" onPress={onViewEnquiry} variant="primaryQuiet" />
            </GhostBlock>
          </View>
          {canMark && onMarkAttendance ? (
            <View style={{ flex: 1 }}>
              <ActionButton compact label="Mark attendance" onPress={onMarkAttendance} />
            </View>
          ) : null}
          {onToday && visited && visit.viewerFillsForm && onComplete ? (
            <View style={{ flex: 1 }}>
              <ActionButton
                compact
                label={visit.formCompleted ? "Edit visit form" : "Complete visit"}
                onPress={onComplete}
                variant={visit.formCompleted ? "outline" : "primary"}
              />
            </View>
          ) : null}
        </View>
      )}
      {/* The owner's own, on a row to itself under the other two: three
          buttons side by side do not fit a phone. */}
      {unmarked && viewerIsOwner && onMissedCheckIn ? (
        // The soft grey edge, not the ink outline (user, 2026-10-04).
        <ActionButton compact label="Missed check-in" onPress={onMissedCheckIn} variant="secondary" />
      ) : null}
    </Card>
  );
}

/** "2 people came for this visit" and "They liked the property", one point each, from whatever the visit form holds. */
function visitFormPoints(visit: VisitCard) {
  const points: string[] = [];
  if (visit.partySize) {
    points.push(`${visit.partySize === 1 ? "1 person" : `${visit.partySize} people`} came for this visit`);
  }
  if (visit.impression) {
    points.push(
      visit.impression === "LIKED"
        ? "They liked the property"
        : visit.impression === "OKAY"
          ? "They were okay with the property"
          : "They did not like the property",
    );
  }
  return points;
}

/**
 * Where one of today's visits stands, for the chip beside its name (user,
 * 2026-10-04). By the clock until someone checks them in:
 *
 * <ul>
 * <li>Upcoming: their slot has not started.</li>
 * <li>Started: it has, and less than half of it has gone.</li>
 * <li>Pending, in amber: half of it has gone and they have not arrived. Late,
 * once they have said they are on their way.</li>
 * <li>Pending, in red: the slot ended with nobody checking them in. It read
 * "Pending review" until the user asked for the one word (2026-10-04). Their
 * pass can still be scanned, the owner can mark a missed check-in, and at
 * midnight it becomes No visit.</li>
 * <li>Visited: checked in. Late visit, when that was past half the slot,
 * whether or not they said they were running late.</li>
 * <li>Completed: whoever checked them in has filled the visit form.</li>
 * <li>Rescheduled: moved to another day.</li>
 * </ul>
 */
function todayStatus(visit: VisitCard, now: number): VisitStatus {
  if (visit.state === "RESCHEDULED") {
    return { icon: CalendarClock, label: "Rescheduled", tone: "muted" };
  }
  if (visit.state === "VISITED") {
    if (visit.formCompleted) {
      return { icon: CheckCheck, label: "Completed", tone: "green" };
    }
    return visit.late
      ? { icon: ClockAlert, label: "Late visit", tone: "amber" }
      : { icon: CircleCheck, label: "Visited", tone: "green" };
  }
  const startsAt = Date.parse(visit.slotStartsAt);
  const endsAt = Date.parse(visit.slotEndsAt);
  if (now < startsAt) {
    return { icon: Clock, label: "Upcoming", tone: "muted" };
  }
  if (now > endsAt) {
    return { icon: CircleAlert, label: "Pending", tone: "red" };
  }
  if (visit.runningLateAt) {
    return { icon: AlarmClock, label: "Late", tone: "red" };
  }
  return now >= startsAt + (endsAt - startsAt) / 2
    ? { icon: Hourglass, label: "Pending", tone: "amber" }
    : { icon: CirclePlay, label: "Started", tone: "blue" };
}

/**
 * A slot nobody has booked: the screen's own mark, small, and a line (user,
 * 2026-10-04). Roomy by default, so an empty slot stands clear of whatever
 * comes after it, the Earlier today card included.
 */
function EmptySlot() {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl }}>
      <PropertyVisitsIcon size={36} />
      <Text style={[type.caption, { color: colors.muted }]}>No visits in this slot</Text>
    </View>
  );
}

type Slot = { key: string; slotEnd: string; slotEndsAt: string; slotStart: string; slotStartsAt: string; visits: VisitCard[] };

/**
 * Every slot of today, in the order the day runs, with today's visits under
 * theirs. The property's own slots come first, visits or not (user,
 * 2026-10-04). A visit in a slot the property no longer offers still gets a
 * heading: a visit keeps the times it was booked with.
 */
function groupBySlot(visits: VisitCard[], offered: PropertyVisits["todaySlots"]): Slot[] {
  const slots = new Map<string, Slot>();
  for (const slot of offered) {
    slots.set(`${slot.start}-${slot.end}`, {
      key: `${slot.start}-${slot.end}`,
      slotEnd: slot.end,
      slotEndsAt: slot.endsAt,
      slotStart: slot.start,
      slotStartsAt: slot.startsAt,
      visits: [],
    });
  }
  for (const visit of visits) {
    const key = `${visit.slotStart}-${visit.slotEnd}`;
    const slot = slots.get(key);
    if (slot) {
      slot.visits.push(visit);
    } else {
      slots.set(key, {
        key,
        slotEnd: visit.slotEnd,
        slotEndsAt: visit.slotEndsAt,
        slotStart: visit.slotStart,
        slotStartsAt: visit.slotStartsAt,
        visits: [visit],
      });
    }
  }
  return [...slots.values()].sort((left, right) => left.slotStart.localeCompare(right.slotStart));
}

/**
 * One of today's slots: its heading on a grey band, and its visits.
 *
 * <p>Only slots still to come or on now are listed, the one on now first, so
 * the pill is Upcoming (pale yellow, brown text) or Ongoing (pale green, dark
 * green text), with no border and no dot, the size of a visit's chip. A slot
 * that has ended leaves the list, and its visits move to Earlier today (user,
 * 2026-10-04).
 */
function SlotSection({ children, now, slot }: { children: ReactNode; now: number; slot: Slot }) {
  const { colors, fonts, type } = useTheme();
  const coming = slot.visits.filter((visit) => visit.state !== "RESCHEDULED").length;
  const ongoing = now >= Date.parse(slot.slotStartsAt);
  const pill = ongoing
    ? { background: colors.successSoft, label: "Ongoing", text: colors.successText }
    : { background: colors.warningSoft, label: "Upcoming", text: colors.warningText };

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.neutralSoft,
          borderCurve: "continuous",
          borderRadius: radii.card,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {formatSlotRange(slot.slotStart, slot.slotEnd)}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {coming === 0 ? "No visitors" : coming === 1 ? "1 visitor" : `${coming} visitors`}
          </Text>
        </View>
        {/* No border, and the visit chips' own size (user, 2026-10-04). */}
        <View
          style={{
            backgroundColor: pill.background,
            borderRadius: 999,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: pill.text, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{pill.label}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * "2 slots have completed", beside the day's count on Today (user,
 * 2026-10-04), and "All slots have completed" once every one of the day's
 * slots is over. Grey, in the count pill's own shape: it is about what is over.
 */
function SlotsCompletedPill({ all, count }: { all: boolean; count: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: colors.neutralText, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {all ? "All slots have completed" : count === 1 ? "1 slot has completed" : `${count} slots have completed`}
      </Text>
    </View>
  );
}

/**
 * Earlier today: the visits of the slots that have ended, behind one card
 * (user, 2026-10-04). It sits under the slots where the screen ends, and
 * rides the bottom of the screen while that is out of view. Tapping it opens
 * the list as a screen of its own.
 */
function EarlierTodayCard({
  count,
  onPress,
  pendingReview,
}: {
  count: number;
  onPress: () => void;
  /** How many of them nobody was checked in for: the ones still asking for something. */
  pendingReview: number;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={`Earlier today, ${count === 0 ? "no visits yet" : count === 1 ? "1 visit" : `${count} visits`}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        // Pale yellow with brown text, the Upcoming pill's own colours, and
        // no border (user, 2026-10-04).
        backgroundColor: colors.warningSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <ClipboardList color={colors.warningText} size={22} strokeWidth={2.1} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.warningText, fontFamily: fonts.sansBold, fontSize: 16 }}>Earlier today</Text>
        {count === 0 ? (
          <Text style={[type.caption, { color: colors.warningText }]}>Visits move here when their slot ends</Text>
        ) : (
          // How many, and how many still ask for something, as two points
          // rather than one run-on line (user, 2026-10-04).
          <View style={{ gap: 1 }}>
            <EarlierPoint
              color={colors.warningText}
              text={count === 1 ? "1 visit from a slot that has ended" : `${count} visits from slots that have ended`}
            />
            {/* "Pending review" here, in full: only the chip on a card is the one word (user, 2026-10-04). */}
            {pendingReview > 0 ? <EarlierPoint color={colors.danger} text={`${pendingReview} pending review`} /> : null}
          </View>
        )}
      </View>
      <ChevronRight color={colors.warningText} size={18} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}

/** One bulleted line on the Earlier today card. */
function EarlierPoint({ color, text }: { color: string; text: string }) {
  const { type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 5 }}>
      <Text style={[type.caption, { color }]}>{"•"}</Text>
      <Text style={[type.caption, { color, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/**
 * The last day of this week (Sunday), of next week, and of this month, as
 * YYYY-MM-DD in India. Visit dates are calendar days, so they are compared as
 * text.
 */
function endsOfWeekAndMonth() {
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA }).format(new Date());
  const [year, month, day] = todayIso.split("-").map(Number);
  // Built from parts, in UTC, only to do calendar arithmetic on the date.
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const weekEnd = new Date(date);
  weekEnd.setUTCDate(date.getUTCDate() + ((7 - weekday) % 7));
  const nextWeekEnd = new Date(weekEnd);
  nextWeekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { monthEnd: iso(monthEnd), nextWeekEnd: iso(nextWeekEnd), weekEnd: iso(weekEnd) };
}

function noop() {}

/** Sample cards for the loading state. Never shown as text: every leaf is a Ghost. */
const SAMPLE: VisitCard[] = ["sample-1", "sample-2"].map((visitId) => ({
  checkInMethod: null,
  checkedInAt: null,
  checkedInByName: null,
  checkedInByUserId: null,
  date: "2026-10-07",
  departedAt: null,
  enquiryId: "sample-enquiry",
  formCompleted: false,
  handlerName: "Sample manager",
  handlerUserId: "sample-handler",
  impression: null,
  late: null,
  noVisitAt: null,
  partySize: null,
  placedAt: "2026-10-01T00:00:00Z",
  rescheduledToDate: null,
  rescheduledToSlotStart: null,
  runningLateAt: null,
  prospectName: "Sample visitor",
  referenceCode: "VIS-0000",
  slotEnd: "12:00:00",
  slotEndsAt: "2026-10-07T06:30:00Z",
  slotStart: "11:00:00",
  slotStartsAt: "2026-10-07T05:30:00Z",
  state: "SCHEDULED",
  version: 0,
  viewerFillsForm: false,
  visitId,
}));
