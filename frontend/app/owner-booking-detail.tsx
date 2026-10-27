import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { AlertTriangle, CalendarDays, Check, CircleAlert, CircleHelp, Clock3, FileText, Info, LockKeyhole, Mail, Phone, RotateCcw, UserRound } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { BookingTokenAmountIcon } from "@/components/booking-vector-icons";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { BookingDetailSkeleton } from "@/components/skeletons/booking/workspace";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { GENDER_LABELS } from "@/features/account/gender-picker";
import { BookingConfirmBody } from "@/features/booking/booking-confirm-body";
import { BookingPaymentClaims as BookingTokenClaims } from "@/features/booking/booking-payment-claims";
import { RoomRent, roomKindLabel } from "@/features/booking/booking-form-parts";
import { BOOKING_END_CAUSE, BOOKING_EVENT, BOOKING_STATUS, BOOKING_TOKEN_STATUS, bookingDateLabel, bookingDayLabel, bookingMomentLabel, bookingPartyLabel, parseBookingRent } from "@/features/booking/booking-ui";
import { OwnerBookingStatus } from "@/features/booking/owner-booking-status";
import { BookingCardRule, BookingFactBox, BookingFactPair, BookingInfoBand, BookingInitialsAvatar, BookingRoomAmenities, BookingRoomPhoto } from "@/features/booking/tenant-booking-parts";
import { BookingTokenVerifySheet, canVerifyToken, type TokenAnswer } from "@/features/booking/token-verify-sheet";
import { useBookingProperty } from "@/features/booking/use-booking-property";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput, IconButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { useAppDispatch } from "@/store/hooks";
import {
  bookingApi,
  useAcceptBookingOfferForPropertyMutation,
  useConfirmBookingForPropertyMutation,
  useCancelBookingForPropertyMutation,
  useGetPropertyBookingRequestQuery,
  useOfferBookingRentMutation,
  useOpenPropertyBookingRequestMutation,
  type BookingAction,
  type BookingRequest,
} from "@/store/services/booking-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

export default function OwnerBookingDetailScreen() {
  const params = useLocalSearchParams<{ propertyId?: string; requestId?: string }>();
  const scope = useBookingProperty();
  const { colors } = useTheme();
  const requestId = typeof params.requestId === "string" ? params.requestId : null;
  const matches = typeof params.propertyId === "string" && scope.property?.id === params.propertyId;
  if (matches && requestId && scope.canView && !scope.error) return <BookingDetailPage key={`${params.propertyId}:${requestId}`} propertyId={params.propertyId!} requestId={requestId} owner={scope.owner} />;
  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={false}>
    <ScreenHeader title="Review" italicTail="booking." subtitle="The request, its terms and where it stands." />
    {scope.loading ? <BookingDetailSkeleton /> : scope.error ? <>
      <NoticeBar tone="danger" title="Could not load this booking" message={errorMessage(scope.error)} />
      <View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={scope.retry} /></View>
    </> : <EmptyState icon={LockKeyhole} title="Booking unavailable" description="Select this booking's property on Home, then open the request again." />}
  </ScreenScrollView>;
}

function BookingDetailPage({ propertyId, requestId, owner }: { propertyId: string; requestId: string; owner: boolean }) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const [open] = useOpenPropertyBookingRequestMutation();
  const [opened, setOpened] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const opening = useRef<Promise<BookingRequest> | null>(null);
  // Deliberate detail entry only. Keep the same promise across Strict Mode's
  // effect replay; each effect subscribes, rather than posting a second open.
  useEffect(() => {
    let ignored = false;
    opening.current ??= open({ propertyId, requestId }).unwrap();
    opening.current.then((record) => {
      if (ignored) return;
      void dispatch(bookingApi.util.upsertQueryData("getPropertyBookingRequest", { propertyId, requestId }, record));
      setOpened(true);
      setOpenError(null);
    }, (caught) => { if (!ignored) setOpenError(errorMessage(caught)); });
    return () => { ignored = true; };
  }, [attempt, dispatch, open, propertyId, requestId]);
  const query = useGetPropertyBookingRequestQuery({ propertyId, requestId }, { skip: !opened, refetchOnFocus: true });
  const booking = query.currentData;
  const [action, setAction] = useState<BookingAction | null>(null);
  const [footerHeight, setFooterHeight] = useState(PINNED_FOOTER_CLEARANCE);
  // The tenant recorded the token as paid, and this reader is the one who answers: the owner, or whoever
  // handles the booking. "Received" is what moves the booking forward (user, 2026-10-11).
  const [tokenAnswer, setTokenAnswer] = useState<TokenAnswer | null>(null);
  const verifies = booking ? canVerifyToken(booking) : false;
  const hasFooter = Boolean(booking && (booking.allowedActions.length > 0 || verifies));

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingBottom: hasFooter ? footerHeight + spacing.lg : spacing.xl }} onRefresh={() => { if (opened) void query.refetch(); }}>
      <ScreenHeader title="Review" italicTail="booking." subtitle={booking ? `A booking request for ${booking.propertyName}.` : "The request, its terms and where it stands."} />
      {openError ? <>
        <NoticeBar tone="danger" title="Could not open this booking" message={openError} />
        <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => { opening.current = null; setOpenError(null); setAttempt((value) => value + 1); }} /></View>
      </> : !booking && !query.isError ? <BookingDetailSkeleton /> : null}
      {query.isError ? <>
        <NoticeBar tone="danger" title="Could not refresh this booking" message={errorMessage(query.error)} />
        <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void query.refetch()} variant="secondary" /></View>
      </> : null}
      {booking ? <BookingDetails booking={booking} owner={owner} /> : null}
    </ScreenScrollView>
    {booking && hasFooter ? <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      <View style={{ gap: spacing.sm }}>
        {/* The answer to a recorded token leads: it is what the booking is waiting on. */}
        {verifies ? <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton label="Not received" variant="dangerQuiet" onPress={() => setTokenAnswer("NOT_RECEIVED")} />
          <ActionButton label="Token received" onPress={() => setTokenAnswer("RECEIVED")} />
        </View> : null}
        {/* Cancel and Accept share a row, Cancel on the left (user, 2026-10-19). With Counter offer
            too, three do not fit a phone, so Counter offer takes the row above. */}
        {booking.allowedActions.includes("COUNTER") && booking.allowedActions.includes("ACCEPT") ? <View style={{ flexDirection: "row" }}>
          <ActionButton label="Counter offer" variant="primaryQuiet" onPress={() => setAction("COUNTER")} />
        </View> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {booking.allowedActions.includes("COUNTER") && !booking.allowedActions.includes("ACCEPT") ? <ActionButton label="Counter offer" variant="primaryQuiet" onPress={() => setAction("COUNTER")} /> : null}
          {booking.allowedActions.includes("CANCEL") ? <ActionButton label="Cancel booking" variant="dangerFilled" onPress={() => setAction("CANCEL")} /> : null}
          {booking.allowedActions.includes("ACCEPT") ? <ActionButton label={`Accept ${formatMoneyPaise(booking.currentRentPaise)}`} onPress={() => setAction("ACCEPT")} /> : null}
          {booking.allowedActions.includes("CONFIRM") ? <ActionButton label="Confirm booking" variant="success" onPress={() => setAction("CONFIRM")} /> : null}
        </View>
      </View>
    </PinnedFooter> : null}
    {booking && action ? <BookingDecisionSheet key={`${booking.id}:${action}`} booking={booking} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); void query.refetch(); }} /> : null}
    {booking && tokenAnswer ? <BookingTokenVerifySheet key={`${booking.id}:${tokenAnswer}`} booking={booking} answer={tokenAnswer} onClose={() => setTokenAnswer(null)} onDone={() => { setTokenAnswer(null); void query.refetch(); }} /> : null}
  </View>;
}

/**
 * One booking as the property reads it, laid out exactly as the tenant's own
 * view of it (`TenantBookingSummary` in `app/my-booking-detail.tsx`): the same
 * cards in the same order, drawn with the same pieces, so both sides are
 * looking at one screen (user, 2026-10-11). Only the words change with who is
 * reading. The buttons under it are the property's.
 */
function BookingDetails({ booking }: { booking: BookingRequest; owner: boolean }) {
  const { colors, fonts, type } = useTheme();
  const [roomTextHeight, setRoomTextHeight] = useState(72);
  const [policyOpen, setPolicyOpen] = useState(false);
  const pending = ["AWAITING_HANDLER", "AWAITING_TENANT"].includes(booking.status);
  const held = ["AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN", "TOKEN_RECEIVED", "CONFIRMED"].includes(booking.status) && !booking.tenancyId;
  const canAct = booking.allowedActions.length > 0;
  // The tenant asked for the room at its own listed rent. The server offers no counter then, and the screen says why.
  const atListedRent = booking.currentOfferBy === "TENANT" && booking.currentRentPaise === booking.listedRentPaise;
  const rentLabel = booking.agreedAt ? "Agreed monthly rent" : booking.currentOfferBy === "TENANT" ? "Tenant's proposed rent" : "Property's offer";
  // A section's name: the darkest ink, the heading face at its heaviest, and a step above the person's name
  // under it, so the two no longer read as one line repeated (user, 2026-10-11).
  const heading = { color: colors.ink, fontFamily: fonts.display, fontSize: 20 };
  // The yellow due line stands in for the token's "Due" chip, and only for that one.
  const tokenDueLine = booking.token?.status === "DUE" && Boolean(booking.tokenDueAt) && booking.status === "AWAITING_TOKEN";
  const personName = { color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 };
  const labelStyle = { color: colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 12 };
  const timeline = booking.history.map((item, index) => {
    const offer = booking.offers.find((entry) => entry.sequence === item.offerSequence);
    return { key: `event:${index}`, title: BOOKING_EVENT[item.type], at: item.occurredAt, note: item.note, by: bookingPartyLabel(item.party),
      offer: offer ? `${bookingPartyLabel(offer.madeBy)} offered ${formatMoneyPaise(offer.monthlyRentPaise)} / month${!offer.negotiable ? " · Final offer" : ""}` : null };
  });
  // Keep offers with no linked history entry visible too.
  for (const offer of booking.offers) {
    if (!booking.history.some((item) => item.offerSequence === offer.sequence)) timeline.push({
      key: `offer:${offer.sequence}`, title: offer.madeBy === "TENANT" ? "Tenant's offer" : "Property offer", at: offer.madeAt, note: null, by: null,
      offer: `${formatMoneyPaise(offer.monthlyRentPaise)} / month${!offer.negotiable ? " · Final offer" : ""}`,
    });
  }
  if (!booking.history.some((item) => item.type === "SUBMITTED")) timeline.unshift({ key: "submitted", title: "Request received", at: booking.submittedAt, note: null, by: null, offer: null });
  timeline.sort((left, right) => left.at.localeCompare(right.at));

  return <>
    {/* The handler's name sits under the reference only when there is a handler, as on the tenant's screen.
        With none, the chip already says "Awaiting handler": a second line saying nobody handles it repeated
        that, pressed against the card's bottom edge (user, 2026-10-11). A named handler gets room under it. */}
    <Card style={{ gap: spacing.xs, padding: spacing.md, paddingBottom: booking.handlerName ? spacing.sm : spacing.xxs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text style={labelStyle}>Ref</Text>
          <FitText selectable numberOfLines={1} minimumFontScale={0.65} style={[type.display, { color: colors.ink, fontSize: 21, fontWeight: "900" }]}>{booking.referenceCode}</FitText>
        </View>
        <OwnerBookingStatus status={booking.status} />
      </View>
      {booking.handlerName ? <Text style={[type.description, { color: colors.muted }]}>Handled by {booking.handlerName}</Text> : null}
    </Card>
    {booking.status === "AWAITING_TENANT" ? <NoticeBar title={booking.currentOfferNegotiable ? "The property has made an offer" : "This is the property's final price"} message={booking.currentOfferNegotiable ? "The tenant can accept, counter or withdraw." : "The tenant can accept this rent or withdraw. This offer cannot be countered."} tone="info" /> : null}
    {booking.agreedAt && !booking.tenancyId ? <NoticeBar title={booking.status === "TOKEN_RECEIVED" ? "Token received" : booking.status === "CONFIRMED" ? "Booking confirmed" : "Agreed terms are frozen"} message={booking.status === "TOKEN_RECEIVED" ? "The token payment has been verified. Review the agreed terms and confirm the booking below." : "The agreed rent, deposit, room and term are fixed. The stay is created when the tenant arrives."} tone={booking.status === "CONFIRMED" || booking.status === "TOKEN_RECEIVED" ? "success" : "info"} /> : null}

    <Card style={{ gap: spacing.md, padding: spacing.md }}>
      <Text style={heading}>Tenant details</Text>
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
            {held ? <View style={{ alignSelf: "flex-start", backgroundColor: colors.successSoft, borderRadius: 999, maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 4 }}><FitText numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.successText, fontFamily: fonts.sansSemiBold }]}>One bed held</FitText></View> : null}
          </View>
          <RoomRent paise={booking.agreedRentPaise ?? booking.currentRentPaise} size={19} />
        </View>
      </View>
      {(booking.roomAmenities?.length ?? 0) + (booking.roomCustomAmenities?.length ?? 0) > 0 ? <><BookingCardRule /><BookingRoomAmenities amenities={booking.roomAmenities ?? []} custom={booking.roomCustomAmenities ?? []} /></> : null}
      <BookingCardRule />
      <BookingFactPair left={<><View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}><CalendarDays color={colors.muted} size={17} /><Text style={labelStyle}>Move-in</Text></View><Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{bookingDateLabel(booking.moveInDate)}</Text></>} right={<View style={{ alignItems: "center", flexDirection: "row", gap: 7, flex: 1 }}><FileText color={colors.muted} size={19} /><FitText numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.muted, flex: 1 }]}>{booking.agreementMonths == null ? "Indefinite" : `Definite · ${booking.agreementMonths} month${booking.agreementMonths === 1 ? "" : "s"}`}</FitText></View>} />
      {booking.moveInDatePushed ? <Text style={[type.description, { color: colors.muted }]}>Originally {bookingDateLabel(booking.originalMoveInDate)}. The tenant's one date change has been used.</Text> : null}
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
      {/* Why there is no Counter offer under this one. It used to be said in a notice under the reference. */}
      {/* Why there is no Counter offer, as a small yellow notice with an i: the notice board's colour, in the
          small description type rather than a title and a message (user, 2026-10-11). */}
      {canAct && atListedRent && booking.status === "AWAITING_HANDLER" ? <View style={{ alignItems: "center", backgroundColor: colors.warningSoft, borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.sm + spacing.xs, paddingVertical: spacing.sm }}>
        <Info color={colors.warningText} size={18} strokeWidth={2} />
        <Text style={[type.description, { color: colors.ink, flex: 1 }]}>The tenant asked at the room's listed rent, so there is nothing to counter. Accept the request or cancel it.</Text>
      </View> : null}
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
      {booking.token?.refundDueSince ? <Text style={[type.description, { color: colors.muted }]}>Refund owed since {bookingDateLabel(booking.token.refundDueSince, true)}</Text> : null}
    </Card>
    {booking.bedReady === false ? <NoticeBar title="The booked bed is not free yet" message="End the departing stay and free this bed before the tenant can be moved in." tone="warning" /> : null}
    {booking.bedOffer ? <Card style={{ padding: spacing.md }}><Text style={heading}>Another bed offered</Text><Text style={[type.body, { color: colors.ink }]}>Room {booking.bedOffer.roomNumber} · {formatMoneyPaise(booking.bedOffer.monthlyRentPaise)} / month</Text><Text style={[type.description, { color: colors.muted }]}>This bed is not reserved until the tenant accepts. Their deposit and recorded token carry over.</Text></Card> : null}
    {booking.token?.claims.length ? <BookingTokenClaims token={booking.token} /> : null}
    {booking.tenancyId ? <NoticeBar title={booking.status === "MOVED_IN" ? "The stay has started" : "A stay was created"} message="Signing and move-in continue on the stay itself. This booking follows that stay and cannot be cancelled separately." tone="info" /> : null}
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
            {/* Who did it, which the property needs and the tenant's own screen does not. */}
            <Text style={[type.description, { color: colors.muted }]}>{item.by ? `${item.by} · ` : ""}{bookingDateLabel(item.at, true)}</Text>
            {item.offer ? <Text style={[type.description, { color: colors.muted }]}>{item.offer}</Text> : null}
            {item.note ? <Text style={[type.description, { color: colors.muted }]}>{item.note}</Text> : null}
          </View>
        </View>)}
      </View>
    </Card>
    {policyOpen ? <HowItWorksSheet eyebrow="Booking token" title="Token policy" onClose={() => setPolicyOpen(false)} steps={[
      { title: "Comes off the first bill", body: "The token is adjusted from the tenant's first cycle bill after the stay starts." },
      { title: "If the tenant cancels", body: booking.tokenRefundable ? "The token is refunded to the tenant." : "The token is not refunded." },
      { title: "If the property cancels", body: "The token is always owed back if the property cancels or cannot host the tenant." },
    ]} /> : null}
  </>;
}

function BookingDecisionSheet({ booking, action, onClose, onDone }: { booking: BookingRequest; action: BookingAction; onClose: () => void; onDone: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // Snapshot the record the decision was opened against, never upgrade a
  // stale offer/version while keeping a proposal typed against the old one.
  const [snapshot] = useState(booking);
  const [rent, setRent] = useState(String(booking.currentRentPaise / 100));
  const [negotiable, setNegotiable] = useState(true);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [finalHelp, setFinalHelp] = useState(false);
  // What the tenant can do with an offer is explained on the property's first counter of a booking and not
  // again on the next ones (user, 2026-10-11).
  const firstCounter = !snapshot.offers.some((made) => made.madeBy === "MANAGEMENT");
  const [accept] = useAcceptBookingOfferForPropertyMutation();
  const [confirm] = useConfirmBookingForPropertyMutation();
  const [offer] = useOfferBookingRentMutation();
  const [cancel] = useCancelBookingForPropertyMutation();
  async function submit() {
    if (busy.current || changed) return;
    const amount = parseBookingRent(rent);
    if (action === "COUNTER" && amount == null) { setFieldError("Enter a monthly rent above zero, with up to two decimal places."); return; }
    if (action === "CANCEL" && !reason.trim()) { setFieldError("Give the tenant a reason for cancelling."); return; }
    if (action === "CANCEL" && reason.trim().length > 500) { setFieldError("Keep the reason within 500 characters."); return; }
    busy.current = true;
    setWorking(true);
    setRefusal(null);
    const step = { propertyId: snapshot.propertyId, requestId: snapshot.id, version: snapshot.version };
    try {
      if (action === "ACCEPT") await accept({ ...step, offerSequence: snapshot.currentOfferSequence }).unwrap();
      else if (action === "CONFIRM") await confirm(step).unwrap();
      else if (action === "COUNTER") await offer({ ...step, offerSequence: snapshot.currentOfferSequence, rentPaise: amount!, negotiable }).unwrap();
      else await cancel({ ...step, reason: reason.trim() }).unwrap();
      toast.success(action === "CANCEL" ? "Booking cancelled." : action === "COUNTER" ? "Offer sent to the tenant." : action === "CONFIRM" ? "Booking confirmed." : "Terms accepted.");
      onDone();
    } catch (caught) { setRefusal(errorMessage(caught)); }
    finally { busy.current = false; setWorking(false); }
  }
  const changed = booking.version !== snapshot.version || booking.currentOfferSequence !== snapshot.currentOfferSequence || !booking.allowedActions.includes(action);
  const close = () => { if (!busy.current) onClose(); };
  // Accept carries its heading in its own body, centred under the tick, so the shell has no title for it.
  return <SheetShell title={action === "ACCEPT" || action === "CONFIRM" ? "" : action === "COUNTER" ? "Counter offer" : "Cancel booking?"} closeButtonVariant="raised" onClose={close}>
    {action === "CANCEL" ? <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs }}>
      <CircleAlert color={colors.danger} size={36} strokeWidth={1.8} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{snapshot.tenantName} · Room {snapshot.roomNumber}</Text>
        <Text selectable style={[type.description, { color: colors.muted }]}>{snapshot.referenceCode}</Text>
      </View>
    </View> : null}
    {action === "ACCEPT" || action === "CONFIRM" ? <BookingConfirmBody
      place={`${snapshot.propertyName} · Room ${snapshot.roomNumber}`}
      rentPaise={action === "CONFIRM" ? snapshot.agreedRentPaise ?? snapshot.currentRentPaise : snapshot.currentRentPaise}
      moveInDate={snapshot.moveInDate}
      agreementMonths={snapshot.agreementMonths ?? null}
      // With a token still to be paid, accepting agrees the terms and the booking is confirmed later. Said as it is.
      notice={action === "CONFIRM" ? `The token amount of ${formatMoneyPaise(snapshot.token?.amountPaise ?? snapshot.tokenPaise)} has been received. Confirming this booking keeps one bed reserved under these agreed terms.` : snapshot.tokenRequired ? "Accepting this offer agrees the terms and keeps one bed reserved. After the token is received, the property must confirm the booking." : "Accepting this offer confirms the booking and keeps one bed reserved."}
    /> : action === "COUNTER" ? <>
      <FormInput required label="Monthly rent" prefix="₹" value={rent} placeholder="Enter rent" keyboardType="decimal-pad" error={fieldError ?? undefined} disabled={working} onChangeText={(value) => { setRent(value); setFieldError(null); }} />
      {/* The room's own rent in one tap, in the blue of a main action, and beside it the one choice this offer
          carries: a square tick for a final counter, with a ? that says what that means (user, 2026-10-11). */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, flexDirection: "row" }}><ActionButton disabled={working} label="Use room rent" onPress={() => { setRent(String(snapshot.listedRentPaise / 100)); setFieldError(null); }} /></View>
        {/* The tick sits on a grey fill as tall as the button, with its ? close against it (user, 2026-10-11). */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
          <AnimatedPressable accessibilityLabel="Final counter" accessibilityRole="checkbox" accessibilityState={{ checked: !negotiable, disabled: working }} disabled={working} onPress={() => setNegotiable((current) => !current)} style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: 10, flexDirection: "row", gap: spacing.xs, minHeight: 48, paddingHorizontal: spacing.sm }}>
            <View style={{ alignItems: "center", backgroundColor: negotiable ? colors.surface : colors.primary, borderColor: negotiable ? colors.borderStrong : colors.primary, borderRadius: 5, borderWidth: 2, height: 22, justifyContent: "center", width: 22 }}>
              {negotiable ? null : <Check color={colors.onPrimary} size={15} strokeWidth={3} />}
            </View>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>Final counter</Text>
          </AnimatedPressable>
          <IconButton accessibilityLabel="What a final counter is" icon={CircleHelp} onPress={() => setFinalHelp(true)} />
        </View>
      </View>
      {firstCounter ? <NoticeBar title={negotiable ? "The tenant can accept, counter or cancel the booking" : "The tenant can accept or cancel the booking"} tone="info" message={negotiable ? "A counter from the tenant comes back to you to answer." : "A final counter cannot be answered with another price."} /> : null}
      <NoticeBar title={`Deadline remains ${bookingDateLabel(snapshot.expiresAt, true)}`} tone="warning" message="A new offer does not restart the request's clock." />
    </> : <>
      <View style={{ gap: spacing.xs }}>
        <FormInput label="Reason for cancellation" required multiline borderOnContainer maxLength={500} radius={10} value={reason} placeholder="Tell the tenant why you are cancelling this booking." labelStyle={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }} inputStyle={{ backgroundColor: colors.neutralSoft, minHeight: 90, borderWidth: 1 }} error={fieldError ?? undefined} disabled={working} onChangeText={(value) => { setReason(value); setFieldError(null); }} />
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: 10, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
        <AlertTriangle color={colors.warningText} size={25} strokeWidth={1.9} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.description, { color: colors.ink }]}>The reserved bed will be released.</Text>
          {/* The property cancelling always owes a received token back, with no other option, and the app takes
              no part in paying it (user, 2026-10-28). */}
          {snapshot.token?.status === "RECEIVED" ? <>
            <Text style={[type.description, { color: colors.ink }]}>The token of <Text style={{ fontFamily: fonts.sansBold }}>{formatMoneyPaise(snapshot.token.amountPaise)}</Text> already received must be refunded to {snapshot.tenantName}. It will be recorded as refundable.</Text>
            <Text style={[type.description, { color: colors.muted }]}>Khatiyan does not handle refunds. Refunding the token is solely the property's responsibility.</Text>
          </> : null}
        </View>
      </View>
    </>}
    {changed ? <NoticeBar title="The request changed" tone="warning" message="Close this and look at the latest details before deciding." /> : null}
    <View style={{ flexDirection: "row", gap: spacing.sm }}><ActionButton label={action === "CANCEL" ? "Keep booking" : action === "ACCEPT" || action === "CONFIRM" ? "Not now" : "Close"} disabled={working} variant={action === "ACCEPT" || action === "CONFIRM" ? "primaryQuiet" : "secondary"} onPress={close} /><ActionButton disabled={working || changed || fieldError !== null} label={working ? "Saving..." : action === "ACCEPT" || action === "CONFIRM" ? "Confirm booking" : action === "COUNTER" ? "Send offer" : "Cancel booking"} variant={action === "CANCEL" ? "dangerFilled" : action === "CONFIRM" ? "success" : "primary"} onPress={() => void submit()} /></View>
    {/* A refusal the reader cannot fix by retyping is acknowledged, not left on the page. */}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    {finalHelp ? <HowItWorksSheet eyebrow="Counter offer" title="Final counter" onClose={() => setFinalHelp(false)} steps={[
      { title: "Your last price", body: "A final counter is the property's last word on the rent for this booking." },
      { title: "What the tenant can do", body: "The tenant can accept it or cancel the booking. They cannot send another price." },
      { title: "The deadline stays", body: "The request keeps its deadline. If the tenant has not answered by then, it expires and the bed is released." },
    ]} /> : null}
  </SheetShell>;
}
