import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Platform, Text, TextInput, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ArrowLeft, CalendarDays, Check, ChevronRight, KeyRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useLazyLookupTenantQuery,
  useOnboardTenantMutation,
  type TenancyOnboardingResult,
  type TenantLookup,
} from "@/store/services/tenancy-api";
import {
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  type OwnerProperty,
  type OwnerRoom,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Step = "phone" | "type" | "details" | "review" | "done";
type BillingKind = "MONTHLY" | "DAILY";

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

// Whole nights between two date-only values.
function nightsBetween(start: Date, end: Date) {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
}

function startOfDay(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(paise / 100);
}

function errorText(e: unknown) {
  if (typeof e === "object" && e && "data" in e) {
    const d = (e as { data?: { message?: string } }).data;
    if (d?.message) return d.message;
  }
  return "Something went wrong. Please try again.";
}

export default function OwnerOnboardTenantScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  // Onboarding only surfaces error feedback (success advances the wizard step).
  const setMessage = (value: string | null) => {
    if (value) {
      toast.error(value);
    }
  };

  const [step, setStep] = useState<Step>("phone");
  const [billingType, setBillingType] = useState<BillingKind | null>(null);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<TenantLookup | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [startDate, setStartDate] = useState<Date>(startOfToday());
  const [plannedEndDate, setPlannedEndDate] = useState<Date>(addDays(startOfToday(), 1));
  const [showPicker, setShowPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [result, setResult] = useState<TenancyOnboardingResult | null>(null);

  const isDaily = billingType === "DAILY";
  const [triggerLookup, lookupState] = useLazyLookupTenantQuery();
  const propertiesQuery = useListMyPropertiesQuery(undefined, { skip: step === "phone" });
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = useMemo<OwnerProperty | undefined>(
    () => resolveSelectedProperty(properties, selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = roomsQuery.data ?? [];
  // Rooms under maintenance cannot take a new tenancy, so keep them out of the
  // selectable list entirely.
  const selectableRooms = useMemo(() => rooms.filter((room) => room.status !== "MAINTENANCE"), [rooms]);
  const selectedRoom = useMemo<OwnerRoom | undefined>(
    () => rooms.find((room) => room.id === roomId),
    [roomId, rooms],
  );
  const [onboard, onboardState] = useOnboardTenantMutation();

  // Daily renting is available when the property has at least one nightly rate
  // configured; the rate that applies depends on the chosen room's AC type.
  const dailyAvailable = Boolean(
    selectedProperty && (selectedProperty.dailyGuestAcRatePaise != null || selectedProperty.dailyGuestNonAcRatePaise != null),
  );
  const dailyRatePaise =
    selectedProperty && selectedRoom
      ? selectedRoom.conditioning === "AC"
        ? selectedProperty.dailyGuestAcRatePaise
        : selectedProperty.dailyGuestNonAcRatePaise
      : null;
  const nights = nightsBetween(startDate, plannedEndDate);

  const phoneValid = /^(\+91)?\d{10}$/.test(phone.trim());

  function handlePhoneChange(value: string) {
    setPhone(value);
    setLookup(null);
    setTenantName("");
    setMessage(null);
  }

  async function handleLookup() {
    setMessage(null);
    setLookup(null);
    setTenantName("");
    if (!phoneValid) {
      setMessage("Enter a valid 10-digit phone number.");
      return;
    }

    try {
      const res = await triggerLookup(phone.trim()).unwrap();
      setLookup(res);
      if (res.canOnboard && res.exists && res.fullName) {
        setTenantName(res.fullName);
      }
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  function selectRoom(room: OwnerRoom) {
    setRoomId(room.id);
    setRent(String(Math.round(room.baseRentPaise / 100)));
    if (selectedProperty) {
      setDeposit(String(Math.round(selectedProperty.standardDepositPaise / 100)));
    }
  }

  function goToTypeSelect() {
    if (!lookup?.canOnboard) {
      return;
    }
    setMessage(null);
    setStep("type");
  }

  function chooseBilling(kind: BillingKind) {
    setMessage(null);
    setBillingType(kind);
    // Reset room-derived inputs so a switch between kinds starts clean.
    setRoomId(null);
    setRent("");
    setDeposit("");
    setStep("details");
  }

  function goToReview() {
    setMessage(null);
    if (!selectedProperty || !selectedRoom) {
      setMessage("Select a property on Home and choose a room.");
      return;
    }
    if (selectedRoom.status === "MAINTENANCE") {
      setMessage("This room is under maintenance and cannot take a tenancy.");
      return;
    }
    if (selectedRoom.availableVacancies <= 0) {
      setMessage("This room has no available vacancy.");
      return;
    }
    if (dateToStr(startDate) < dateToStr(startOfToday())) {
      setMessage("Start date must be today or a future date.");
      return;
    }
    if (isDaily) {
      if (dailyRatePaise == null) {
        setMessage("This room type has no daily rate configured.");
        return;
      }
      if (nights < 1 || nights > 29) {
        setMessage("Daily stay must be between 1 and 29 nights.");
        return;
      }
    } else if (!(Number(rent) > 0)) {
      setMessage("Rent must be greater than zero.");
      return;
    }
    setStep("review");
  }

  async function handleConfirm() {
    if (!selectedProperty || !roomId) return;
    setMessage(null);
    const common = {
      tenantPhone: phone.trim(),
      tenantName: tenantName.trim() ? tenantName.trim() : null,
      propertyId: selectedProperty.id,
      roomId,
      startDate: dateToStr(startDate),
    };
    const payload = isDaily
      ? { ...common, billingType: "DAILY" as const, plannedEndDate: dateToStr(plannedEndDate) }
      : {
          ...common,
          billingType: "MONTHLY" as const,
          rentAmountPaise: Math.round(Number(rent) * 100),
          depositAmountPaise: Math.round(Number(deposit || "0") * 100),
        };
    try {
      const res = await onboard(payload).unwrap();
      setResult(res);
      setStep("done");
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  return (
    <ScreenScrollView>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <HeaderButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {step === "done" ? "Complete" : `Onboard / ${step}`}
        </Text>
        <HeaderButton icon={X} onPress={() => router.back()} />
      </View>

      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: "500" }} selectable>
        {step === "done" ? "Tenancy" : "Onboard"}
        <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }} selectable>
          {step === "done" ? " created." : " tenant."}
        </Text>
      </Text>

      {step === "phone" ? (
        <Card>
          <Field label="Tenant phone">
            <Input value={phone} onChangeText={handlePhoneChange} placeholder="9876543210" keyboardType="phone-pad" />
          </Field>
          <PrimaryButton label="Look up" onPress={handleLookup} busy={lookupState.isFetching} />

          {lookup ? (
            <View style={{ gap: spacing.sm }}>
              <Divider />
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
                  {lookup.exists ? lookup.fullName ?? "Existing user" : "New user"}
                </Text>
                <Text
                  style={[type.eyebrow, { color: lookup.canOnboard ? colors.primary : colors.danger, textAlign: "right" }]}
                  selectable
                >
                  {lookup.canOnboard ? "Eligible" : "Blocked"}
                </Text>
              </View>
              <Text style={[type.body, { color: colors.muted, fontSize: 14 }]} selectable>
                {lookup.message}
              </Text>

              {lookup.canOnboard ? (
                <Field label={lookup.exists ? "Tenant name" : "Tenant name (optional)"}>
                  <Input value={tenantName} onChangeText={setTenantName} placeholder="Use temporary name if blank" />
                </Field>
              ) : null}

              {lookup.canOnboard ? <PrimaryButton label="Continue" onPress={goToTypeSelect} /> : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {step === "type" ? (
        <Card>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Tenancy type
          </Text>
          {propertiesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {!propertiesQuery.isLoading && !selectedProperty ? (
            <EmptyState
              icon={KeyRound}
              eyebrow="Property required"
              title={properties.length > 1 ? "Select a property from Home" : "No property available"}
              description="Onboarding uses the owner workspace property selected on Home."
            />
          ) : null}
          {selectedProperty ? (
            <>
              <Text style={[type.body, { color: colors.muted, fontSize: 14 }]} selectable>
                Choose the kind of stay to start for this tenant.
              </Text>
              <SelectRow
                title="Monthly tenancy"
                subtitle="Recurring monthly rent with a security deposit and billing cycles."
                selected={billingType === "MONTHLY"}
                onPress={() => chooseBilling("MONTHLY")}
              />
              <SelectRow
                title="Daily tenancy"
                subtitle={
                  dailyAvailable
                    ? "Short stay billed per night (1–29 nights). No deposit."
                    : "Daily rates are not configured for this property."
                }
                selected={billingType === "DAILY"}
                disabled={!dailyAvailable}
                onPress={() => chooseBilling("DAILY")}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {step === "details" ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Property
            </Text>
            {propertiesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {selectedProperty ? (
              <OverviewBox
                rows={[
                  { label: "Property", value: selectedProperty.name },
                  {
                    label: "Location",
                    value: [selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", "),
                  },
                  { label: "Deposit", value: rupees(selectedProperty.standardDepositPaise), mono: true },
                ]}
              />
            ) : !propertiesQuery.isLoading ? (
              <EmptyState
                icon={KeyRound}
                eyebrow="Property required"
                title={properties.length > 1 ? "Select a property from Home" : "No property available"}
                description={
                  properties.length > 1
                    ? "Onboarding uses the owner workspace property selected on Home."
                    : "Create a property before onboarding a tenant."
                }
              />
            ) : null}
          </Card>

          {selectedProperty ? (
            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Room
              </Text>
              {roomsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {selectableRooms.map((room) => {
                const full = room.availableVacancies <= 0;
                const roomDailyPaise =
                  room.conditioning === "AC"
                    ? selectedProperty.dailyGuestAcRatePaise
                    : selectedProperty.dailyGuestNonAcRatePaise;
                const priceLabel = isDaily
                  ? roomDailyPaise != null
                    ? `${rupees(roomDailyPaise)} / night`
                    : "No daily rate"
                  : `${rupees(room.baseRentPaise)} / month`;
                return (
                  <SelectRow
                    key={room.id}
                    title={`Room ${room.roomNumber}${room.floor ? ` / ${room.floor}` : ""}`}
                    subtitle={`${priceLabel} · ${full ? "Full" : `${room.availableVacancies} vacancy`}`}
                    selected={room.id === roomId}
                    disabled={full || (isDaily && roomDailyPaise == null)}
                    onPress={() => selectRoom(room)}
                  />
                );
              })}
            </Card>
          ) : null}

          {roomId ? (
            <Card>
              {isDaily ? (
                <Field label="Daily rate">
                  <View
                    style={{
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                      borderRadius: 10,
                      borderWidth: 1,
                      padding: spacing.md,
                    }}
                  >
                    <Text style={[type.bodyStrong, { color: dailyRatePaise != null ? colors.ink : colors.danger }]} selectable>
                      {dailyRatePaise != null ? `${rupees(dailyRatePaise)} / night` : "Not configured for this room type"}
                    </Text>
                  </View>
                </Field>
              ) : (
                <>
                  <Field label="Rent / month">
                    <Input value={rent} onChangeText={setRent} placeholder="From room base rent" keyboardType="number-pad" />
                  </Field>
                  <Field label="Deposit">
                    <Input value={deposit} onChangeText={setDeposit} placeholder="From property policy" keyboardType="number-pad" />
                  </Field>
                </>
              )}
              <Field label="Start date">
                <AnimatedPressable
                  onPress={() => setShowPicker(true)}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
                  <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]} selectable>
                    {formatDateLong(startDate)}
                  </Text>
                </AnimatedPressable>
              </Field>

              {showPicker ? (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={startOfToday()}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== "ios") {
                      setShowPicker(false);
                    }
                    if (event.type === "set" && selected) {
                      setStartDate(selected);
                    }
                  }}
                />
              ) : null}
              {showPicker && Platform.OS === "ios" ? <PrimaryButton label="Done" muted onPress={() => setShowPicker(false)} /> : null}

              {isDaily ? (
                <>
                  <Field label="Checkout date">
                    <AnimatedPressable
                      onPress={() => setShowEndPicker(true)}
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.border,
                        borderRadius: 10,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: spacing.sm,
                        minHeight: 48,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
                      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]} selectable>
                        {formatDateLong(plannedEndDate)}
                      </Text>
                    </AnimatedPressable>
                  </Field>

                  {showEndPicker ? (
                    <DateTimePicker
                      value={plannedEndDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      minimumDate={addDays(startDate, 1)}
                      onChange={(event: DateTimePickerEvent, selected?: Date) => {
                        if (Platform.OS !== "ios") {
                          setShowEndPicker(false);
                        }
                        if (event.type === "set" && selected) {
                          setPlannedEndDate(selected);
                        }
                      }}
                    />
                  ) : null}
                  {showEndPicker && Platform.OS === "ios" ? (
                    <PrimaryButton label="Done" muted onPress={() => setShowEndPicker(false)} />
                  ) : null}

                  <Text style={[type.caption, { color: colors.muted }]} selectable>
                    {nights > 0
                      ? `${nights} night${nights === 1 ? "" : "s"}${dailyRatePaise != null ? ` · ${rupees(dailyRatePaise * nights)} total` : ""}`
                      : "Choose a checkout date after the start date."}
                  </Text>
                </>
              ) : null}

              <PrimaryButton label="Review" onPress={goToReview} />
            </Card>
          ) : null}
        </>
      ) : null}

      {step === "review" ? (
        <Card>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Review before creating
          </Text>
          <OverviewBox
            rows={[
              { label: "Tenant", value: tenantName.trim() || lookup?.fullName || phone.trim() },
              { label: "Phone", value: phone.trim(), mono: true },
              { label: "Type", value: isDaily ? "Daily" : "Monthly" },
              { label: "Property", value: selectedProperty?.name ?? "-" },
              { label: "Room", value: selectedRoom ? `Room ${selectedRoom.roomNumber}` : "-" },
              ...(isDaily
                ? [
                    { label: "Daily rate", value: dailyRatePaise != null ? rupees(dailyRatePaise) : "-", mono: true },
                    { label: "Start date", value: formatDateLong(startDate) },
                    { label: "Checkout date", value: formatDateLong(plannedEndDate) },
                    { label: "Nights", value: String(nights) },
                    { label: "Estimated total", value: dailyRatePaise != null ? rupees(dailyRatePaise * nights) : "-", mono: true },
                  ]
                : [
                    { label: "Rent / month", value: rupees(Math.round(Number(rent) * 100)), mono: true },
                    { label: "Deposit", value: rupees(Math.round(Number(deposit || "0") * 100)), mono: true },
                    { label: "Start date", value: formatDateLong(startDate) },
                  ]),
            ]}
          />
          <PrimaryButton label="Confirm and create tenancy" onPress={handleConfirm} busy={onboardState.isLoading} />
          <PrimaryButton label="Back" muted onPress={() => setStep("details")} />
        </Card>
      ) : null}

      {step === "done" && result ? (
        <Card>
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.successSoft,
                borderRadius: 999,
                height: 56,
                justifyContent: "center",
                width: 56,
              }}
            >
              <Check color={colors.successText} size={28} strokeWidth={2.4} />
            </View>
            <Text style={[type.bodyStrong, { color: colors.ink, textAlign: "center" }]} selectable>
              {result.tenantAccountCreated ? "Tenant account and tenancy created" : "Tenancy created"}
            </Text>
          </View>
          <OverviewBox
            rows={[
              { label: "Tenancy", value: result.tenancy.referenceCode, mono: true },
              { label: "Type", value: result.tenancy.billingType === "DAILY" ? "Daily" : "Monthly" },
              ...(result.tenancy.billingType === "DAILY"
                ? [
                    { label: "Daily rate", value: rupees(result.tenancy.dailyRatePaise ?? 0), mono: true },
                    { label: "Start date", value: result.tenancy.startDate },
                    { label: "Checkout date", value: result.tenancy.plannedEndDate ?? "-" },
                  ]
                : [
                    { label: "Rent / month", value: rupees(result.tenancy.rentAmountPaise ?? 0), mono: true },
                    { label: "Deposit", value: rupees(result.tenancy.depositAmountPaise ?? 0), mono: true },
                    { label: "Start date", value: result.tenancy.startDate },
                  ]),
            ]}
          />
          {result.tenantAccountCreated ? (
            <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
              The tenant can now sign up with this phone number to set their PIN.
            </Text>
          ) : null}
          <PrimaryButton label="Done" onPress={() => router.back()} />
        </Card>
      ) : null}

    </ScreenScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const { colors, fonts } = useTheme();
  return (
    <AppTextInput
      {...props}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={colors.muted}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        color: colors.ink,
        fontFamily: fonts.sans,
        fontSize: 15,
        padding: spacing.md,
      }}
    />
  );
}

function SelectRow({
  title,
  subtitle,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
        borderColor: selected ? colors.primary : colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "space-between",
        opacity: disabled ? 0.5 : 1,
        padding: spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
          {title}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {subtitle}
        </Text>
      </View>
      {selected ? <Check color={colors.primary} size={18} strokeWidth={2.4} /> : <ChevronRight color={colors.kicker} size={18} />}
    </AnimatedPressable>
  );
}

type OverviewRowData = { label: string; value: string; mono?: boolean };

function OverviewBox({ rows }: { rows: OverviewRowData[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.md, opacity: 0.8 }} /> : null}
          <OverviewRow label={row.label} value={row.value} mono={row.mono} />
        </View>
      ))}
    </View>
  );
}

function OverviewRow({ label, value, mono }: OverviewRowData) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text
        style={[
          type.body,
          { color: colors.ink, flex: 1, fontFamily: mono ? fonts.mono : fonts.sans, fontWeight: "800", textAlign: "right" },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  muted,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  muted?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      onPress={busy ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: muted ? "transparent" : colors.primary,
        borderColor: muted ? colors.border : "transparent",
        borderRadius: 12,
        borderWidth: muted ? 1 : 0,
        justifyContent: "center",
        minHeight: 50,
        paddingHorizontal: spacing.lg,
      }}
    >
      {busy ? (
        <ActivityIndicator color={muted ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={{ color: muted ? colors.primary : colors.onPrimary, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" }} selectable>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof ArrowLeft;
  label?: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        justifyContent: "center",
        paddingHorizontal: label ? spacing.sm : 0,
        width: label ? undefined : 36,
      }}
    >
      <Icon color={colors.ink} size={16} strokeWidth={2.2} />
      {label ? (
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable>
          {label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId);
  }

  return properties.length === 1 ? properties[0] : undefined;
}
