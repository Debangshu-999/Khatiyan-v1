import { useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { AlertTriangle, CalendarCheck, CalendarDays, CircleAlert, CircleHelp, Clock3, FileText, Mail, Phone, UserRound } from "lucide-react-native";

import { Card } from "@/components/card";
import { BookingTokenAmountIcon } from "@/components/booking-vector-icons";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { BookingDetailSkeleton } from "@/components/skeletons/booking/workspace";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { BookingDateField } from "@/features/booking/booking-date-field";
import { BookingConfirmBody } from "@/features/booking/booking-confirm-body";
import { BookingPaymentClaims as TenantTokenClaims } from "@/features/booking/booking-payment-claims";
import { BookingTokenPaidSheet } from "@/features/booking/token-paid-sheet";
import { RoomRent, roomKindLabel } from "@/features/booking/booking-form-parts";
import { BOOKING_END_CAUSE, BOOKING_EVENT, BOOKING_TOKEN_STATUS, bookingDateLabel, bookingDayLabel, bookingMomentLabel, bookingPartyLabel, parseBookingRent } from "@/features/booking/booking-ui";
import { BookingCardRule, BookingFactBox, BookingFactPair, BookingInfoBand, BookingInitialsAvatar, BookingRoomAmenities, BookingRoomPhoto, TenantBookingStatus } from "@/features/booking/tenant-booking-parts";
import { GENDER_LABELS } from "@/features/account/gender-picker";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput, IconButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  useGetMyBookingRequestQuery,
  useAcceptBookingOfferMutation,
  useCounterBookingOfferMutation,
  useCancelMyBookingMutation,
  usePushBookingMoveInDateMutation,
  useAcceptAnotherBedMutation,
  useDeclineAnotherBedMutation,
  useLeaveBookingBedNotReadyMutation,
  type BookingAction,
  type BookingMoveInAction,
  type BookingRequest,
  type BookingTokenAction,
} from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

type TenantDecision = Exclude<BookingAction, "CONFIRM"> | Exclude<BookingMoveInAction, "CONVERT" | "CLOSE_DID_NOT_ARRIVE" | "OFFER_ANOTHER_BED">;
const MOVE_ACTION_LABEL: Partial<Record<BookingMoveInAction, string>> = { PUSH_DATE: "Move my date", ACCEPT_ANOTHER_BED: "Accept other bed", DECLINE_ANOTHER_BED: "Decline other bed", LEAVE_BED_NOT_READY: "Leave: bed not ready" };

export default function MyBookingDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const id = typeof requestId === "string" ? requestId : "";
  const router = useGuardedRouter();
  const { colors } = useTheme();
  const query = useGetMyBookingRequestQuery(id, { skip: !id, refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const booking = query.currentData;
  const [action, setAction] = useState<TenantDecision | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [footerHeight, setFooterHeight] = useState(104);
  const actions = booking ? booking.allowedActions.length + booking.allowedTokenActions.length + booking.allowedMoveInActions.filter((item) => MOVE_ACTION_LABEL[item]).length : 0;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingBottom: actions ? footerHeight + spacing.lg : spacing.xl }} onRefresh={() => { if (id) void query.refetch(); }}>
      <ScreenHeader title="Your" italicTail="booking." subtitle={booking?.propertyName ?? "Your request and the property's current offer."} />
      {!id ? <EmptyState icon={CalendarCheck} title="Choose a booking" description="Open a request from My bookings." action={<ActionButton label="My bookings" onPress={() => router.replace("/my-bookings")} />} /> : !booking && !query.isError ? <BookingDetailSkeleton /> : null}
      {query.isError ? <><NoticeBar title="Could not load booking" message={errorMessage(query.error)} tone="danger" /><ActionButton label="Try again" onPress={() => void query.refetch()} /></> : null}
      {booking ? <TenantBookingSummary booking={booking} /> : null}
    </ScreenScrollView>
    {booking && actions > 0 ? <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      <View style={{ gap: spacing.sm }}>
        {booking.allowedActions.includes("ACCEPT") ? <View style={{ flexDirection: "row" }}><ActionButton label={`Accept ${formatMoneyPaise(booking.currentRentPaise)}`} onPress={() => setAction("ACCEPT")} /></View> : null}
        {/* Paying leads. It is what the booking is waiting on, and withdrawing sits under it (user, 2026-10-11). */}
        {booking.allowedTokenActions.includes("CLAIM_PAID") ? <View style={{ flexDirection: "row" }}><ActionButton label="View/Record payment" onPress={() => setPayOpen(true)} /></View> : null}
        {booking.allowedActions.includes("COUNTER") || booking.allowedActions.includes("CANCEL") ? <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {booking.allowedActions.includes("COUNTER") ? <ActionButton label="Counter offer" variant="primaryQuiet" onPress={() => setAction("COUNTER")} /> : null}
          {booking.allowedActions.includes("CANCEL") ? <ActionButton label={booking.status === "CONFIRMED" || booking.status === "TOKEN_RECEIVED" ? "Cancel booking" : "Withdraw request"} variant="dangerFilled" onPress={() => setAction("CANCEL")} /> : null}
        </View> : null}
        {booking.allowedMoveInActions.filter((item) => MOVE_ACTION_LABEL[item]).map((item) => <View key={item} style={{ flexDirection: "row" }}><ActionButton label={MOVE_ACTION_LABEL[item]!} variant={item === "LEAVE_BED_NOT_READY" ? "dangerQuiet" : "secondary"} onPress={() => setAction(item as TenantDecision)} /></View>)}
      </View>
    </PinnedFooter> : null}
    {booking && action ? <TenantBookingDecisionSheet key={`${id}:${action}`} booking={booking} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); void query.refetch(); }} /> : null}
    {booking && payOpen ? <BookingTokenPaidSheet booking={booking} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); void query.refetch(); }} /> : null}
  </View>;
}

function TenantBookingSummary({ booking }: { booking: BookingRequest }) {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const [roomTextHeight, setRoomTextHeight] = useState(72);
  const [policyOpen, setPolicyOpen] = useState(false);
  const pending = ["AWAITING_HANDLER", "AWAITING_TENANT"].includes(booking.status);
  const held = ["AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN", "TOKEN_RECEIVED", "CONFIRMED"].includes(booking.status) && !booking.tenancyId;
  const rentLabel = booking.agreedAt ? "Agreed monthly rent" : booking.currentOfferBy === "TENANT" ? "Your proposed rent" : "Property's offer";
  // A section's name: the darkest ink, the heading face at its heaviest, and a step above the person's name
  // under it, so the two no longer read as one line repeated (user, 2026-10-11).
  const heading = { color: colors.ink, fontFamily: fonts.display, fontSize: 20 };
  // The yellow due line stands in for the token's "Due" chip, and only for that one.
  const tokenDueLine = booking.token?.status === "DUE" && Boolean(booking.tokenDueAt) && booking.status === "AWAITING_TOKEN";
  const personName = { color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 };
  const labelStyle = { color: colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 12 };
  const timeline = booking.history.map((item, index) => {
    const offer = booking.offers.find((entry) => entry.sequence === item.offerSequence);
    return { key: `event:${index}`, title: BOOKING_EVENT[item.type], at: item.occurredAt, note: item.note,
      offer: offer ? `${bookingPartyLabel(offer.madeBy)} offered ${formatMoneyPaise(offer.monthlyRentPaise)} / month${!offer.negotiable ? " · Final offer" : ""}` : null };
  });
  // Keep offers with no linked history entry visible too.
  for (const offer of booking.offers) {
    if (!booking.history.some((item) => item.offerSequence === offer.sequence)) timeline.push({
      key: `offer:${offer.sequence}`, title: offer.madeBy === "TENANT" ? "Your offer" : "Property offer", at: offer.madeAt, note: null,
      offer: `${formatMoneyPaise(offer.monthlyRentPaise)} / month${!offer.negotiable ? " · Final offer" : ""}`,
    });
  }
  if (!booking.history.some((item) => item.type === "SUBMITTED")) timeline.unshift({ key: "submitted", title: "Request sent", at: booking.submittedAt, note: null, offer: null });
  timeline.sort((left, right) => left.at.localeCompare(right.at));

  return <>
    <Card style={{ gap: spacing.xs, padding: spacing.md, paddingBottom: spacing.xxs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text style={labelStyle}>Ref</Text>
          <FitText selectable numberOfLines={1} minimumFontScale={0.65} style={[type.display, { color: colors.ink, fontSize: 21, fontWeight: "900" }]}>{booking.referenceCode}</FitText>
        </View>
        <TenantBookingStatus status={booking.status} />
      </View>
      {booking.handlerName ? <Text style={[type.description, { color: colors.muted }]}>Handled by {booking.handlerName}</Text> : null}
    </Card>
    {booking.status === "AWAITING_HANDLER" ? <NoticeBar title="Waiting for the property" message="Your request holds one bed while the property reviews it. You can return here to see its answer." tone="info" /> : null}
    {booking.status === "AWAITING_TENANT" ? <NoticeBar title={booking.currentOfferNegotiable ? "The property has made an offer" : "This is the property's final price"} message={booking.currentOfferNegotiable ? "Accept, counter or withdraw using the actions below." : "You can accept this rent or withdraw. This offer cannot be countered."} tone="info" /> : null}
    {booking.agreedAt && !booking.tenancyId ? <NoticeBar title={booking.status === "TOKEN_RECEIVED" ? "Token received" : booking.status === "CONFIRMED" ? "Booking confirmed" : "Agreed terms are frozen"} message={booking.status === "TOKEN_RECEIVED" ? "The property has verified your token payment. Your booking is awaiting final confirmation." : "Your agreed rent, deposit, room and term are fixed. The property creates your stay when you arrive. Any available date-change action appears below."} tone={booking.status === "CONFIRMED" || booking.status === "TOKEN_RECEIVED" ? "success" : "info"} /> : null}

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>Your details</Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <BookingInitialsAvatar name={booking.tenantName} />
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
          <FitText style={personName}>{cardName(booking.tenantName)}</FitText>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}><Phone color={colors.muted} size={16} /><Text selectable style={[type.description, { color: colors.muted, flex: 1 }]}>{formatIndianPhone(booking.tenantPhone)}</Text></View>
          {booking.tenantEmail ? <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}><Mail color={colors.muted} size={16} /><Text selectable style={[type.description, { color: colors.muted, flex: 1 }]}>{booking.tenantEmail}</Text></View> : null}
        </View>
      </View>
      <BookingCardRule />
      <View style={{ alignItems: "center", columnGap: spacing.md, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}><UserRound color={colors.muted} size={18} /><Text style={[type.description, { color: colors.muted }]}>{GENDER_LABELS[booking.tenantGender]}</Text></View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}><CalendarDays color={colors.muted} size={18} /><Text style={[type.description, { color: colors.muted }]}>DOB {bookingDateLabel(booking.tenantDateOfBirth)}</Text></View>
      </View>
    </Card>

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ width: "46%" }}><BookingRoomPhoto imageUrls={booking.roomImageUrls ?? []} height={roomTextHeight} width="100%" /></View>
        <View onLayout={(event) => {
          const height = Math.ceil(event.nativeEvent.layout.height);
          if (height > 0) setRoomTextHeight((current) => current === height ? current : height);
        }} style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 22 }}>Room {booking.roomNumber}</Text>
            {booking.roomConditioning && booking.roomCapacity ? <Text style={[type.description, { color: colors.muted }]}>{roomKindLabel({ conditioning: booking.roomConditioning, capacity: booking.roomCapacity })}</Text> : null}
            <Text style={[type.description, { color: colors.muted }]}>{booking.futureBed ? "Future vacancy" : "Current vacancy"}</Text>
            {held ? <View style={{ alignSelf: "flex-start", backgroundColor: colors.successSoft, borderRadius: 999, maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 4 }}><FitText numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.successText, fontFamily: fonts.sansSemiBold }]}>One bed held for you</FitText></View> : null}
          </View>
          <RoomRent paise={booking.agreedRentPaise ?? booking.currentRentPaise} size={19} />
        </View>
      </View>
      {(booking.roomAmenities?.length ?? 0) + (booking.roomCustomAmenities?.length ?? 0) > 0 ? <><BookingCardRule /><BookingRoomAmenities amenities={booking.roomAmenities ?? []} custom={booking.roomCustomAmenities ?? []} /></> : null}
      <BookingCardRule />
      <BookingFactPair left={<><View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}><CalendarDays color={colors.muted} size={17} /><Text style={labelStyle}>Move-in</Text></View><Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{bookingDateLabel(booking.moveInDate)}</Text></>} right={<View style={{ alignItems: "center", flexDirection: "row", gap: 7, flex: 1 }}><FileText color={colors.muted} size={19} /><FitText numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.muted, flex: 1 }]}>{booking.agreementMonths == null ? "Indefinite" : `Definite · ${booking.agreementMonths} month${booking.agreementMonths === 1 ? "" : "s"}`}</FitText></View>} />
      {booking.moveInDatePushed ? <Text style={[type.description, { color: colors.muted }]}>Originally {bookingDateLabel(booking.originalMoveInDate)}. Your one date change has been used.</Text> : null}
    </Card>

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>{booking.agreedAt ? "Agreed terms" : "Offer"}</Text>
      {/* Four grey boxes, two to a row, with a gap between each (user, 2026-10-11). */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <BookingFactBox>
            <Text style={[type.description, { color: colors.muted }]}>{rentLabel}</Text>
            <FitText numberOfLines={1} minimumFontScale={0.65} style={{ color: colors.primary, fontFamily: fonts.display, fontSize: 25 }}>{formatMoneyPaise(booking.agreedRentPaise ?? booking.currentRentPaise)} <Text style={{ fontFamily: fonts.displaySoft, fontSize: 16 }}>/month</Text></FitText>
          </BookingFactBox>
          <BookingFactBox>
            <Text style={[type.description, { color: colors.muted }]}>Listed rent</Text>
            <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>{formatMoneyPaise(booking.listedRentPaise)} <Text style={{ fontSize: 12 }}>/month</Text></FitText>
          </BookingFactBox>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <BookingFactBox>
            <Text style={[type.description, { color: colors.muted }]}>Deposit</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{formatMoneyPaise(booking.depositPaise)}</Text>
          </BookingFactBox>
          <BookingFactBox>
            <Text style={[type.description, { color: colors.muted }]}>Due at move-in</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{formatMoneyPaise(booking.dueAtMoveInPaise)}</Text>
          </BookingFactBox>
        </View>
      </View>
    </Card>
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}><BookingInfoBand icon={Clock3} iconGap={6}>
        <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>Requested {bookingDayLabel(booking.submittedAt)}</FitText>
      </BookingInfoBand></View>
      {pending ? <View style={{ flex: 1, minWidth: 0 }}><BookingInfoBand>
        <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>Expires {bookingMomentLabel(booking.expiresAt)}</FitText>
      </BookingInfoBand></View> : null}
    </View>

    <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      {/* The rupee mark (27 wide, 3 in) and the due line's clock (21 wide, 6 in) share one centre line, so the
          clock sits under the mark (user, 2026-10-11). Change one number and change the other. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingLeft: 3 }}>
        <BookingTokenAmountIcon color={colors.successText} size={27} />
        <FitText numberOfLines={1} minimumFontScale={0.8} style={[heading, { flex: 1 }]}>Token amount</FitText>
        <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: colors.successText, fontFamily: fonts.displaySoft, fontSize: 21, flexShrink: 1, maxWidth: "40%" }}>{formatMoneyPaise(booking.tokenRequired ? booking.token?.amountPaise ?? booking.tokenPaise : 0)}</FitText>
        {/* The policy is behind this mark, in the How it works sheet, and no longer a notice on the card (user, 2026-10-11). */}
        {booking.tokenRequired ? <IconButton accessibilityLabel="Token policy" icon={CircleHelp} onPress={() => setPolicyOpen(true)} /> : null}
      </View>
      {/* A pending claim belongs in Payment claims below, not in a second paid chip here. */}
      {booking.token && booking.token.status !== "CLAIMED" && booking.token.status !== "RECEIVED" && !tokenDueLine ? <StatusPill {...BOOKING_TOKEN_STATUS[booking.token.status]} /> : null}
      {!booking.tokenRequired ? <Text style={[type.description, { color: colors.muted }]}>No token required</Text> : null}
      {booking.tokenDueAt && booking.status === "AWAITING_TOKEN" && booking.token?.status !== "RECEIVED" && !booking.token?.claimWaiting ? <BookingInfoBand icon={Clock3} iconGap={6} iconInset={6} tone="warning"><Text style={[type.description, { color: colors.warningText, fontFamily: fonts.sansSemiBold }]}>Due {bookingDateLabel(booking.tokenDueAt, true)}</Text></BookingInfoBand> : null}
      {booking.token?.claimWaiting ? <NoticeBar title="Payment window paused" message="The token payment window has been paused until the token payment claim is verified." tone="info" /> : null}
      {booking.token?.receiptCode ? <Text selectable style={[type.description, { color: colors.inkSoft, fontFamily: fonts.sansSemiBold }]}>Receipt {booking.token.receiptCode}</Text> : null}
      {booking.token?.waivedAt ? <Text style={[type.description, { color: colors.muted }]}>The owner waived the token.</Text> : null}
      {booking.token?.refundDueSince ? <Text style={[type.description, { color: colors.muted }]}>Refundable since {bookingDateLabel(booking.token.refundDueSince, true)}. The property refunds it to you directly.</Text> : null}
    </Card>
    {booking.bedReady === false ? <NoticeBar title="The booked bed is not free yet" message="The property must free your bed before onboarding. When your options become available, you can accept a different bed or leave with the token owed back." tone="warning" /> : null}
    {booking.bedOffer ? <Card style={{ padding: spacing.md }}><Text style={heading}>Another bed offered</Text><Text style={[type.body, { color: colors.ink }]}>Room {booking.bedOffer.roomNumber} · {formatMoneyPaise(booking.bedOffer.monthlyRentPaise)} / month</Text><Text style={[type.description, { color: colors.muted }]}>This bed is not reserved until you accept. Your existing deposit and recorded token carry over.</Text></Card> : null}
    {booking.token?.claims.length ? <TenantTokenClaims token={booking.token} /> : null}
    {booking.tenancyId ? <><NoticeBar title={booking.status === "MOVED_IN" ? "Your stay has started" : "The property created your stay"} message="Your agreement and signing actions are available in the Tenancy section. This booking follows that stay and cannot be cancelled separately." tone="info" /><View style={{ flexDirection: "row" }}><ActionButton label="Open my tenancy" onPress={() => router.push("/(tabs)/tenancy")} /></View></> : null}
    {booking.endCause ? <NoticeBar title="Booking ended" message={`${BOOKING_END_CAUSE[booking.endCause]}${booking.cancelReason ? ` ${booking.cancelReason}` : ""}`} tone="warning" /> : null}

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>Activity</Text>
      <View>
        {timeline.map((item, index) => <View key={item.key} style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", alignSelf: "stretch", width: 18 }}>
            {/* The rail joins one step's dot to the next. Under the last step there is no next, so it runs to the
                end of that step's own words, its last line, and stops short of the padding under them (user,
                2026-10-11: "till the second line for Tenant offered", "not below that"). */}
            <View style={{ backgroundColor: colors.borderStrong, bottom: index === timeline.length - 1 ? spacing.md : 0, left: 8, position: "absolute", top: 16, width: 2 }} />
            <View style={{ backgroundColor: colors.primary, borderColor: colors.primarySoft, borderWidth: 3, borderRadius: 999, height: 16, width: 16 }} />
          </View>
          <View style={{ flex: 1, gap: 3, paddingBottom: spacing.md }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{item.title}</Text>
            <Text style={[type.description, { color: colors.muted }]}>{bookingDateLabel(item.at, true)}</Text>
            {item.offer ? <Text style={[type.description, { color: colors.muted }]}>{item.offer}</Text> : null}
            {item.note ? <Text style={[type.description, { color: colors.muted }]}>{item.note}</Text> : null}
          </View>
        </View>)}
      </View>
    </Card>
    {policyOpen ? <HowItWorksSheet eyebrow="Booking token" title="Token policy" onClose={() => setPolicyOpen(false)} steps={[
      { title: "Comes off your first bill", body: "The token is adjusted from your first cycle bill after your tenancy starts." },
      { title: "If you cancel", body: booking.tokenRefundable ? "The token is refunded to you." : "The token is not refunded." },
      { title: "If the property cancels", body: "The token is always owed back if the property cancels or cannot host you." },
    ]} /> : null}
  </>;
}

function tenantCanDecide(booking: BookingRequest, action: TenantDecision) {
  return booking.allowedActions.includes(action as BookingAction) || booking.allowedMoveInActions.includes(action as BookingMoveInAction) || booking.allowedTokenActions.includes(action as BookingTokenAction);
}

function nextCivilDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);
}

function TenantBookingDecisionSheet({ booking, action, onClose, onDone }: { booking: BookingRequest; action: TenantDecision; onClose: () => void; onDone: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [snapshot] = useState(booking);
  const [rent, setRent] = useState(String(booking.currentRentPaise / 100));
  const [date, setDate] = useState(nextCivilDay(booking.moveInDate));
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [accept] = useAcceptBookingOfferMutation(); const [counter] = useCounterBookingOfferMutation(); const [cancel] = useCancelMyBookingMutation();
  const [push] = usePushBookingMoveInDateMutation(); const [takeBed] = useAcceptAnotherBedMutation(); const [declineBed] = useDeclineAnotherBedMutation(); const [leave] = useLeaveBookingBedNotReadyMutation();
  const changed = booking.version !== snapshot.version || booking.currentOfferSequence !== snapshot.currentOfferSequence || !tenantCanDecide(booking, action);
  async function submit() {
    if (busy.current || changed) return;
    const rentPaise = parseBookingRent(rent);
    if (action === "COUNTER" && rentPaise == null) { setRefusal("Enter a monthly rent greater than zero, with up to two decimal places."); return; }
    if (action === "PUSH_DATE" && (date <= snapshot.moveInDate || date > snapshot.latestPushDate)) { setRefusal("Choose a later date within the range shown."); return; }
    if (action === "CANCEL" && !reason.trim()) { setFieldError("Give a reason for cancelling."); return; }
    if (action === "CANCEL" && reason.trim().length > 500) { setFieldError("Keep the reason within 500 characters."); return; }
    busy.current = true; setWorking(true); setRefusal(null);
    const step = { requestId: snapshot.id, version: snapshot.version };
    try {
      if (action === "ACCEPT") await accept({ ...step, offerSequence: snapshot.currentOfferSequence }).unwrap();
      else if (action === "COUNTER") await counter({ ...step, offerSequence: snapshot.currentOfferSequence, rentPaise: rentPaise! }).unwrap();
      else if (action === "CANCEL") await cancel({ ...step, reason: reason.trim() }).unwrap();
      else if (action === "PUSH_DATE") await push({ ...step, moveInDate: date }).unwrap();
      else if (action === "ACCEPT_ANOTHER_BED") await takeBed(step).unwrap();
      else if (action === "DECLINE_ANOTHER_BED") await declineBed(step).unwrap();
      else await leave(step).unwrap();
      toast.success("Booking updated."); onDone();
    } catch (caught) { setRefusal(errorMessage(caught)); }
    finally { busy.current = false; setWorking(false); }
  }
  const title = action === "ACCEPT" ? "Accept this offer" : action === "COUNTER" ? "Your counter offer" : action === "CANCEL" ? "Cancel booking?" : action === "PUSH_DATE" ? "Move your date" : action === "LEAVE_BED_NOT_READY" ? "Leave this booking" : action === "ACCEPT_ANOTHER_BED" ? "Accept the other bed" : "Decline the other bed";
  const cancellation = snapshot.status !== "CONFIRMED" && snapshot.status !== "TOKEN_RECEIVED" ? "This withdraws your request and releases the bed hold. It does not impose a confirmed-booking cooldown." : (!snapshot.tokenRequired || snapshot.token?.waivedAt) ? "This cancels your no-token booking, releases its bed, closes this visit's booking window and prevents booking this property for 30 days." : snapshot.tokenRefundable ? "This cancels your booking and releases its bed. Your recorded token is owed back under the property's refund policy." : "This cancels your booking and releases its bed. The property keeps your recorded token under its non-refundable policy.";
  const close = () => { if (!busy.current) onClose(); };
  // Accept carries its heading in its own body, centred under the tick, so the shell has no title for it.
  return <SheetShell title={action === "ACCEPT" ? "" : title} closeButtonVariant="raised" onClose={close}>
    {action === "CANCEL" ? <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs }}>
      <CircleAlert color={colors.danger} size={36} strokeWidth={1.8} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{snapshot.tenantName} · Room {snapshot.roomNumber}</Text>
        <Text selectable style={[type.description, { color: colors.muted }]}>{snapshot.referenceCode}</Text>
      </View>
    </View> : action === "ACCEPT" ? null : <Text style={[type.modalDescription, { color: colors.muted }]}>{snapshot.propertyName} · Room {snapshot.roomNumber}</Text>}
    {action === "CANCEL" ? <>
      <View style={{ gap: spacing.xs }}>
        <FormInput label="Reason for cancellation" required multiline borderOnContainer maxLength={500} radius={10} value={reason} placeholder="Tell the property why you are cancelling this booking." labelStyle={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }} inputStyle={{ backgroundColor: colors.neutralSoft, minHeight: 90, borderWidth: 1 }} error={fieldError ?? undefined} disabled={working} onChangeText={(value) => { setReason(value); setFieldError(null); }} />
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: 10, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
        <AlertTriangle color={colors.warningText} size={25} strokeWidth={1.9} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.description, { color: colors.ink }]}>The reserved bed will be released.</Text>
          {snapshot.status === "CONFIRMED" || snapshot.status === "TOKEN_RECEIVED" ? <Text style={[type.description, { color: colors.muted }]}>{cancellation}</Text> : null}
        </View>
      </View>
    </> : action === "ACCEPT" ? <BookingConfirmBody
      place={`${snapshot.propertyName} · Room ${snapshot.roomNumber}`}
      rentPaise={snapshot.currentRentPaise}
      moveInDate={snapshot.moveInDate}
      agreementMonths={snapshot.agreementMonths ?? null}
      // With a token still to be paid, accepting agrees the terms and the booking is confirmed later. Said as it is.
      notice={snapshot.tokenRequired ? "Accepting this offer agrees the terms and keeps one bed reserved. After the token is received, the property must confirm your booking." : "Accepting this offer confirms the booking and keeps one bed reserved."}
    /> : action === "COUNTER" ? <FormInput label="Your monthly rent offer" prefix="₹" keyboardType="decimal-pad" value={rent} placeholder="Enter rent" disabled={working} onChangeText={setRent} /> : action === "PUSH_DATE" ? <><BookingDateField label="New move-in date" value={date} minimum={nextCivilDay(snapshot.moveInDate)} maximum={snapshot.latestPushDate} disabled={working} onChange={setDate} /><NoticeBar title="One date change only" message="Your other agreed terms stay unchanged. This change cannot be repeated." tone="warning" /></> : <NoticeBar title={title} tone={action === "LEAVE_BED_NOT_READY" ? "warning" : "info"} message={action === "ACCEPT_ANOTHER_BED" ? `Accept room ${snapshot.bedOffer?.roomNumber} at ${formatMoneyPaise(snapshot.bedOffer?.monthlyRentPaise ?? 0)} / month. Availability is checked again; your current hold is not lost if the replacement cannot be reserved.` : action === "LEAVE_BED_NOT_READY" ? "The property has not freed the bed in time. Leaving ends this booking and makes a received token owed back." : "This declines the alternate bed. Your current booking remains until you choose another available action."} />}
    {changed ? <NoticeBar title="The booking changed" message="Close this sheet and review the latest booking before deciding." tone="warning" /> : null}
    {refusal ? <NoticeBar title="Action was not saved" message={refusal} tone="danger" /> : null}
    <View style={{ flexDirection: "row", gap: spacing.sm }}><ActionButton label={action === "CANCEL" || action === "LEAVE_BED_NOT_READY" ? "Keep booking" : action === "ACCEPT" ? "Not now" : "Close"} disabled={working} variant={action === "ACCEPT" ? "primaryQuiet" : "secondary"} onPress={close} /><ActionButton label={working ? "Saving..." : action === "CANCEL" ? "Cancel booking" : action === "ACCEPT" ? "Confirm booking" : "Confirm"} disabled={working || changed || (action === "CANCEL" && fieldError !== null)} variant={action === "CANCEL" || action === "LEAVE_BED_NOT_READY" ? "dangerFilled" : "primary"} onPress={() => void submit()} /></View>
  </SheetShell>;
}
