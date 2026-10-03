import { useState } from "react";
import { View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  AlertCircle,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  Info,
  MessageSquare,
  MessageSquarePlus,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilteredQueue } from "@/components/filtered-queue";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { GhostBlock, GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { EnquireFlow } from "@/features/discovery/components/enquire-action";
import {
  CardRule,
  ClosesInChip,
  CornerRibbon,
  EXPIRED_FOLD,
  CountPill,
  TagPill,
  clockTime,
  daysAgo,
} from "@/features/enquiry/enquiry-tags";
import { ManageVisitSheet } from "@/features/enquiry/manage-visit-sheet";
import { formatVisitShort } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  useChangeEnquiryMindMutation,
  useGetMyEnquiriesQuery,
  type MyEnquiryItem,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The owner's Enquiries screen uses the same artwork for its empty state. */
const ENQUIRIES_ILLUSTRATION = require("../assets/empty-states/enquiries.png");

type Filter = "OPEN" | "CLOSED" | "EXPIRED";

const FILTER_HEADINGS: Record<Filter, string> = {
  CLOSED: "Closed enquiries",
  EXPIRED: "Expired enquiries",
  OPEN: "Open enquiries",
};

/** The OPEN band and its fold. Fixed, so white text reads in dark mode too. */
const OPEN_BAND = "#059669";
const OPEN_FOLD = "#064E3B";


const DISPLAY_ZONE = "Asia/Kolkata";

/**
 * The enquiries this person raised (owner's design, 2026-10-03), opened from
 * the Account tab. A filter picks Open (waiting or answered), Closed (closed by
 * the property, with Enquire again, which raises a new enquiry) or Expired
 * (past its date, with View property). Closed and expired ones stay for 30
 * days past their date.
 */
export default function MyEnquiriesScreen() {
  const router = useGuardedRouter();
  const toast = useToast();
  const query = useGetMyEnquiriesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [enquiringAbout, setEnquiringAbout] = useState<{ propertyId: string; propertyName: string } | null>(null);
  const [changingMindId, setChangingMindId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [changeMind, changeMindState] = useChangeEnquiryMindMutation();
  const [managingVisitOf, setManagingVisitOf] = useState<MyEnquiryItem | null>(null);

  const items = query.data ?? [];
  const byFilter: Record<Filter, MyEnquiryItem[]> = {
    CLOSED: items.filter((item) => item.state === "CLOSED"),
    EXPIRED: items.filter((item) => item.state === "EXPIRED"),
    OPEN: items.filter((item) => item.state === "AWAITING_REPLY" || item.state === "ANSWERED"),
  };
  const visible = byFilter[filter];
  const changingMind = changingMindId ? items.find((item) => item.id === changingMindId) ?? null : null;

  function openChat(item: MyEnquiryItem) {
    if (item.chatThreadId) {
      router.push({ params: { threadId: item.chatThreadId, title: item.propertyName }, pathname: "/chat/[threadId]" });
    }
  }

  function viewProperty(item: MyEnquiryItem) {
    router.push({ params: { openPropertyId: item.propertyId }, pathname: "/discovery" });
  }

  /** Tells the handler they are interested again. Once only. */
  async function confirmChangedMind(item: MyEnquiryItem) {
    try {
      await changeMind({ enquiryId: item.id, version: item.version }).unwrap();
      setChangingMindId(null);
      toast.show("Your handler has been told.", "success");
    } catch (error) {
      setChangingMindId(null);
      setRefusal(errorMessage(error));
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="enquiries."
        subtitle="Manage all your property enquiries efficiently in one place."
        title="My"
      />

      <FilteredQueue
        count={query.isLoading ? undefined : visible.length}
        heading={FILTER_HEADINGS[filter]}
        // "1 open enquiry" on a pale blue pill (user, 2026-10-03).
        headingNode={query.isLoading ? undefined : <CountPill count={visible.length} kind={filter.toLowerCase()} />}
        onChange={setFilter}
        options={[
          { count: byFilter.OPEN.length, label: "Open", value: "OPEN" },
          { count: byFilter.CLOSED.length, label: "Closed", value: "CLOSED" },
          { count: byFilter.EXPIRED.length, label: "Expired", value: "EXPIRED" },
        ]}
        value={filter}
      >
        {query.isLoading && !query.data ? (
          // The real cards, drawn as their own placeholder: every line of sample
          // data is a Ghost, so none of it reads as the person's own.
          <SkeletonBoundary>
            <View style={{ gap: spacing.md }}>
              {SAMPLE.map((item) => (
                <MyEnquiryCard
                  item={item}
                  key={item.id}
                  onChangeMind={noop}
                  onManageVisit={noop}
                  onEnquireAgain={noop}
                  onOpenChat={noop}
                  onViewProperty={noop}
                />
              ))}
            </View>
          </SkeletonBoundary>
        ) : visible.length === 0 ? (
          <EmptyState
            artwork={ENQUIRIES_ILLUSTRATION}
            artworkTextGap={-6}
            description={
              filter === "OPEN"
                ? "Ask a property a question from its page in Discover."
                : filter === "CLOSED"
                  ? "Enquiries a property closes this year show here."
                  : "Enquiries that ran out this year show here."
            }
            title={filter === "OPEN" ? "No open enquiries" : filter === "CLOSED" ? "Nothing closed" : "Nothing expired"}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {visible.map((item) => (
              <MyEnquiryCard
                item={item}
                key={item.id}
                onChangeMind={() => setChangingMindId(item.id)}
                onManageVisit={() => setManagingVisitOf(item)}
                onEnquireAgain={() => setEnquiringAbout({ propertyId: item.propertyId, propertyName: item.propertyName })}
                onOpenChat={() => openChat(item)}
                onViewProperty={() => viewProperty(item)}
              />
            ))}
          </View>
        )}
      </FilteredQueue>

      {changingMind ? (
        <ConfirmDialog
          // Once only: a second Not interested closes the enquiry (user, 2026-10-03).
          bullets={[
            "This can only be done once.",
            "If this enquiry is marked not interested again, it cannot be reverted further.",
          ]}
          confirmLabel={changeMindState.isLoading ? "Sending" : "I'm interested"}
          message="Let your handler know."
          onCancel={() => setChangingMindId(null)}
          onConfirm={() => void confirmChangedMind(changingMind)}
          title="Are you interested in this property?"
        />
      ) : null}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}

      {/* Move or cancel the booked visit: the chat's own sheet (user, 2026-10-03). */}
      {managingVisitOf ? (
        <ManageVisitSheet
          enquiryId={managingVisitOf.id}
          onClose={() => setManagingVisitOf(null)}
          propertyId={managingVisitOf.propertyId}
        />
      ) : null}

      {enquiringAbout ? (
        <EnquireFlow
          onDone={() => setEnquiringAbout(null)}
          propertyId={enquiringAbout.propertyId}
          propertyName={enquiringAbout.propertyName}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function MyEnquiryCard({
  item,
  onChangeMind,
  onEnquireAgain,
  onManageVisit,
  onOpenChat,
  onViewProperty,
}: {
  item: MyEnquiryItem;
  onChangeMind: () => void;
  onManageVisit: () => void;
  onEnquireAgain: () => void;
  onOpenChat: () => void;
  onViewProperty: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const closed = item.state === "CLOSED";
  const expired = item.state === "EXPIRED";
  const open = !closed && !expired;
  const notInterested = open && Boolean(item.notInterestedClosesAt);

  return (
    <Card style={{ gap: spacing.xs, overflow: "hidden" }}>
      {/* The owner card's corner band, one for each state (user, 2026-10-03):
          OPEN in green, CLOSED in grey, EXPIRED in amber. */}
      {closed ? (
        <CornerRibbon accessibilityLabel="Closed enquiry" band={colors.muted} fold={colors.neutralText} label="CLOSED" />
      ) : expired ? (
        <CornerRibbon accessibilityLabel="Expired enquiry" band={colors.warningText} fold={EXPIRED_FOLD} label="EXPIRED" />
      ) : (
        <CornerRibbon accessibilityLabel="Open enquiry" band={OPEN_BAND} fold={OPEN_FOLD} label="OPEN" />
      )}

      {/* The property's mark, its name, and a rule under them (user, 2026-10-03). */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, paddingRight: 44 }}>
        <GhostIcon color={colors.ink} icon={HomeMark} size={24} />
        <GhostText
          ghostWidth="55%"
          numberOfLines={1}
          style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, lineHeight: 28 }}
        >
          {item.propertyName}
        </GhostText>
      </View>
      <CardRule />

      {/* When it was raised and answered, as grey tags (user, 2026-10-03). */}
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <GhostPill height={18} width={126}>
          <TagPill label={`Raised ${daysAgo(item.askedAt)}, ${clockTime(item.askedAt)}`} />
        </GhostPill>
        {item.answeredAt ? (
          <GhostPill height={18} width={96}>
            <TagPill icon={CheckCircle2} iconColor={colors.successText} label={`Answered ${daysAgo(item.answeredAt)}`} />
          </GhostPill>
        ) : null}
        {notInterested && item.notInterestedClosesAt ? <ClosesInChip closesAt={item.notInterestedClosesAt} /> : null}
        {/* When it runs out, before the visit tag, as on the owner's card
            (user, 2026-10-03). Past it, the Expired pill below says so. */}
        {!expired ? <TagPill label={`Expires ${formatDate(item.expiresAt)}`} /> : null}
        {/* Cancelled, and nothing booked since (owner's design, 2026-10-03). */}
        {item.visitCancelledAt ? (
          <TagPill icon={CalendarX} iconColor={colors.danger} iconFaded label="Visit cancelled" />
        ) : null}
        {/* The booked visit's day, date and start (user, 2026-10-03). */}
        {item.visitDate && item.visitStart ? (
          <GhostPill height={18} width={120}>
            <TagPill
              icon={CalendarCheck}
              iconColor={colors.successText}
              label={`Visit: ${formatVisitShort(item.visitDate, item.visitStart)}`}
            />
          </GhostPill>
        ) : null}
        {expired ? <TagPill label={`Expired ${formatDate(item.expiresAt)}`} /> : null}
      </View>

      {/* Their question, in a grey box behind a message mark (user, 2026-10-03). */}
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
        <View style={{ paddingTop: 2 }}>
          <GhostIcon color={colors.muted} icon={MessageSquare} size={15} strokeWidth={2.2} />
        </View>
        {/* The owner card's message face (user, 2026-10-03). */}
        <GhostText
          ghostWidth="85%"
          numberOfLines={3}
          style={[type.description, { color: colors.ink, flex: 1, fontFamily: fonts.sansSemiBold }]}
        >
          {item.message}
        </GhostText>
      </View>

      {/* Marked not interested and still open, with the way back (owner's
          design, 2026-10-03). How long it has left is the Closes in tag. */}
      {notInterested ? (
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
            This enquiry has been marked not interested by your handler as per your decision.
          </GhostText>
        </View>
      ) : null}

      {/* Behind an info icon, in the same box as the line above (user,
          2026-10-03). */}
      {closed ? (
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
            <GhostIcon color={colors.muted} icon={Info} size={15} strokeWidth={2.4} />
          </View>
          <GhostText ghostWidth="90%" style={[type.description, { color: colors.muted, flex: 1 }]}>
            This enquiry has been closed. Changed your mind? You can enquire again.
          </GhostText>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
        {closed && item.canChangeMind ? (
          // Closed as not interested, with the one reopen left: that comes
          // before a fresh enquiry (owner's rule, 2026-10-03).
          <View style={{ flex: 1 }}>
            <GhostBlock>
              <ActionButton compact label="Changed your mind?" onPress={onChangeMind} variant="secondary" />
            </GhostBlock>
          </View>
        ) : closed ? (
          // A fresh enquiry expires this one first, on the server.
          <View style={{ flex: 1 }}>
            <GhostBlock>
              <ActionButton compact icon={MessageSquarePlus} label="Enquire again" onPress={onEnquireAgain} />
            </GhostBlock>
          </View>
        ) : open && item.visitDate ? (
          // A booked visit: move it or cancel it, beside View property (user,
          // 2026-10-03). Takes Open chat's place, which is still in the Chats tab.
          <View style={{ flex: 1 }}>
            <GhostBlock>
              <ActionButton compact icon={CalendarCheck} label="Manage visit" onPress={onManageVisit} variant="secondary" />
            </GhostBlock>
          </View>
        ) : notInterested && item.canChangeMind ? (
          // Beside View property (user, 2026-10-03). Takes Open chat's place
          // while it is on offer: the chat is still in the Chats tab.
          <View style={{ flex: 1 }}>
            <GhostBlock>
              <ActionButton compact label="Changed your mind?" onPress={onChangeMind} variant="secondary" />
            </GhostBlock>
          </View>
        ) : open && item.chatThreadId ? (
          <View style={{ flex: 1 }}>
            <GhostBlock>
              <ActionButton compact icon={MessageSquare} label="Open chat" onPress={onOpenChat} variant="secondary" />
            </GhostBlock>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <GhostBlock>
            {/* Blue with white text (user, 2026-10-03). */}
            <ActionButton compact label="View property" onPress={onViewProperty} />
          </GhostBlock>
        </View>
      </View>

    </Card>
  );
}

/** The Home tab's house, solid (user, 2026-10-03), shaped like a lucide icon for GhostIcon. */
function HomeMark({ color, size }: LucideProps) {
  return <MaterialCommunityIcons color={color} name="home" size={Number(size ?? 24)} />;
}


/** "3 Oct", in India time. */
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: DISPLAY_ZONE }).format(
    new Date(value),
  );
}

function noop() {}

/** Sample cards for the loading state. Never shown as text: every leaf is a Ghost. */
const SAMPLE: MyEnquiryItem[] = [
  {
    answeredAt: "2026-10-01T06:30:00Z",
    askedAt: "2026-10-01T05:30:00Z",
    canChangeMind: false,
    chatThreadId: "sample-thread",
    closedAt: null,
    expiresAt: "2026-10-31T05:30:00Z",
    id: "sample-1",
    message: "Is a single room free from next month?",
    notInterestedClosesAt: null,
    propertyId: "sample-property-1",
    propertyName: "Sample property",
    state: "ANSWERED",
    version: 0,
    visitDate: "2026-10-07",
    visitCancelledAt: null,
    visitStart: "11:00:00",
  },
  {
    answeredAt: null,
    askedAt: "2026-10-02T05:30:00Z",
    canChangeMind: false,
    chatThreadId: null,
    closedAt: null,
    expiresAt: "2026-11-01T05:30:00Z",
    id: "sample-2",
    message: "Is food included in the rent?",
    notInterestedClosesAt: null,
    propertyId: "sample-property-2",
    propertyName: "Sample property",
    state: "AWAITING_REPLY",
    version: 0,
    visitDate: null,
    visitCancelledAt: null,
    visitStart: null,
  },
];
