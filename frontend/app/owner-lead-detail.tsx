import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CalendarDays, Clock3, Hourglass, RotateCcw } from "lucide-react-native";

import { Card } from "@/components/card";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard, SkeletonList } from "@/components/skeletons/primitives";
import { OwnerBookingStatus } from "@/features/booking/owner-booking-status";
import { BookingInfoBand } from "@/features/booking/tenant-booking-parts";
import { InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { errorMessage } from "@/features/forms/server-error";
import { LeadKindChip, LeadRepeatNote } from "@/features/lead/lead-card";
import { CLOSE_REASON_LABEL, leadBand, leadDay, leadMoment, leadTimeline, slotTime } from "@/features/lead/lead-display";
import { useLeadsProperty } from "@/features/lead/use-leads-property";
import { useRouteGate } from "@/features/owner/route-gates";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useGetLeadQuery, type Lead, type LeadBooking, type LeadDetail, type LeadEnquiry, type LeadVisit } from "@/store/services/lead-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { EnquiryCardSheet } from "./owner-enquiries";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

/**
 * One lead with everything gathered under it (user's design, 2026-10-17):
 * laid out as booking details are, compact cards for the person, the
 * enquiries, the visit and the booking, whichever it has, then the timeline.
 *
 * <p>Nothing on a lead is edited here. Follow up answers its enquiry with the
 * Enquiries screen's own sheets, and View booking opens the booking.
 */
export default function OwnerLeadDetailScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { colors } = useTheme();
  const router = useGuardedRouter();
  const scope = useLeadsProperty();
  const query = useGetLeadQuery(leadId ?? "", { skip: !leadId, refetchOnFocus: true, refetchOnMountOrArgChange: true });
  const detail = query.currentData;
  const lead = detail?.lead;
  const [footerHeight, setFooterHeight] = useState(PINNED_FOOTER_CLEARANCE);
  const [followingUp, setFollowingUp] = useState(false);
  const [pendingChat, setPendingChat] = useState<{ threadId: string; title: string } | null>(null);
  const { dialog, gate } = useRouteGate(lead?.propertyId);
  const canFollowUp = Boolean(lead?.followUpEnquiryId && lead.viewerMayFollowUp);

  useEffect(() => {
    if (!pendingChat || followingUp) return;
    setPendingChat(null);
    router.push({ params: { threadId: pendingChat.threadId, title: pendingChat.title }, pathname: "/chat/[threadId]" });
  }, [followingUp, pendingChat, router]);

  function openBooking(booking: LeadBooking) {
    if (!lead) return;
    gate("/owner-booking-detail", () => router.push({ pathname: "/owner-booking-detail", params: { propertyId: lead.propertyId, requestId: booking.id } }));
  }

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingBottom: canFollowUp ? footerHeight + spacing.lg : spacing.xl }} onRefresh={() => void query.refetch()}>
      <ScreenHeader title="Lead" italicTail="details." subtitle={lead ? `${lead.prospectName ?? "Someone"}${scope.property ? ` at ${scope.property.name}` : ""}.` : "Everything this lead has, in one place."} />
      {!detail && !query.isError ? <View accessibilityLabel="Loading lead details" style={{ gap: spacing.md }}><SkeletonCard /><SkeletonList rows={3} body={2} /></View> : null}
      {query.isError ? <>
        <NoticeBar tone="danger" title="Could not load this lead" message={errorMessage(query.error)} />
        <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void query.refetch()} variant="secondary" /></View>
      </> : null}
      {detail ? <LeadDetails detail={detail} onOpenBooking={openBooking} /> : null}
    </ScreenScrollView>
    {lead && canFollowUp ? <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      <View style={{ flexDirection: "row" }}><ActionButton label="Follow up" onPress={() => setFollowingUp(true)} /></View>
    </PinnedFooter> : null}
    {lead && followingUp && lead.followUpEnquiryId ? <EnquiryCardSheet
      enquiryId={lead.followUpEnquiryId}
      onClose={() => setFollowingUp(false)}
      onOpenChat={(chat) => { setFollowingUp(false); setPendingChat(chat); }}
      propertyId={lead.propertyId}
      respondFirst
    /> : null}
    {dialog}
  </View>;
}

function LeadDetails({ detail, onOpenBooking }: { detail: LeadDetail; onOpenBooking: (booking: LeadBooking) => void }) {
  const { colors, fonts, type } = useTheme();
  const { lead } = detail;
  const heading = [type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }];
  const cold = lead.goingCold ? leadBand(lead) : null;
  const timeline = leadTimeline(detail);
  // Booked straight from the property page (user, 2026-10-17): what it never had reads as not available.
  const direct = directOrigin(detail);

  return <>
    <Card style={{ gap: spacing.xs, padding: spacing.md, paddingBottom: lead.handlerName ? spacing.sm : spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text style={[type.description, { color: colors.muted }]}>Ref</Text>
          <FitText selectable numberOfLines={1} minimumFontScale={0.65} style={[type.display, { color: colors.ink, fontSize: 21 }]}>{lead.referenceCode}</FitText>
        </View>
        <LeadKindChip kind={lead.kind} />
      </View>
      {lead.handlerName ? <Text style={[type.description, { color: colors.muted }]}>Handled by {lead.handlerName}</Text> : null}
      {lead.closeReason && lead.kind !== "CONVERTED" ? <Text style={[type.description, { color: colors.muted }]}>Ended: {CLOSE_REASON_LABEL[lead.closeReason]}</Text> : null}
    </Card>

    {cold ? <BookingInfoBand icon={Hourglass} iconGap={8} iconInset={12} tone="warning">
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>Going cold</Text>
      <Text style={[type.description, { color: colors.muted }]}>{cold.text}{cold.strong ? ` ${cold.strong}` : ""}</Text>
    </BookingInfoBand> : null}

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>Person</Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <InitialsAvatar name={lead.prospectName} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <FitText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>{cardName(lead.prospectName ?? "Someone")}</FitText>
          {/* Contact details are the enquiry's to share, under the consent given there. */}
          <Text style={[type.description, { color: colors.muted }]}>Contact is shared on the enquiry</Text>
        </View>
      </View>
      {lead.repeat ? <LeadRepeatNote repeat={lead.repeat} /> : null}
      {lead.resumedFrom ? <Text style={[type.description, { color: colors.muted }]}>Came back after {lead.resumedFrom.referenceCode}</Text> : null}
      {lead.reopenedAt ? <Text style={[type.description, { color: colors.muted }]}>Changed their mind on {leadDay(lead.reopenedAt)}</Text> : null}
      {detail.cameBackAs ? <Text style={[type.description, { color: colors.muted }]}>Came back later as {detail.cameBackAs.referenceCode}</Text> : null}
    </Card>

    {direct ? <NotAvailableCard title="Enquiry" why={direct === "DIRECT_BOOKING" ? "Direct booking" : "Direct visit scheduled"} />
      : detail.enquiries.length > 0 ? <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      {/* With one enquiry its state sits beside the title (user, 2026-10-17). With several, each line keeps its own. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text style={[heading, { flex: 1 }]}>{detail.enquiries.length === 1 ? "Enquiry" : `Enquiries · ${detail.enquiries.length}`}</Text>
        {detail.enquiries.length === 1 ? <EnquiryChip enquiry={detail.enquiries[0]} /> : null}
      </View>
      {detail.enquiries.map((enquiry, index) => <EnquiryLine key={enquiry.id} enquiry={enquiry} first={index === 0} chip={detail.enquiries.length > 1} />)}
    </Card> : null}

    {detail.visits.length === 0 && direct === "DIRECT_BOOKING" ? <NotAvailableCard title="Visit" why="Direct booking" />
      : detail.visits.length > 0 ? <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      <Text style={heading}>{detail.visits.length === 1 ? "Visit" : `Visits · ${detail.visits.length}`}</Text>
      {detail.visits.map((visit, index) => <VisitLine key={visit.id} visit={visit} first={index === 0} />)}
    </Card> : null}

    {detail.bookings.length > 0 ? <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      {/* With one booking its status sits beside the title (user, 2026-10-17). With several, each line keeps its own. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text style={[heading, { flex: 1 }]}>{detail.bookings.length === 1 ? "Booking" : `Bookings · ${detail.bookings.length}`}</Text>
        {detail.bookings.length === 1 ? <OwnerBookingStatus status={detail.bookings[0].status} /> : null}
      </View>
      {[...detail.bookings].reverse().map((booking, index) => <BookingLine key={booking.id} booking={booking} first={index === 0} chip={detail.bookings.length > 1} onOpen={() => onOpenBooking(booking)} />)}
    </Card> : null}

    <View style={{ flexDirection: "row", gap: 8 }}>
      {lead.enquiredAt ? <View style={{ flex: 1, minWidth: 0 }}><BookingInfoBand icon={Clock3} iconGap={6}>
        <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>Enquired {leadDay(lead.enquiredAt)}</FitText>
      </BookingInfoBand></View> : null}
      {stageSince(lead) ? <View style={{ flex: 1, minWidth: 0 }}><BookingInfoBand>
        <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>{stageSince(lead)}</FitText>
      </BookingInfoBand></View> : null}
    </View>

    {timeline.length > 0 ? <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>Activity</Text>
      <View>
        {timeline.map((item, index) => <View key={item.key} style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", alignSelf: "stretch", width: 18 }}>
            {/* The rail joins one step's dot to the next, and under the last it stops at its words, as on booking details. */}
            <View style={{ backgroundColor: colors.borderStrong, bottom: index === timeline.length - 1 ? spacing.md : 0, left: 8, position: "absolute", top: 16, width: 2 }} />
            <View style={{ backgroundColor: colors.primary, borderColor: colors.primarySoft, borderWidth: 3, borderRadius: 999, height: 16, width: 16 }} />
          </View>
          <View style={{ flex: 1, gap: 3, paddingBottom: spacing.md }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{item.title}</Text>
            <Text style={[type.description, { color: colors.muted }]}>{item.by ? `${item.by} · ` : ""}{leadMoment(item.at)}</Text>
            {item.note && item.noteIsVisitDay ? <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              {/* The visit's own day, not when this step happened (user, 2026-10-17). */}
              <CalendarDays accessibilityLabel="Visit day" color={colors.muted} size={14} strokeWidth={2} />
              <Text style={[type.description, { color: colors.muted, flexShrink: 1 }]}>{item.note}</Text>
            </View> : item.note ? <Text style={[type.description, { color: colors.muted }]}>{item.note}</Text> : null}
          </View>
        </View>)}
      </View>
    </Card> : null}
  </>;
}

/**
 * How a lead booked straight from the property page began, when it never had an
 * enquiry of its own: "DIRECT_BOOKING" over "DIRECT_VISIT" where it had both.
 * Null for a lead that began with an enquiry.
 */
function directOrigin(detail: LeadDetail) {
  if (detail.enquiries.length === 0 || detail.enquiries.some((enquiry) => enquiry.origin === "ENQUIRY")) return null;
  return detail.enquiries.some((enquiry) => enquiry.origin === "DIRECT_BOOKING") ? "DIRECT_BOOKING" : "DIRECT_VISIT";
}

/** A section the lead never had, because it was booked straight from the property page. */
function NotAvailableCard({ title, why }: { title: string; why: string }) {
  const { colors, type } = useTheme();
  return <Card style={{ gap: spacing.xs, padding: spacing.md }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 18, lineHeight: 23 }]}>{title}</Text>
      <LineChip label="Not available" tone="neutral" />
    </View>
    <Text style={[type.description, { color: colors.muted }]}>{why}</Text>
  </Card>;
}

/** The second band: since when it has been at the stage it is at, or when it ended. */
function stageSince(lead: Lead) {
  switch (lead.kind) {
    case "EARLY_LEAD": return lead.earlyLeadAt ? `Early lead since ${leadDay(lead.earlyLeadAt)}` : null;
    case "ADVANCED_LEAD": return lead.advancedLeadAt ? `Strong lead since ${leadDay(lead.advancedLeadAt)}` : null;
    case "BOOKED": return lead.bookedAt ? `Booked ${leadDay(lead.bookedAt)}` : null;
    case "CONVERTED": return lead.movedInAt ? `Moved in ${leadDay(lead.movedInAt)}` : null;
    default: return lead.closedAt ? `Ended ${leadDay(lead.closedAt)}` : null;
  }
}

function Rule() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1, marginVertical: 2 }} />;
}

/** A soft status word at the end of a line. Tint and label, no dot. */
function LineChip({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  const { colors, fonts } = useTheme();
  const [backgroundColor, color] = {
    success: [colors.successSoft, colors.successText],
    warning: [colors.warningSoft, colors.warningText],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.neutralSoft, colors.neutralText],
  }[tone];
  return <View style={{ alignSelf: "flex-start", backgroundColor, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
    <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 11.5 }}>{label}</Text>
  </View>;
}

/** Open, or why it ended. */
function EnquiryChip({ enquiry }: { enquiry: LeadEnquiry }) {
  return <LineChip label={enquiry.open ? "Open" : enquiry.endReason ? ENQUIRY_END[enquiry.endReason] ?? "Ended" : "Ended"} tone={enquiry.open ? "success" : "neutral"} />;
}

function EnquiryLine({ enquiry, first, chip }: { enquiry: LeadEnquiry; first: boolean; chip: boolean }) {
  const { colors, fonts, type } = useTheme();
  const answered = enquiry.respondedAt ? ` · answered ${leadMoment(enquiry.respondedAt)}` : " · not answered yet";
  return <>
    {first ? null : <Rule />}
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{enquiry.message}</FitText>
        <Text style={[type.description, { color: colors.muted }]}>{enquiry.raisedAt ? `Raised ${leadDay(enquiry.raisedAt)}` : "Raised"}{answered}</Text>
      </View>
      {chip ? <EnquiryChip enquiry={enquiry} /> : null}
    </View>
  </>;
}

const ENQUIRY_END: Record<string, string> = {
  HANDLER_DID_NOT_RESPOND: "Not answered",
  TENANT_DID_NOT_RESPOND: "No reply",
  NOT_INTERESTED: "Not interested",
  NO_VISIT_BOOKED: "No visit booked",
  VISIT_CANCELLED: "Visit cancelled",
  VISIT_BOOKED: "Ended",
  VISIT_MISSED: "Visit missed",
  VISITED: "Visited",
};

function VisitLine({ visit, first }: { visit: LeadVisit; first: boolean }) {
  const { colors, fonts, type } = useTheme();
  const [label, tone] = {
    SCHEDULED: ["Scheduled", "warning"],
    VISITED: ["Visited", "success"],
    NOT_VISITED: ["Missed", "danger"],
    CANCELLED: ["Cancelled", "neutral"],
  }[visit.status] as [string, "success" | "warning" | "danger" | "neutral"];
  return <>
    {first ? null : <Rule />}
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text selectable style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{visit.referenceCode}</Text>
        {/* The visit's own day, with the calendar the timeline uses for it (user, 2026-10-17). */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          <CalendarDays accessibilityLabel="Visit day" color={colors.muted} size={14} strokeWidth={2} />
          <Text style={[type.description, { color: colors.muted, flexShrink: 1 }]}>{leadDay(visit.visitDate)} · {slotTime(visit.slotStartMinute)} to {slotTime(visit.slotEndMinute)}</Text>
        </View>
        {/* Where its latest move took it from (user, 2026-10-17). */}
        {visit.movedFromDate ? <Text style={[type.description, { color: colors.muted }]}>Moved from {leadDay(visit.movedFromDate)}{visit.movedFromSlotStartMinute != null ? `, ${slotTime(visit.movedFromSlotStartMinute)}` : ""}</Text> : null}
        {visit.checkedInAt ? <Text style={[type.description, { color: colors.muted }]}>Checked in {leadMoment(visit.checkedInAt)}</Text> : null}
        {visit.stillInterestedUntil ? <Text style={[type.description, { color: colors.muted }]}>Can say they are still interested until {leadDay(visit.stillInterestedUntil)}</Text> : null}
      </View>
      <LineChip label={label} tone={tone} />
    </View>
  </>;
}

function BookingLine({ booking, first, chip, onOpen }: { booking: LeadBooking; first: boolean; chip: boolean; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  return <>
    {first ? null : <Rule />}
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text selectable style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{booking.referenceCode}</Text>
        <Text style={[type.description, { color: colors.muted }]}>{[booking.roomNumber ? `Room ${booking.roomNumber}` : null, booking.moveInDate ? `move-in ${leadDay(booking.moveInDate)}` : null].filter(Boolean).join(" · ")}</Text>
        <Text style={[type.description, { color: colors.muted }]}>Requested {leadDay(booking.submittedAt)}{booking.expiresAt ? ` · expires ${leadMoment(booking.expiresAt)}` : ""}</Text>
        {booking.endCause ? <Text style={[type.description, { color: colors.muted }]}>Ended {booking.endedAt ? leadDay(booking.endedAt) : ""}</Text> : null}
      </View>
      {chip ? <OwnerBookingStatus status={booking.status} /> : null}
    </View>
    <View style={{ flexDirection: "row" }}><ActionButton compact label="View booking" onPress={onOpen} variant="secondary" /></View>
  </>;
}
