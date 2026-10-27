import { useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { ArrowRight, BedDouble, CalendarCheck, CalendarDays, ChevronDown, ChevronUp, CircleHelp, Fan, FileText, IndianRupee, Snowflake, Wallet } from "lucide-react-native";

import { AgreementMonthDropdown } from "@/components/agreement-month-dropdown";
import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { PickerOptionRow } from "@/components/picker-option-row";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { SelectionTabs } from "@/components/selection-tabs";
import { BookingRequestSkeleton } from "@/components/skeletons/booking/tenant";
import { useHardwareBack } from "@/components/use-hardware-back";
import { GENDER_LABELS } from "@/features/account/gender-picker";
import { BookingDateField } from "@/features/booking/booking-date-field";
import { BedChoiceRow, BookingGenderChips, BookingPropertyCard, BookingStepper, CardHeading, ChoiceChip, EditLink, Hairline, RadioOption, ReadOnlyField, RoomAmenityRow, RoomChoiceCard, RoomPhotosCard, RoomPhotosWindow, RoomRent, TermRow, VacancyChip, VerifiedAdult, roomKindLabel } from "@/features/booking/booking-form-parts";
import { bookingPerson, bookingRequestBody, bookingReviewDeadline, bookingRoomBeds, bookingRoomStatus, bookingStayHoldsStart, newBookingSubmissionKey, validateBookingStep, type BookingBed, type BookingChoices, type BookingDraft } from "@/features/booking/booking-request-form";
import { bookingDateLabel, bookingDayLabel, bookingRangeLabel, parseBookingRent } from "@/features/booking/booking-ui";
import { InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput, IconButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { compareFloors, formatFloor } from "@/features/property/floor";
import { BookingsIcon } from "@/features/property/property-control-icons";
import { indiaDate } from "@/features/visits/visit-clock";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useGetMyIdentityQuery, type AuthUser, type UserIdentity } from "@/store/services/auth-api";
import { useCreateBookingRequestMutation, useGetBookingFormOptionsQuery, type BookingFormOptions, type BookingFormRoom, type CreateBookingRequestPayload } from "@/store/services/booking-api";
import type { RoomConditioning } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

export default function BookingRequestScreen() {
  const { enquiryId } = useLocalSearchParams<{ enquiryId?: string }>();
  const router = useGuardedRouter();
  const { colors } = useTheme();
  const authUser = useAppSelector((state) => state.auth.user);
  const id = typeof enquiryId === "string" ? enquiryId : "";
  const query = useGetBookingFormOptionsQuery(id, { skip: !id, refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const identityQuery = useGetMyIdentityQuery(undefined, { skip: !id });
  const options = query.currentData;
  if (options?.canBook && (!identityQuery.isLoading || identityQuery.currentData)) return <BookingRequestForm key={id} options={options} identity={identityQuery.currentData ?? null} authUser={authUser} onRefresh={() => { void query.refetch(); }} />;
  // Nothing can be sent from this visit. Said as an empty state, with the
  // server's own sentence for why (user, 2026-10-10). The page pulls to
  // refresh, so a property that has since opened bookings is found again.
  const unavailable = Boolean(id) && !query.isError && Boolean(options) && !options?.canBook;
  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={unavailable} onRefresh={() => { void query.refetch(); }}>
    <ScreenHeader title="Book a" italicTail="stay." subtitle="Reserve a bed at a property you have visited." />
    {/* A shared button fills its row. Left bare in this page's column it grew
        to fill the screen, so each one sits in a row of its own. */}
    {!id ? <EmptyState icon={CalendarCheck} title="Start from an attended visit" description="Open My visits or My enquiries and choose Book a stay on the property you visited." action={<View style={{ alignSelf: "stretch", flexDirection: "row" }}><ActionButton label="My visits" onPress={() => router.push("/my-visits")} /></View>} />
      : query.isError ? <><NoticeBar title="Could not load booking availability" message={errorMessage(query.error)} tone="danger" /><View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={() => void query.refetch()} /></View></>
      : !options || (options.canBook && identityQuery.isLoading) ? <BookingRequestSkeleton />
      : options.existingRequestId ? <EmptyState artworkNode={<BookingsIcon size={64} />} title="You already have a booking here" description={options.whyNot ?? "Open it to see where it stands."} action={<View style={{ alignSelf: "stretch", flexDirection: "row" }}><ActionButton label="View existing booking" onPress={() => router.replace({ pathname: "/my-booking-detail", params: { requestId: options.existingRequestId! } })} /></View>} />
      : <EmptyState artworkNode={<BookingsIcon size={64} />} title="Booking unavailable" description={options.whyNot ?? "This property is not available for booking yet."} />}
  </ScreenScrollView>;
}

/**
 * The booking form, step by step, as the user's own demo screens lay it out
 * (2026-10-10): Details, Room, Terms, Review.
 *
 * <p>Where the demo and the rules differ, the rules win. The person's details
 * are carried from their profile and are not typed here. Move-in is 3 to 21
 * days out and every date comes from the server. The token and the deposit
 * are shown, because a request freezes them. Rooms have no photos, so none
 * are drawn. Pills carry no dots.
 *
 * <p>The Room step has two screens of its own, the list and then the chosen
 * room's beds. A step already done takes a tap on its circle, and the
 * hardware back button steps back, since the screen has no back row.
 */
function BookingRequestForm({ options, identity, authUser, onRefresh }: { options: BookingFormOptions; identity: UserIdentity | null; authUser: Pick<AuthUser, "fullName" | "phone"> | null; onRefresh?: () => void }) {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<BookingChoices>(() => ({ roomId: "", exitRequestId: null, moveInDate: "", negotiate: false, proposedRent: "", agreementMonths: null }));
  const [errors, setErrors] = useState<Partial<Record<keyof BookingDraft, string>>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<CreateBookingRequestPayload | null>(null);
  // The Room step's second screen: the chosen room's beds and the date.
  const [bedView, setBedView] = useState(false);
  const [roomMode, setRoomMode] = useState<"NUMBER" | "TYPE">("NUMBER");
  const [search, setSearch] = useState("");
  const [conditioning, setConditioning] = useState<RoomConditioning | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [tokenHelp, setTokenHelp] = useState(false);
  // The Room number tab's floor filter. Null is every floor.
  const [floor, setFloor] = useState<string | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  // How tall the room's own lines are on Your room, number to rent, so its photos stand exactly as tall.
  const [roomLinesHeight, setRoomLinesHeight] = useState(0);
  const [create] = useCreateBookingRequestMutation();

  const today = indiaDate();
  // Read from the profile on every render, so a detail added there is here on the way back.
  const person = bookingPerson(identity, authUser);
  const draft: BookingDraft = { ...choices, ...person };
  const profile = validateBookingStep(0, draft, options, today);
  const profileBlocked = Object.keys(profile).length > 0;
  const room = options.rooms.find((item) => item.roomId === draft.roomId);
  const beds = bookingRoomBeds(options, room);
  const bed = beds.find((item) => item.exitRequestId === draft.exitRequestId) ?? null;
  const proposed = draft.negotiate ? parseBookingRent(draft.proposedRent) : null;
  const rent = proposed ?? room?.listedRentPaise ?? 0;
  // What is owed is fixed when terms are agreed, and is never more than a month of the agreed rent.
  const token = options.tokenRequired ? Math.min(options.tokenAmountPaise, rent) : 0;
  const tokenLine = options.tokenRequired ? `${formatMoneyPaise(token)} · ${options.tokenRefundable ? "Refundable" : "Not refundable"}` : "No token";
  const disabled = working || uncertain;
  const propertyName = options.propertyName ?? "this property";

  function change<K extends keyof BookingChoices>(field: K, value: BookingChoices[K]) {
    if (disabled) return;
    setChoices((current) => ({ ...current, [field]: value }));
    setErrors({});
  }
  /** Names one bed, and keeps the date already picked where that bed still takes it. */
  function take(chosen: BookingFormRoom, picked: BookingBed) {
    setChoices((current) => ({ ...current, roomId: chosen.roomId, exitRequestId: picked.exitRequestId, moveInDate: current.moveInDate >= picked.earliest && current.moveInDate <= picked.latest ? current.moveInDate : picked.earliest }));
    setErrors({});
  }
  function chooseRoom(chosen: BookingFormRoom) {
    if (disabled) return;
    // A second tap on the chosen room lets it go, on either tab (user, 2026-10-11).
    if (chosen.roomId === draft.roomId) {
      setChoices((current) => ({ ...current, roomId: "", exitRequestId: null, moveInDate: "" }));
      setErrors({});
      return;
    }
    const open = bookingRoomBeds(options, chosen);
    if (open.length === 0) return;
    // Its first bed: one free today where there is one.
    take(chosen, open[0]);
  }
  function goTo(target: number) {
    if (disabled) return;
    setErrors({});
    setBedView(false);
    setStep(target);
  }
  function back() {
    if (disabled) return;
    setErrors({});
    if (step === 1 && bedView) setBedView(false);
    else if (step === 2) { setBedView(true); setStep(1); }
    else setStep((value) => Math.max(0, value - 1));
  }
  function next() {
    if (disabled) return;
    if (step === 1 && !bedView) {
      if (beds.length === 0) { setErrors({ roomId: "Choose a room with a bed you can book." }); return; }
      setErrors({});
      setBedView(true);
      return;
    }
    const fields = validateBookingStep(step, draft, options, today);
    setErrors(fields);
    if (Object.keys(fields).length) return;
    if (step === 0) setBedView(false);
    setStep((value) => value + 1);
  }
  async function submit() {
    if (busy.current || !options.canBook) return;
    const fields = validateBookingStep(3, draft, options, today);
    if (Object.keys(fields).length && !attempt.current) {
      // Something moved under the form: a bed taken, a detail removed. Back to
      // the step that holds it, with the reason under its own field.
      setErrors(fields);
      if (fields.name || fields.phone || fields.gender || fields.dateOfBirth) setStep(0);
      else if (fields.roomId) { setBedView(false); setStep(1); }
      else if (fields.moveInDate) { setBedView(true); setStep(1); }
      else setStep(2);
      return;
    }
    // An unknown network result locks this exact payload. Retry never changes
    // its key, date, price or bed, and cannot create a second request.
    attempt.current ??= bookingRequestBody(draft, options.enquiryId, newBookingSubmissionKey());
    busy.current = true; setWorking(true); setRefusal(null);
    try {
      const booking = await create(attempt.current).unwrap();
      router.replace({ pathname: "/my-booking-detail", params: { requestId: booking.id } });
    } catch (caught) {
      const status = typeof caught === "object" && caught && "status" in caught ? caught.status : null;
      const definiteRefusal = typeof status === "number" && [400, 401, 403, 404, 409, 422].includes(status);
      if (definiteRefusal) { attempt.current = null; setRefusal(errorMessage(caught)); }
      setUncertain(!definiteRefusal);
    } finally { busy.current = false; setWorking(false); }
  }
  // Back steps through the form. While a result is unknown it leaves, as before, and the request can be checked in My bookings.
  useHardwareBack(() => { back(); return true; }, step > 0 && !uncertain);

  const listing = step === 1 && !bedView;
  const header = step === 0 ? { title: "Book a", tail: "stay.", subtitle: "Reserve a bed at a property you have visited." }
    : listing && roomMode === "TYPE" ? { title: "Find a", tail: "room.", subtitle: `Choose your preferences at ${propertyName}.` }
    : listing ? { title: "Choose a", tail: "room.", subtitle: `Pick a room at ${propertyName}.` }
    : step === 1 ? { title: "Your", tail: "room.", subtitle: "Choose one bed and your move-in date." }
    : step === 2 ? { title: "Stay", tail: "terms.", subtitle: "Set your move-in date, rent and agreement." }
    : { title: "Review", tail: "request.", subtitle: "Check your details before reserving one bed." };
  const footer = step === 0 ? { label: "Continue to rooms", blocked: profileBlocked }
    : listing ? { label: beds.length > 0 && room ? `Continue with ${room.roomNumber}` : "Continue", blocked: beds.length === 0 }
    : step === 1 ? { label: "Continue to terms", blocked: false }
    : step === 2 ? { label: "Review request", blocked: false }
    : { label: working ? "Sending..." : uncertain ? "Retry same request" : "Submit booking request", blocked: false };
  const deadline = bookingReviewDeadline(Date.now(), draft.moveInDate);
  const heading = { color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 } as const;
  const hint = [type.description, { color: colors.muted }];

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenScrollView key={`${step}-${bedView}`} surface={colors.background} safeAreaEdges={["top"]} refreshable={listing && !disabled && Boolean(onRefresh)} onRefresh={onRefresh} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }}>
      <ScreenHeader title={header.title} italicTail={header.tail} subtitle={header.subtitle} />
      {step === 0 ? <BookingPropertyCard name={options.propertyName} area={options.propertyArea} city={options.propertyCity} visitedOn={options.visitedOn} /> : null}
      <BookingStepper step={step} disabled={disabled} onJump={goTo} />
      {uncertain ? <NoticeBar title="Check before changing this request" message="The connection ended before we could confirm the result. Retry sends the exact same request, not a second booking. You can also check My bookings." tone="warning" /> : null}
      {uncertain ? <View style={{ flexDirection: "row" }}><ActionButton label="Check My bookings" onPress={() => router.push("/my-bookings")} variant="secondary" /></View> : null}

      {step === 0 ? <Card>
        <Text style={heading}>Your details</Text>
        <ReadOnlyField label="Full name" value={person.name} error={profile.name} />
        <ReadOnlyField label="Phone number" value={person.phone ? formatIndianPhone(person.phone) : ""} error={profile.phone} />
        <ReadOnlyField label="Email" value={person.email} />
        <BookingGenderChips value={person.gender} error={profile.gender} />
        <ReadOnlyField label="Date of birth" icon={CalendarDays} value={person.dateOfBirth ? bookingDateLabel(person.dateOfBirth) : ""} error={profile.dateOfBirth} />
        {profile.dateOfBirth ? null : <VerifiedAdult verified={Boolean(identity?.identityVerified)} />}
        {profileBlocked ? <View style={{ flexDirection: "row" }}><ActionButton label="Open my profile" variant="secondary" onPress={() => router.push("/account-settings")} /></View> : null}
        {options.windowEndsOn ? <NoticeBar title="Booking window open" tone="info" message={`You can request a booking until ${bookingDateLabel(options.windowEndsOn)}. ${options.requestsLeft} request${options.requestsLeft === 1 ? "" : "s"} left for this visit.`} /> : null}
      </Card> : null}

      {listing ? <RoomList options={options} mode={roomMode} search={search} conditioning={conditioning} capacity={capacity} selectedRoomId={draft.roomId} disabled={disabled} error={errors.roomId} floor={floor} floorOpen={floorOpen} onMode={setRoomMode} onSearch={setSearch} onConditioning={setConditioning} onCapacity={setCapacity} onFloor={setFloor} onFloorOpen={setFloorOpen} onChoose={chooseRoom} /> : null}

      {step === 1 && bedView && room ? <>
        <Card>
          {/* The room on one side and its room type's photos on the other, as on the demo (user, 2026-10-10). */}
          {/* The photos run from the room number down to the rent line and no further (user, 2026-10-10).
              The row does not stretch its columns, so what is measured is the lines themselves
              and the window can never hold the row taller than they are. */}
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
            <View onLayout={(event) => setRoomLinesHeight(Math.round(event.nativeEvent.layout.height))} style={{ flex: 1, gap: spacing.sm }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 22 }}>{room.roomNumber}</Text>
                <Text style={[type.description, { color: colors.muted }]}>{propertyName}</Text>
                <Text style={[type.description, { color: colors.muted }]}>{roomKindLabel(room)}</Text>
                {/* The floor on a line of its own (user, 2026-10-11). */}
                {room.floor ? <Text style={[type.description, { color: colors.muted }]}>{formatFloor(room.floor)}</Text> : null}
              </View>
              <RoomRent paise={room.listedRentPaise} size={19} />
            </View>
            <View style={{ width: "46%" }}>
              <RoomPhotosWindow height={roomLinesHeight || 112} emptyHeight={roomLinesHeight || 112} images={room.imageUrls ?? []} />
            </View>
          </View>
          <Hairline />
          <RoomAmenityRow room={room} />
        </Card>
        <Card>
          <Text style={heading}>Available beds</Text>
          <BedChoiceRow title="Current vacancy" count={`${room.freeBeds} bed${room.freeBeds === 1 ? "" : "s"}`} selected={bed?.exitRequestId === null} disabled={disabled || !beds.some((item) => item.exitRequestId === null)} onPress={() => { const free = beds.find((item) => item.exitRequestId === null); if (free && !disabled) take(room, free); }} />
          {beds.filter((item) => item.exitRequestId !== null).map((item) => <BedChoiceRow key={item.exitRequestId} title="Future vacancy" note={item.checkoutDate ? `Confirmed move-out: ${bookingDayLabel(item.checkoutDate)}` : null} count={`From ${bookingDayLabel(item.earliest)}`} selected={bed?.exitRequestId === item.exitRequestId} disabled={disabled} onPress={() => { if (!disabled) take(room, item); }} />)}
          {/* Always there, like Current vacancy. With no bed being vacated it reads 0 beds and is greyed (user, 2026-10-10). */}
          {beds.some((item) => item.exitRequestId !== null) ? null : <BedChoiceRow title="Future vacancy" count="0 beds" selected={false} disabled onPress={() => {}} />}
          {bed?.exitRequestId ? <NoticeBar tone="warning" title="Move in after the current checkout" message={`This bed is available from ${bookingDateLabel(bed.earliest)}.`} /> : null}
          {errors.roomId ? <Text style={[type.caption, { color: colors.danger }]}>{errors.roomId}</Text> : null}
        </Card>
        {bed ? <Card>
          <Text style={heading}>Move-in date</Text>
          <BookingDateField hideLabel label="Move-in date" value={draft.moveInDate} minimum={bed.earliest} maximum={bed.latest} error={errors.moveInDate} disabled={disabled} onChange={(value) => change("moveInDate", value)} />
          <Text style={hint}>Choose {bookingRangeLabel(bed.earliest, bed.latest)} for this bed.</Text>
          <NoticeBar tone="info" title="Why these dates" message={moveInReason(options)} />
        </Card> : null}
      </> : null}

      {step === 2 && room ? <>
        <Card>
          <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 16 }}>Room {room.roomNumber} · {roomKindLabel(room)}</Text>
          <Text style={[type.description, { color: colors.muted }]}>{propertyName}</Text>
        </Card>
        {bed ? <Card>
          <CardHeading icon={CalendarDays} title="Move-in date" />
          <BookingDateField hideLabel label="Move-in date" value={draft.moveInDate} minimum={bed.earliest} maximum={bed.latest} error={errors.moveInDate} disabled={disabled} onChange={(value) => change("moveInDate", value)} />
          <Text style={hint}>Choose {bookingRangeLabel(bed.earliest, bed.latest)}. Requests are made 3 to 21 days before move-in.</Text>
        </Card> : null}
        <Card>
          <CardHeading icon={IndianRupee} title="Monthly rent" />
          <View style={{ gap: 2 }}>
            <Text style={[type.description, { color: colors.muted }]}>Listed rent</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 17 }}>{formatMoneyPaise(room.listedRentPaise)} / month</Text>
          </View>
          <View style={{ gap: spacing.xs }}>
            <RadioOption label="Use listed rent" selected={!draft.negotiate} disabled={disabled} onPress={() => change("negotiate", false)} />
            <RadioOption label="Negotiate rent" selected={draft.negotiate} disabled={disabled} onPress={() => change("negotiate", true)} />
          </View>
          {draft.negotiate ? <>
            <FormInput label="Your proposed monthly rent" required prefix="₹" keyboardType="decimal-pad" value={draft.proposedRent} placeholder="Enter your offer" error={errors.proposedRent} disabled={disabled} onChangeText={(value) => change("proposedRent", value)} />
            <Text style={hint}>The property team may accept or counter your offer.</Text>
          </> : null}
        </Card>
        <Card>
          <CardHeading icon={FileText} title="Agreement" />
          <View style={{ columnGap: spacing.xl, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
            <RadioOption label="Indefinite" selected={draft.agreementMonths == null} disabled={disabled} onPress={() => change("agreementMonths", null)} />
            <RadioOption label="Definite" selected={draft.agreementMonths != null} disabled={disabled} onPress={() => change("agreementMonths", draft.agreementMonths ?? 1)} />
          </View>
          {draft.agreementMonths != null ? <>
            <AgreementMonthDropdown label="Duration" disabled={disabled} value={draft.agreementMonths} onChange={(value) => change("agreementMonths", value)} />
            {errors.agreementMonths ? <Text style={[type.caption, { color: colors.danger }]}>{errors.agreementMonths}</Text> : <Text style={hint}>Choose 1 to 11 months.</Text>}
          </> : null}
        </Card>
        <Card>
          <CardHeading icon={Wallet} title="Token and deposit" trailing={<IconButton accessibilityLabel="How the token works" icon={CircleHelp} onPress={() => setTokenHelp(true)} />} />
          <View>
            <TermRow first label="Deposit" value={formatMoneyPaise(options.depositPaise)} />
            <TermRow label="Token" value={tokenLine} />
          </View>
        </Card>
      </> : null}

      {step === 3 && room ? <>
        <Card>
          {/* Both ways back sit here, on the first card's heading line, as the demo has them (user, 2026-10-11).
              The person's own details are not the form's to change, so the two are Room and Terms. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <Text style={[heading, { flex: 1 }]}>Your details</Text>
            <EditLink label="Room" disabled={disabled} onPress={() => goTo(1)} />
            <EditLink label="Terms" disabled={disabled} onPress={() => goTo(2)} />
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <InitialsAvatar name={person.name} />
            <View style={{ flex: 1, gap: 1 }}>
              <FitText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{cardName(person.name)}</FitText>
              <Text style={[type.description, { color: colors.muted }]}>{formatIndianPhone(person.phone)}</Text>
              {person.email ? <Text style={[type.description, { color: colors.muted }]}>{person.email}</Text> : null}
              <Text style={hint}>{person.gender ? GENDER_LABELS[person.gender] : ""} · Born {bookingDateLabel(person.dateOfBirth)}</Text>
            </View>
          </View>
        </Card>
        <Card>
          <Text style={heading}>Room details</Text>
          {/* The room type's photos beside the room, as the demo has them: the same window as on the other steps. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            {/* A tall window, empty or not (user, 2026-10-11). Beside it, as the user set them the same day:
                the property's name in the heaviest face, the room on one line and its kind on the next in
                the description type, and the bed in a pale pill. A property mark beside the name was tried
                and taken out the same day. */}
            <View style={{ width: "40%" }}>
              <RoomPhotosWindow height={REVIEW_PHOTO_HEIGHT} emptyHeight={REVIEW_PHOTO_HEIGHT} images={room.imageUrls ?? []} />
            </View>
            <View style={{ flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: REVIEW_PHOTO_HEIGHT }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15, lineHeight: 20 }}>{propertyName}</Text>
              <View>
                <Text style={[type.description, { color: colors.muted }]}>Room {room.roomNumber}</Text>
                <Text style={[type.description, { color: colors.muted }]}>{roomKindLabel(room)}</Text>
              </View>
              <View style={{ flexDirection: "row" }}>
                <VacancyChip label={bed?.exitRequestId ? `1 bed from ${bookingDayLabel(bed.earliest)}` : "1 current bed"} tone={bed?.exitRequestId ? "warning" : "success"} />
              </View>
            </View>
          </View>
        </Card>
        <Card>
          <Text style={heading}>Terms & conditions</Text>
          <View>
            <TermRow first label="Booking date" value={bookingDateLabel(today)} />
            <TermRow label="Move-in date" value={bookingDateLabel(draft.moveInDate)} />
            <TermRow label="Listed rent" value={`${formatMoneyPaise(room.listedRentPaise)} / month`} />
            {proposed != null ? <TermRow strong label="Your proposed rent" value={`${formatMoneyPaise(proposed)} / month`} /> : null}
            <TermRow label="Agreement" value={draft.agreementMonths == null ? "Indefinite" : `Definite · ${draft.agreementMonths} month${draft.agreementMonths === 1 ? "" : "s"}`} />
            <TermRow label="Deposit" value={formatMoneyPaise(options.depositPaise)} />
            <TermRow label="Token" value={tokenLine} />
          </View>
        </Card>
        <NoticeBar tone="info" title="One bed will be reserved" message="Submitting holds a bed while your request is reviewed." />
        <NoticeBar tone="warning" title={deadline.beforeMoveIn ? "Review window" : "7-day review window"} message={`This request expires on ${bookingDateLabel(new Date(deadline.at).toISOString(), true)} if unresolved.`} />
      </> : null}
    </ScreenScrollView>
    {/* One button, as on the demo. The way back is the stepper, the edit links and the hardware button. */}
    <PinnedFooter><View style={{ flexDirection: "row" }}><ActionButton disabled={working || footer.blocked} label={footer.label} trailingIcon={step === 0 ? ArrowRight : undefined} onPress={() => { if (step === 3) void submit(); else next(); }} /></View></PinnedFooter>
    {tokenHelp ? <HowItWorksSheet eyebrow="Booking token" title="How the token works" onClose={() => setTokenHelp(false)} steps={tokenSteps(options)} /> : null}
    {/* A refusal is said in a dialog. What is under a field stays under the field. */}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
  </View>;
}

/** How tall the room type's photos stand on Review, beside the room's lines. */
const REVIEW_PHOTO_HEIGHT = 132;

/** Why the dates run from where they do to where they do, in two sentences. */
function moveInReason(options: BookingFormOptions) {
  const last = options.latestMoveInDate ? bookingDateLabel(options.latestMoveInDate) : "";
  if (options.currentStayEndsOn && bookingStayHoldsStart(options)) return `Your current stay ends on ${bookingDateLabel(options.currentStayEndsOn)}, so you can move in from the day after. The last day you can ask for today is ${last}, 21 days from now.`;
  return `For a request sent today, move-in can be ${options.earliestMoveInDate && options.latestMoveInDate ? bookingRangeLabel(options.earliestMoveInDate, options.latestMoveInDate) : "3 to 21 days out"}, 3 to 21 days from now. A bed being vacated may start later.`;
}

function tokenSteps(options: BookingFormOptions) {
  if (!options.tokenRequired) return [
    { title: "No token here", body: "This property takes no token. Agreeing terms confirms your booking at once." },
    { title: "If you cancel", body: "Cancelling a confirmed booking closes this visit's booking window, and you cannot book at this property again for 30 days." },
  ];
  return [
    { title: "Paid to the property", body: "You pay the token straight to the property once terms are agreed. Khatiyan keeps a record of it and does not collect it." },
    { title: "Never more than a month's rent", body: "The token is never more than one month of the agreed rent. It comes off your first rent bill, never the deposit." },
    { title: "If plans change", body: `${options.tokenRefundable ? "If you cancel, the token is refunded." : "If you cancel, the token is not refunded."} If the property cancels or cannot give you the bed, it must refund the token.` },
  ];
}

/**
 * The Room step's first screen: every active room, found by its number and
 * floor, or by its type and how many share it. Choosing one holds nothing.
 *
 * <p>The floor picker sits inside the search box, behind the box's own rule,
 * as the app's other filters beside a search do. Its list opens in place under
 * the box, never in a sheet. A property on one floor has no picker.
 */
function RoomList({ options, mode, search, conditioning, capacity, floor, floorOpen, selectedRoomId, disabled, error, onMode, onSearch, onConditioning, onCapacity, onFloor, onFloorOpen, onChoose }: { options: BookingFormOptions; mode: "NUMBER" | "TYPE"; search: string; conditioning: RoomConditioning | null; capacity: number | null; floor: string | null; floorOpen: boolean; selectedRoomId: string; disabled: boolean; error?: string; onMode: (mode: "NUMBER" | "TYPE") => void; onSearch: (value: string) => void; onConditioning: (value: RoomConditioning | null) => void; onCapacity: (value: number | null) => void; onFloor: (value: string | null) => void; onFloorOpen: (open: boolean) => void; onChoose: (room: BookingFormRoom) => void }) {
  const { colors, fonts, type } = useTheme();
  const wanted = search.trim().toLowerCase();
  const floorOf = (room: BookingFormRoom) => (room.floor ?? "").trim();
  // The floors this property has, in the order a building has them.
  const floors = [...new Set(options.rooms.map(floorOf))].sort(compareFloors);
  const pickFloor = floors.length > 1;
  const onFloorNow = pickFloor && floor != null && floors.includes(floor) ? floor : null;
  const shown = options.rooms
    .filter((room) => mode === "NUMBER" ? room.roomNumber.toLowerCase().includes(wanted) && (onFloorNow == null || floorOf(room) === onFloorNow) : (conditioning == null || room.conditioning === conditioning) && (capacity == null || room.capacity === capacity))
    .map((room) => ({ room, status: bookingRoomStatus(options, room) }))
    // Rooms with a bed to ask for come first. The server's order holds inside each group.
    .sort((a, b) => Number(b.status.selectable) - Number(a.status.selectable));
  const capacities = [...new Set(options.rooms.map((room) => room.capacity))].sort((a, b) => a - b);
  const label = { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 } as const;
  const chooseFloor = (value: string | null) => { onFloor(value); onFloorOpen(false); };
  return <View style={{ gap: spacing.md }}>
    <SelectionTabs active={mode} distributed options={[{ value: "NUMBER", label: "Room number" }, { value: "TYPE", label: "Type & occupancy" }]} onChange={(value) => { if (!disabled) onMode(value); }} />
    {mode === "NUMBER" ? <>
      <SearchField placeholder="Search room number" value={search} onChangeText={onSearch} trailing={pickFloor ? (
        <AnimatedPressable accessibilityLabel="Filter rooms by floor" accessibilityRole="button" accessibilityState={{ expanded: floorOpen, selected: onFloorNow != null }} disabled={disabled} hitSlop={6} onPress={() => onFloorOpen(!floorOpen)} style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <FitText numberOfLines={1} style={{ color: onFloorNow != null ? colors.primaryDeep : colors.ink, fontFamily: fonts.displaySoft, fontSize: 13.5 }}>{onFloorNow == null ? "All floors" : formatFloor(onFloorNow)}</FitText>
          <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 26, justifyContent: "center", width: 26 }}>
            {floorOpen ? <ChevronUp color={colors.ink} size={16} strokeWidth={2.4} /> : <ChevronDown color={colors.ink} size={16} strokeWidth={2.4} />}
          </View>
        </AnimatedPressable>
      ) : undefined} />
      {pickFloor && floorOpen ? <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden", padding: spacing.xs }}>
        <PickerOptionRow label="All floors" selected={onFloorNow == null} onPress={() => chooseFloor(null)} />
        {floors.map((value) => <PickerOptionRow key={value || "unassigned"} label={formatFloor(value)} selected={onFloorNow === value} onPress={() => chooseFloor(value)} />)}
      </View> : null}
      <Text style={[type.description, { color: colors.muted }]}>Current and confirmed future vacancies</Text>
    </> : <>
      <Card>
        <Text style={label}>Room type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ChoiceChip icon={Snowflake} label="AC" selected={conditioning === "AC"} disabled={disabled} onPress={() => onConditioning(conditioning === "AC" ? null : "AC")} />
          <ChoiceChip icon={Fan} label="Non-AC" selected={conditioning === "NON_AC"} disabled={disabled} onPress={() => onConditioning(conditioning === "NON_AC" ? null : "NON_AC")} />
        </View>
        <Hairline />
        <Text style={label}>Occupancy</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {capacities.map((value) => <ChoiceChip key={value} label={`${value} sharing`} selected={capacity === value} disabled={disabled} onPress={() => onCapacity(capacity === value ? null : value)} />)}
        </View>
      </Card>
      <Text style={[type.description, { color: colors.muted }]}>{shown.length} matching room{shown.length === 1 ? "" : "s"}</Text>
    </>}
    {shown.length === 0 ? <EmptyState compact icon={BedDouble} title="No matching rooms" description={mode === "NUMBER" ? (onFloorNow == null ? "No room has that number. Try another." : "No room on this floor has that number. Try another number or floor.") : "No room is that type with that many sharing. Try another choice."} /> : null}
    {/* One card for both tabs, and under the chosen one a card of its room type's photos (user, 2026-10-10). */}
    {shown.map(({ room, status }) => {
      const chosen = status.selectable && selectedRoomId === room.roomId;
      return <View key={room.roomId} style={{ gap: spacing.sm }}>
        <RoomChoiceCard room={room} status={status} selected={chosen} disabled={disabled} onPress={() => onChoose(room)} />
        {chosen ? <RoomPhotosCard room={room} /> : null}
      </View>;
    })}
    {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    <NoticeBar tone="info" title="Looking holds no bed" message={mode === "NUMBER" ? "A bed is held only after you submit your request." : "A bed is held only after you submit your request. Only confirmed future vacancies are included."} />
  </View>;
}
