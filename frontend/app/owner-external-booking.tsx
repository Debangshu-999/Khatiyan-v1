import { useState } from "react";
import { Text, View } from "react-native";
import { BedDouble, ChevronDown } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectField, type SelectOption } from "@/components/select-field";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { PhoneField } from "@/features/auth/auth-ui";
import { BedPickerSheet } from "@/features/booking/bed-picker-sheet";
import { BookingDateField } from "@/features/booking/booking-date-field";
import { errorMessage } from "@/features/forms/server-error";
import { FormSectionTitle } from "@/features/forms/form-section-title";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, NoticeBar, rupeesToPaise } from "@/features/owner/owner-ui";
import { formatFloor } from "@/features/property/floor";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateExternalBookingMutation,
  useGetExternalBookingOptionsQuery,
  type CreateExternalBooking,
  type ExternalBookingRoom,
  type ReachedVia,
} from "@/store/services/lead-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

const GENDERS: SelectOption<CreateExternalBooking["gender"]>[] = [
  { label: "Female", value: "FEMALE" },
  { label: "Male", value: "MALE" },
  { label: "Other", value: "OTHER" },
];

const REACHED: SelectOption<ReachedVia>[] = [
  { label: "Walked in", value: "WALKED_IN" },
  { label: "Phone call", value: "PHONE_CALL" },
];

const PAID_BY: SelectOption<string>[] = [
  { label: "Cash", value: "CASH" },
  { label: "UPI", value: "UPI" },
  { label: "Bank transfer", value: "BANK_TRANSFER" },
  { label: "Card", value: "CARD" },
  { label: "Cheque", value: "CHEQUE" },
];

/** What the ? beside Booking details says. */
const BED_HELP = {
  steps: [
    { body: "3 to 21 days from today, the same as every booking.", title: "Move-in date" },
    { body: "Only rooms with a bed free are listed, by floor. The bed is held for them until move-in.", title: "The bed" },
    { body: "The room's rent and your deposit fill in. Change them to what was agreed.", title: "Rent and deposit" },
  ],
  title: "Booking details",
};

/** What the ? beside Token collected says. */
const TOKEN_HELP = {
  steps: [
    { body: "The token they paid you to hold the bed. It cannot be more than one month's rent.", title: "The amount" },
    { body: "It comes off their first bill, like any token.", title: "At move-in" },
  ],
  title: "Token collected",
};

function istToday(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

/** The latest birth date for someone 18 today. */
function adultBornBy() {
  const [year, month, day] = istToday().split("-");
  return `${Number(year) - 18}-${month}-${day}`;
}

function rupees(paise: number | null | undefined) {
  return paise == null ? "" : String(Math.round(paise / 100));
}

type Field = "name" | "phone" | "gender" | "dateOfBirth" | "reachedVia" | "moveInDate" | "room" | "rent" | "deposit" | "token" | "tokenMethod";

/**
 * Create external booking (user, 2026-10-19): someone who booked in person or
 * by phone, saved straight as a confirmed booking, the bed held. The same
 * rules as any booking: move-in 3 to 21 days ahead, an adult, a bed free. The
 * bed is chosen from a sheet of floors. Their lead is Booked. Just a record:
 * no account until move-in, and nothing is sent to them.
 */
export default function OwnerExternalBookingScreen() {
  const router = useGuardedRouter();
  const toast = useToast();
  const { colors, fonts, type } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const optionsQuery = useGetExternalBookingOptionsQuery(propertyId, { refetchOnMountOrArgChange: true, skip: !propertyId });
  const options = optionsQuery.data;
  const [createBooking, state] = useCreateExternalBookingMutation();
  const form = useFormErrors<Field>();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<CreateExternalBooking["gender"] | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [reachedVia, setReachedVia] = useState<ReachedVia | null>(null);
  const [moveInDate, setMoveInDate] = useState("");
  const [room, setRoom] = useState<ExternalBookingRoom | null>(null);
  const [pickingBed, setPickingBed] = useState(false);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenMethod, setTokenMethod] = useState<string | null>(null);
  const [reference, setReference] = useState("");

  const depositText = deposit ?? rupees(options?.depositPaise);
  const tokenText = token ?? rupees(options?.tokenAmountPaise);

  function change<T>(field: Field, set: (value: T) => void) {
    return (value: T) => {
      set(value);
      form.clearField(field);
    };
  }

  async function submit() {
    if (!options) return;
    const rentPaise = rupeesToPaise(rent);
    const depositPaise = rupeesToPaise(depositText);
    const tokenPaise = options.tokenRequired ? rupeesToPaise(tokenText) : null;
    const errors: Partial<Record<Field, string>> = {};
    if (!name.trim()) errors.name = "Enter their name.";
    if (phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a 10-digit phone number.";
    if (!gender) errors.gender = "Choose their gender.";
    if (!dateOfBirth) errors.dateOfBirth = "Enter their date of birth.";
    if (!reachedVia) errors.reachedVia = "Say how they reached out.";
    if (!moveInDate) errors.moveInDate = "Choose a move-in date.";
    if (!room) errors.room = "Choose a bed.";
    if (rentPaise == null || rentPaise <= 0) errors.rent = "Enter a monthly rent above zero.";
    if (depositPaise == null || depositPaise < 0) errors.deposit = "Enter the deposit, or 0.";
    if (options.tokenRequired) {
      if (tokenPaise == null || tokenPaise <= 0) errors.token = "Enter the token they paid.";
      else if (rentPaise != null && tokenPaise > rentPaise) errors.token = "A token cannot be more than one month's rent.";
      if (!tokenMethod) errors.tokenMethod = "Say how the token was paid.";
    }
    if (!form.validate(errors) || !gender || !reachedVia || !room) return;
    try {
      await createBooking({
        body: {
          agreementMonths: null,
          dateOfBirth,
          depositPaise,
          gender,
          monthlyRentPaise: rentPaise,
          moveInDate,
          name: name.trim(),
          phone,
          reachedVia,
          roomId: room.roomId,
          tokenMethod: options.tokenRequired ? tokenMethod : null,
          tokenPaise,
          tokenReference: options.tokenRequired ? reference.trim() || null : null,
        },
        propertyId,
      }).unwrap();
      toast.success("Booking created and confirmed.");
      router.back();
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }} refreshable={false} safeAreaEdges={["top"]}>
        <ScreenHeader italicTail="booking." subtitle="Booked in person or over the phone. Saved as confirmed." title="External" />

        {optionsQuery.isLoading ? <OwnerDataListSkeleton bodyLines={2} rows={3} /> : null}
        {optionsQuery.isError ? <NoticeBar message={errorMessage(optionsQuery.error)} title="Could not load the form" tone="danger" /> : null}
        {options && !options.open ? (
          <EmptyState artworkNode={<BedDouble color={colors.muted} size={56} />} title={options.whyNot ?? "No bed is free to book here right now."} />
        ) : null}

        {options?.open ? (
          <>
            <Card>
              <View style={{ gap: spacing.md }}>
                <FormSectionTitle title="Tenant details" />
                <FormInput error={form.errors.name} label="Name" onChangeText={change("name", setName)} placeholder="Their full name" required value={name} />
                <PhoneField error={form.errors.phone} label="Phone" onChangeText={change("phone", setPhone)} value={phone} />
                <SelectField error={form.errors.gender} label="Gender" onChange={change("gender", setGender)} options={GENDERS} value={gender} />
                <BookingDateField error={form.errors.dateOfBirth} label="Date of birth" maximum={adultBornBy()} minimum="1940-01-01" onChange={change("dateOfBirth", setDateOfBirth)} value={dateOfBirth} />
                <SelectField error={form.errors.reachedVia} label="How they reached out" onChange={change("reachedVia", setReachedVia)} options={REACHED} value={reachedVia} />
              </View>
            </Card>

            <Card>
              <View style={{ gap: spacing.md }}>
                <FormSectionTitle help={BED_HELP} title="Booking details" />
                <BookingDateField error={form.errors.moveInDate} label="Move-in date" maximum={options.latestMoveInDate ?? istToday(21)} minimum={options.earliestMoveInDate ?? istToday(3)} onChange={change("moveInDate", setMoveInDate)} value={moveInDate} />
                <View style={{ gap: spacing.xs }}>
                  <Text style={[type.label, { color: colors.muted }]}>Room</Text>
                  <AnimatedPressable
                    accessibilityLabel={room ? `Room ${room.roomNumber}. Change bed` : "Choose a bed"}
                    accessibilityRole="button"
                    onPress={() => setPickingBed(true)}
                    style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: form.errors.room ? colors.danger : colors.borderStrong, borderCurve: "continuous", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 48, paddingLeft: spacing.md, paddingRight: spacing.sm }}
                  >
                    <FitText numberOfLines={1} style={{ color: room ? colors.ink : colors.muted, flex: 1, fontFamily: room ? fonts.sansSemiBold : fonts.sans, fontSize: 15 }}>
                      {room ? `Room ${room.roomNumber} · ${formatFloor(room.floor)}` : "Choose a bed"}
                    </FitText>
                    <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 24, justifyContent: "center", width: 24 }}>
                      <ChevronDown color={colors.muted} size={16} />
                    </View>
                  </AnimatedPressable>
                  {form.errors.room ? <Text style={[type.caption, { color: colors.danger }]}>{form.errors.room}</Text> : null}
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput error={form.errors.rent} keyboardType="decimal-pad" label="Monthly rent" onChangeText={change("rent", setRent)} placeholder="0" prefix="₹" value={rent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput error={form.errors.deposit} keyboardType="decimal-pad" label="Deposit" onChangeText={change("deposit", (next: string) => setDeposit(next))} placeholder="0" prefix="₹" value={depositText} />
                  </View>
                </View>
              </View>
            </Card>

            {options.tokenRequired ? (
              <Card>
                <View style={{ gap: spacing.md }}>
                  <FormSectionTitle help={TOKEN_HELP} title="Token collected" />
                  <FormInput error={form.errors.token} keyboardType="decimal-pad" label="Amount" onChangeText={change("token", (next: string) => setToken(next))} placeholder="0" prefix="₹" value={tokenText} />
                  <SelectField error={form.errors.tokenMethod} label="Paid by" onChange={change("tokenMethod", setTokenMethod)} options={PAID_BY} value={tokenMethod} />
                  <FormInput label="Reference" onChangeText={setReference} placeholder="UTR or receipt number" value={reference} />
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScreenScrollView>

      {options?.open ? (
        <PinnedFooter>
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={state.isLoading || form.blocked} label={state.isLoading ? "Creating..." : "Create booking"} onPress={() => void submit()} />
          </View>
        </PinnedFooter>
      ) : null}

      {pickingBed && options ? (
        <BedPickerSheet
          onChoose={(picked) => {
            setRoom(picked);
            // The room's own rent, which can still be changed for what was agreed.
            setRent(rupees(picked.rentPaise));
            form.clearField("room");
            form.clearField("rent");
            setPickingBed(false);
          }}
          onClose={() => setPickingBed(false)}
          rooms={options.rooms}
          selectedRoomId={room?.roomId ?? null}
        />
      ) : null}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </View>
  );
}

