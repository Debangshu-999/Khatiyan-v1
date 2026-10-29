import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlarmClock,
  CalendarClock,
  CalendarDays,
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
  UserCheck,
  UserPlus,
} from "lucide-react-native";

import { AddRecordCard } from "@/components/add-record-card";
import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilteredQueue } from "@/components/filtered-queue";
import { ListEnd } from "@/components/list-end";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectionTabs } from "@/components/selection-tabs";
import { GhostBlock, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { CountPill, InitialsAvatar, StateChip, clockTime, daysAgo } from "@/features/enquiry/enquiry-tags";
import { formatSlotRange, formatVisitShort } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { PropertyVisitsIcon } from "@/features/property/property-control-icons";
import { CompleteVisitSheet } from "@/features/visits/complete-visit-sheet";
import { VisitStateChip, type VisitStatus } from "@/features/visits/visit-state-chip";
import { MarkAttendanceSheet } from "@/features/visits/mark-attendance-sheet";
import { useNow } from "@/features/visits/visit-clock";
import { SlotStepper } from "@/features/visits/slot-stepper";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyVisitsQuery,
  useGetPropertyVisitHistoryQuery,
  useMarkMissedCheckInMutation,
  type PropertyVisits,
  type VisitCard,
  type VisitHistoryStatus,
} from "@/store/services/enquiry-chat-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { EnquiryCardSheet } from "./owner-enquiries";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

type Tab = "today" | "upcoming" | "missed" | "history";
type Range = "ALL" | "WEEK" | "NEXT_WEEK" | "MONTH";
/** How many cards a list tab draws before the next screenful (user, 2026-10-29: infinite scroll). */
const VISIT_PAGE_SIZE = 10;

/** How far back the Missed tab looks (user, 2026-10-18). Its own daily review: no screen of its own. */
type MissedRange = "ALL" | "TODAY" | "WEEK" | "MONTH" | "LAST_30";

const INDIA = "Asia/Kolkata";

/**
 * The space under the Earlier today card, riding the bottom of the screen or
 * resting under the slots. One number for both, or the card would shift as it
 * changes over. Tightened twice at the user's asking (2026-10-04).
 */
const EARLIER_CARD_GAP = spacing.md;

const HISTORY_HEADINGS: Record<VisitHistoryStatus, string> = {
  ALL: "All past visits",
  CANCELLED: "Cancelled",
  NO_VISIT: "No visit",
  VISITED: "Visited",
};

const MISSED_HEADINGS: Record<MissedRange, string> = {
  ALL: "All missed visits",
  LAST_30: "Missed in the last 30 days",
  MONTH: "Missed this month",
  TODAY: "Missed today",
  WEEK: "Missed this week",
};

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
  const [historyPage, setHistoryPage] = useState(0);
  // All by default (user, 2026-10-19).
  const [historyStatus, setHistoryStatus] = useState<VisitHistoryStatus>("ALL");
  const historyQuery = useGetPropertyVisitHistoryQuery({ propertyId: property?.id ?? "", page: historyPage, status: historyStatus }, {
    skip: !property || tab !== "history" || view !== "main",
    refetchOnMountOrArgChange: true,
  });
  const history = historyQuery.currentData;
  // Infinite scroll on every list tab (user, 2026-10-29): History's pages are
  // kept as they arrive, for its status and property only.
  const historyKey = `${property?.id ?? ""}:${historyStatus}`;
  const [historyPages, setHistoryPages] = useState<{ key: string; items: VisitCard[] }>({ items: [], key: "" });
  useEffect(() => {
    if (!history) return;
    setHistoryPages((previous) => {
      const base = previous.key === historyKey && history.page > 0 ? previous.items : [];
      const kept = new Set(base.map((visit) => visit.visitId));
      return { items: [...base, ...history.items.filter((visit) => !kept.has(visit.visitId))], key: historyKey };
    });
  }, [history, historyKey]);
  const historyItems = historyPages.key === historyKey ? historyPages.items : history?.items ?? [];
  useEffect(() => setHistoryPage(0), [property?.id, historyStatus]);
  const [range, setRange] = useState<Range>("ALL");
  // Today first: the Missed tab is where the day's no-shows are reviewed (user, 2026-10-18). With none
  // today it opens on All instead, so missed visits from earlier days are never hidden (user, 2026-10-27).
  const [chosenMissedRange, setMissedRange] = useState<MissedRange | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [missedCheckInId, setMissedCheckInId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The slot shown on Today. None chosen means the first one left, the slot on
  // now or the next to come, so the screen always opens there (user, 2026-10-19).
  const [slotKey, setSlotKey] = useState<string | null>(null);
  // Where the empty slot's state goes: the space between the slot bar's foot and the top of the
  // fixed strip holding Record external visit, measured on the window (user, 2026-10-19). Measured
  // rather than stretched: a stretched list counted as too tall to fit and scrolled with nothing in
  // it, and on a phone ran on behind the strip, so its middle sat low.
  const rootRef = useRef<View>(null);
  const stepperRef = useRef<View>(null);
  const stripRef = useRef<View>(null);
  const [emptySpace, setEmptySpace] = useState<{ height: number; top: number } | null>(null);
  const measureEmptySpace = useCallback(() => {
    rootRef.current?.measureInWindow((_rootX, rootY) => {
      stepperRef.current?.measureInWindow((_x, stepperY, _width, stepperHeight) => {
        stripRef.current?.measureInWindow((_stripX, stripY) => {
          const top = stepperY + stepperHeight - rootY;
          const height = stripY - stepperY - stepperHeight;
          if (height > 0) setEmptySpace((last) => (last && last.top === top && last.height === height ? last : { height, top }));
        });
      });
    });
  }, []);
  // Every tab counts what it lists (user, 2026-10-29). Upcoming and Missed
  // counted only what was new since the tab was last seen (2026-10-04), so a
  // tab holding two visits showed no count once it had been opened.
  function changeTab(next: Tab) {
    setTab(next);
  }
  // Upcoming and Missed arrive whole and are drawn a screenful at a time.
  const [shown, setShown] = useState(VISIT_PAGE_SIZE);
  // History's total, for its tab's count, whichever tab is open: page 0 of all
  // statuses, the tab's own first page when it opens on All.
  const historyCountQuery = useGetPropertyVisitHistoryQuery({ propertyId: property?.id ?? "", page: 0, status: "ALL" }, {
    skip: !property || view !== "main",
  });

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
  // Newest first, so today's missed visits lead the list (user, 2026-10-18).
  const missed = useMemo(
    () => [...(visitsQuery.data?.missed ?? [])].sort((left, right) =>
      right.date.localeCompare(left.date) || right.slotStart.localeCompare(left.slotStart)),
    [visitsQuery.data],
  );
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

  const missedBy = useMemo(() => {
    const { last30Start, monthStart, today: todayIso, weekStart } = startsOfWeekAndMonth();
    return {
      LAST_30: missed.filter((visit) => visit.date >= last30Start),
      MONTH: missed.filter((visit) => visit.date >= monthStart),
      TODAY: missed.filter((visit) => visit.date === todayIso),
      WEEK: missed.filter((visit) => visit.date >= weekStart),
      ALL: missed,
    } satisfies Record<MissedRange, VisitCard[]>;
  }, [missed]);
  const missedRange: MissedRange = chosenMissedRange ?? (missedBy.TODAY.length > 0 ? "TODAY" : "ALL");

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

  const loading = tab === "history"
    ? historyQuery.isFetching && !history
    : visitsQuery.isLoading && !visitsQuery.data;
  const list = tab === "today" ? today : tab === "upcoming" ? upcomingBy[range] : tab === "history" ? historyItems : missedBy[missedRange];
  useEffect(() => setShown(VISIT_PAGE_SIZE), [tab, range, missedRange, property?.id]);
  const visibleList = tab === "history" ? list : list.slice(0, shown);
  const moreToShow = tab === "history" ? Boolean(history?.hasNext) : list.length > shown;
  function loadMore() {
    if (tab === "history") {
      if (history?.hasNext && !historyQuery.isFetching) setHistoryPage(history.page + 1);
    } else if (tab !== "today" && list.length > shown) {
      setShown((count) => count + VISIT_PAGE_SIZE);
    }
  }
  // The tab's own badge counts only what the tab still lists: visits in a slot
  // that is on now or still to come. It used to be the day's total, so it went
  // on saying 1 with nothing left on the tab, for a visit already attended in
  // a slot that had ended (user, 2026-10-04).
  const stillListedToday = today.filter(
    (visit) => visit.state !== "RESCHEDULED" && now <= Date.parse(visit.slotEndsAt),
  ).length;
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
  const slotIndex = Math.max(0, slots.findIndex((slot) => slot.key === slotKey));
  const shownSlot = slots[slotIndex] ?? null;
  // Always there on Today, with or without anything in it yet: it is where
  // a slot's visits will go when it ends (user, 2026-10-04).
  const showEarlierCard = view === "main" && tab === "today" && Boolean(property);

  const cards = tab === "history" && historyQuery.isError ? (
    <View style={{ gap: spacing.sm }}>
      <NoticeBar title="Unable to load history" message="Visitor history could not be loaded." tone="warning" />
      <ActionButton label="Try again" onPress={() => void historyQuery.refetch()} variant="secondary" />
    </View>
  ) : loading ? (
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
            : tab === "history"
              ? "Past visits and cancellations for this property are kept here."
              : missed.length > 0
                ? "Pick another range to see the rest."
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
            : tab === "history" ? "No visitor history yet" : "No missed visits"
      }
    />
  ) : tab === "today" && shownSlot ? (
    // One slot at a time, stepped left and right (user, 2026-10-19).
    <View style={{ gap: spacing.md }}>
      <View collapsable={false} onLayout={measureEmptySpace} ref={stepperRef}>
      <SlotStepper
        index={slotIndex}
        ongoing={now >= Date.parse(shownSlot.slotStartsAt)}
        onChange={(next) => setSlotKey(slots[next]?.key ?? null)}
        slots={slots}
        visitors={shownSlot.visits.filter((visit) => visit.state !== "RESCHEDULED").length}
      />
      </View>
      {[shownSlot].map((slot) => (
        // An empty slot draws nothing here: its empty state is laid over the screen, centred in the
        // space measured between the slot bar and Record external visit (below).
        <View key={slot.key} style={{ gap: spacing.sm }}>
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
        </View>
      ))}
    </View>
  ) : (
    <View style={{ gap: spacing.md }}>
      {visibleList.map((visit) => (
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

  // The foot of a list tab: more on the way, or the end (user, 2026-10-29).
  const listFoot = tab === "today" || loading || list.length === 0 ? null
    : moreToShow ? <ActivityIndicator color={colors.muted} style={{ padding: spacing.sm }} />
    : <ListEnd />;

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

  // Record external visit above Earlier today (user, 2026-10-19), for the slot
  // shown. The form starts on that slot and can pick another of the day's.
  const earlierCard = (
    <View style={{ gap: spacing.sm }}>
      <RecordExternalVisitCard
        onPress={() => router.push(shownSlot
          ? { params: { slot: shownSlot.key }, pathname: "/owner-external-visit" }
          : "/owner-external-visit")}
        slot={shownSlot}
      />
      <EarlierTodayCard
        count={earlier.length}
        onPress={() => router.push("/owner-visits-earlier")}
        pendingReview={pendingReview}
      />
    </View>
  );

  return (
    <View collapsable={false} onLayout={measureEmptySpace} ref={rootRef} style={{ flex: 1 }}>
    <ScreenScrollView
      // The same gap under the space the list keeps for the card as under the
      // card itself (user, 2026-10-04): scrolled to the end, the list stops
      // just above it, with no extra space beneath.
      contentContainerStyle={{ paddingBottom: EARLIER_CARD_GAP }}
      onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
        if (contentSize.height - contentOffset.y - layoutMeasurement.height <= 240) loadMore();
      }}
      safeAreaEdges={["top", "bottom"]}
      scrollEventThrottle={64}
    >
      <ScreenHeader
        subtitle={
          property
            ? `Everyone coming to see ${property.name}, and who has arrived.`
            : "Select a property from Home first."
        }
        italicTail="Management"
        title="Visitor"
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
            compact
            distributed
            gap={0}
            // A little in from the edge, so the first and last tab's fill never touch the device's
            // edge (user, 2026-10-19). With no gap the row's own inset is 0.
            horizontalPadding={spacing.sm}
            onChange={changeTab}
            options={[
              // A count on a tab that is not open only: the open one's list says it (user, 2026-10-29).
              { badge: tab === "today" ? undefined : stillListedToday, label: "Today", value: "today" },
              { badge: tab === "upcoming" ? undefined : upcoming.length, label: "Upcoming", value: "upcoming" },
              { badge: tab === "missed" ? undefined : missed.length, label: "Missed", value: "missed" },
              { badge: tab === "history" ? undefined : historyCountQuery.currentData?.totalElements ?? 0, label: "History", value: "history" },
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
              {listFoot}
            </FilteredQueue>
          ) : tab === "missed" ? (
            <FilteredQueue<MissedRange>
              count={loading ? undefined : missedBy[missedRange].length}
              heading={MISSED_HEADINGS[missedRange]}
              headingNode={loading ? undefined : <CountPill count={missedBy[missedRange].length} kind="missed" noun={["visit", "visits"]} />}
              onChange={setMissedRange}
              options={[
                { count: missedBy.ALL.length, label: "All", value: "ALL" },
                { count: missedBy.TODAY.length, label: "Today", value: "TODAY" },
                { count: missedBy.WEEK.length, label: "This week", value: "WEEK" },
                { count: missedBy.MONTH.length, label: "This month", value: "MONTH" },
                { count: missedBy.LAST_30.length, label: "Last 30 days", value: "LAST_30" },
              ]}
              value={missedRange}
            >
              {cards}
              {listFoot}
            </FilteredQueue>
          ) : tab === "history" ? (
            // A status filter, All first and by default (user, 2026-10-19). Counted on the server, so
            // only the chosen one has a number.
            <FilteredQueue<VisitHistoryStatus>
              count={loading ? undefined : history?.totalElements ?? 0}
              heading={HISTORY_HEADINGS[historyStatus]}
              headingNode={loading ? undefined : <CountPill count={history?.totalElements ?? 0} noun={["visit", "visits"]} />}
              onChange={setHistoryStatus}
              options={[
                { label: "All", value: "ALL" },
                { label: "Visited", value: "VISITED" },
                { label: "No visit", value: "NO_VISIT" },
                { label: "Cancelled", value: "CANCELLED" },
              ]}
              value={historyStatus}
            >
              {cards}
              {listFoot}
            </FilteredQueue>
          ) : (
            // Today carries no count: the slot bar says who is coming (user, 2026-10-19).
            <View style={{ gap: spacing.md }}>{cards}</View>
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
        collapsable={false}
        onLayout={measureEmptySpace}
        pointerEvents="box-none"
        ref={stripRef}
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
    {tab === "today" && view === "main" && !loading && shownSlot && shownSlot.visits.length === 0 && emptySpace ? (
      <View
        pointerEvents="none"
        style={{ height: emptySpace.height, justifyContent: "center", left: 0, position: "absolute", right: 0, top: emptySpace.top }}
      >
        <EmptySlot />
      </View>
    ) : null}
    </View>
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

  // The line under the name: the pass's code, and when, where no slot heading
  // above the card says it already.
  const when = showSlot
    ? formatSlotRange(visit.slotStart, visit.slotEnd)
    : onToday
      ? null
      : formatVisitShort(visit.date, visit.slotStart);
  const movedTo =
    rescheduled && visit.rescheduledToDate && visit.rescheduledToSlotStart
      ? formatVisitShort(visit.rescheduledToDate, visit.rescheduledToSlotStart)
      : null;
  const checkedIn = visited && visit.checkedInAt ? visit.checkedInAt : null;
  // Whoever checked them in handled the visit (user, 2026-10-04). Who handles
  // its enquiry is on the enquiry's own card, behind View enquiry.
  const handledBy = visited && visitHandledBy && visit.checkInMethod !== "OWNER" ? visitHandledBy : null;
  // They said "I'm on my way" (user, 2026-10-04).
  const runningLate = scheduled ? visit.runningLateAt : null;
  const missedTab = tab === "missed";
  const hasStates = Boolean(missedTab || movedTo || runningLate || visit.external);
  const formPoints = visited ? visitFormPoints(visit) : [];
  // Missed cards carry nothing to press: a missed visit is the visitor's to move.
  const ownerMissedCheckIn = unmarked && viewerIsOwner && onMissedCheckIn;
  const status = todayStatus(visit, now);
  // Still to come today: no Upcoming chip, the day says it already, and View enquiry, its one
  // action, beside the name instead of on a row of its own (user, 2026-10-19).
  const upcomingToday = onToday && !visit.external && status.label === "Upcoming";
  // An external visit has no enquiry to view and was recorded once it was over: nothing to press.
  const hasActions = !visit.external && !upcomingToday && tab !== "history" && (!missedTab || Boolean(ownerMissedCheckIn));

  return (
    <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        {/* Who is coming, and their pass, with where the visit stands on a grey
            pill beside the name. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <InitialsAvatar name={visit.prospectName} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <GhostText
                ghostWidth="60%"
                numberOfLines={1}
                style={[type.display, { color: colors.ink, flex: 1, fontSize: 18, lineHeight: 23 }]}
              >
                {cardName(visit.prospectName ?? "Visitor")}
              </GhostText>
              {/* Every card says where its visit stands, except an upcoming one on Today (user, 2026-10-19). */}
              {(onToday && !upcomingToday) || tab === "upcoming" || tab === "history" ? <VisitStateChip pill {...status} /> : null}
            </View>
            <GhostText ghostWidth="75%" style={[type.caption, { color: colors.muted }]}>
              {visit.referenceCode}
            </GhostText>
            {when ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                <CalendarDays color={colors.muted} size={13} />
                <GhostText ghostWidth="75%" style={[type.caption, { color: colors.muted, flex: 1 }]}>
                  {when}
                </GhostText>
              </View>
            ) : null}
          </View>
          {upcomingToday ? (
            <View>
              <GhostBlock>
                <ActionButton compact label="View enquiry" onPress={onViewEnquiry} variant="primaryQuiet" />
              </GhostBlock>
            </View>
          ) : null}
        </View>

        {/* Each state in its own colour, as on the enquiry's card. */}
        {hasStates ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {missedTab ? (
              // Dated from the visit's own slot, not from when the night sweep marked it (user, 2026-10-27):
              // a visit missed on the 20th marked on the 27th read "No visit today".
              <StateChip icon={CalendarX} label={`No visit ${daysAgo(visit.slotEndsAt)}`} tone="danger" />
            ) : null}
            {movedTo ? <StateChip icon={CalendarClock} label={`Moved to ${movedTo}`} tone="neutral" /> : null}
            {runningLate ? (
              <StateChip icon={Clock} label={`Running late, said ${clockTime(runningLate)}`} tone="danger" />
            ) : null}
            {/* Recorded by the property, a walk-in with no account (user, 2026-10-19). */}
            {visit.external ? <StateChip icon={UserPlus} label="External visit" tone="neutral" /> : null}
          </View>
        ) : null}

        {/* Checked in and who handled it, side by side across the card, a label over each value with a rule
            between (user, 2026-10-17), as the lead card's facts are. */}
        {checkedIn ? (
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                <CheckCircle2 color={visit.late ? colors.warningText : colors.successText} size={14} strokeWidth={2.2} />
                {/* "Marked attended - by owner" on the one line (user, 2026-10-19). */}
                <FitText numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                  {visit.checkInMethod === "OWNER" ? "Marked attended" : "Checked in"}
                  {visit.checkInMethod === "OWNER" ? <Text style={{ color: colors.successText, fontFamily: fonts.sansBold }}> - by owner</Text> : null}
                </FitText>
              </View>
              {visit.checkInMethod === "OWNER" ? null : (
                <FitText numberOfLines={1} style={[type.caption, { color: visit.late ? colors.warningText : colors.successText, fontFamily: fonts.sansBold }]}>
                  {`${clockTime(checkedIn)}, ${visit.late ? "late" : "on time"}`}
                </FitText>
              )}
            </View>
            {handledBy ? <>
              <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: spacing.md, width: 1 }} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                  <UserCheck color={colors.muted} size={14} strokeWidth={2.2} />
                  <FitText numberOfLines={1} style={[type.caption, { color: colors.muted }]}>Visit handled by</FitText>
                </View>
                <FitText numberOfLines={1} style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold }]}>
                  {handledBy === "you" ? "You" : handledBy}
                </FitText>
              </View>
            </> : null}
          </View>
        ) : null}

        {/* What the visit form recorded, each thing as its own point (user,
            2026-10-04). Only what was filled in: the form is optional. */}
        {formPoints.length > 0 ? (
          <View
            style={{
              alignItems: "flex-start",
              backgroundColor: colors.neutralSoft,
              borderCurve: "continuous",
              borderRadius: radii.card,
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ paddingTop: 2 }}>
              <ClipboardPenLine color={colors.neutralText} size={15} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.neutralText, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 17 }}>
                Visit form
              </Text>
              {formPoints.map((point) => (
                <View key={point} style={{ alignItems: "flex-start", flexDirection: "row", gap: 5 }}>
                  <Text style={{ color: colors.neutralText, fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 17 }}>
                    {"•"}
                  </Text>
                  <Text
                    style={{ color: colors.neutralText, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 17 }}
                  >
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* The yellow notice, the app's own (user, 2026-10-04). */}
        {unmarked ? (
          <NoticeBar
            message="Their pass can still be scanned today. It will be marked No visit after midnight."
            title="Not checked in"
            tone="warning"
          />
        ) : null}
      </View>

      {/* The actions, under a hairline, as on the enquiry's card. */}
      {hasActions ? (
        <View
          style={{
            borderTopColor: colors.border,
            borderTopWidth: 1,
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          {missedTab ? null : (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
          {/* The owner's own, on a row to itself: three buttons side by side
              do not fit a phone. The soft grey edge (user, 2026-10-04). */}
          {ownerMissedCheckIn ? (
            <ActionButton compact label="Missed check-in" onPress={onMissedCheckIn} variant="secondary" />
          ) : null}
        </View>
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
  if (visit.state === "CANCELLED") {
    return { icon: CalendarX, label: "Cancelled", tone: "muted" };
  }
  if (visit.state === "MISSED") {
    return { icon: CalendarX, label: "No visit", tone: "red" };
  }
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
 * A slot nobody has booked: the other tabs' empty state, a size down (user,
 * 2026-10-19). Compact, with no height of its own, so the space between the
 * slot bar and Record external visit centres it.
 */
function EmptySlot() {
  return <EmptyState artworkNode={<PropertyVisitsIcon size={48} />} compact title="No visits in this slot" />;
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

/** Record external visit, over Earlier today (user, 2026-10-19), naming the slot it records into. */
function RecordExternalVisitCard({ onPress, slot }: { onPress: () => void; slot: Slot | null }) {
  return (
    <AddRecordCard
      caption={slot ? formatSlotDash(slot.slotStart, slot.slotEnd) : null}
      icon={UserPlus}
      label="Record external visit"
      onPress={onPress}
    />
  );
}

/** "9:00 am - 11:00 am", the slot bar's way of writing a slot. */
function formatSlotDash(start: string, end: string) {
  return formatSlotRange(start, end).replace(" to ", " - ");
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

/** Today, this week's Monday, the 1st of this month and 29 days ago, in India, as ISO dates. */
function startsOfWeekAndMonth() {
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA }).format(new Date());
  const [year, month, day] = todayIso.split("-").map(Number);
  // Built from parts, in UTC, only to do calendar arithmetic on the date.
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const last30Start = new Date(date);
  last30Start.setUTCDate(date.getUTCDate() - 29);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return {
    last30Start: iso(last30Start),
    monthStart: iso(new Date(Date.UTC(year, month - 1, 1))),
    today: todayIso,
    weekStart: iso(weekStart),
  };
}

function noop() {}

/** Sample cards for the loading state. Never shown as text: every leaf is a Ghost. */
const SAMPLE: VisitCard[] = ["sample-1", "sample-2"].map((visitId) => ({
  external: false,
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
