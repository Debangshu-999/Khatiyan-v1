import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Platform, Text, TextInput, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ArrowLeft, CalendarDays, Check, ChevronRight, KeyRound, Trash2, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { AgreementClauseList } from "@/features/compliance/agreement-clause-list";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyAgreementSettingsQuery,
  useOnboardTenantWithAgreementMutation,
  usePreviewTenancyAgreementQuery,
  type CustomClauseInput,
} from "@/store/services/compliance-api";
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

type Step = "phone" | "type" | "details" | "review" | "agreement" | "done";
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
  // Agreement path: SELECTIVE properties opt in per tenancy; ALL_MONTHLY always
  // goes through the agreement step. Custom clauses are editable on that step.
  const [withAgreementChoice, setWithAgreementChoice] = useState(false);
  // The owner's declaration. Khatiyan verifies nothing — this records that they
  // did, which is where the legal duty actually sits.
  const [idCheckConfirmed, setIdCheckConfirmed] = useState(false);
  const [customDrafts, setCustomDrafts] = useState<CustomClauseInput[] | null>(null);

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
  const [onboardWithAgreement, onboardWithAgreementState] = useOnboardTenantWithAgreementMutation();

  // Property agreement mode decides whether monthly onboarding routes through
  // the agreement step: ALL_MONTHLY always, SELECTIVE by the owner's toggle.
  const agreementSettingsQuery = useGetPropertyAgreementSettingsQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || step === "phone",
  });
  const agreementMode = agreementSettingsQuery.data?.mode ?? "OFF";
  const withAgreement =
    billingType === "MONTHLY" && (agreementMode === "ALL_MONTHLY" || (agreementMode === "SELECTIVE" && withAgreementChoice));

  const previewQuery = usePreviewTenancyAgreementQuery(
    {
      depositAmountPaise: Math.round(Number(deposit || "0") * 100),
      propertyId: selectedProperty?.id ?? "",
      rentAmountPaise: Math.round(Number(rent || "0") * 100),
    },
    { skip: step !== "agreement" || !selectedProperty || !withAgreement },
  );

  // Seed the editable custom clauses from the property defaults once the
  // preview arrives; the owner tweaks them per tenancy on the agreement step.
  useEffect(() => {
    if (step === "agreement" && previewQuery.data && customDrafts === null) {
      setCustomDrafts(
        previewQuery.data
          .filter((clause) => clause.kind === "CUSTOM")
          .map((clause) => ({ body: clause.body, heading: clause.heading })),
      );
    }
  }, [customDrafts, previewQuery.data, step]);

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

  /** Blocks every route out of review until the owner has declared the ID check. */
  function idCheckMissing() {
    if (idCheckConfirmed) {
      return false;
    }
    setMessage("Confirm you have checked the tenant's ID proof and photograph before onboarding.");
    return true;
  }

  async function handleConfirm() {
    if (!selectedProperty || !roomId) return;
    if (idCheckMissing()) return;
    setMessage(null);
    const common = {
      tenantPhone: phone.trim(),
      tenantName: tenantName.trim() ? tenantName.trim() : null,
      propertyId: selectedProperty.id,
      roomId,
      startDate: dateToStr(startDate),
      idCheckConfirmed,
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

  async function handleConfirmWithAgreement() {
    if (!selectedProperty || !roomId) return;
    if (idCheckMissing()) return;
    setMessage(null);
    const drafts = (customDrafts ?? []).filter((clause) => clause.heading.trim() || clause.body.trim());
    if (drafts.some((clause) => !clause.heading.trim() || !clause.body.trim())) {
      setMessage("Every custom clause needs both a heading and its text.");
      return;
    }
    try {
      const res = await onboardWithAgreement({
        customClauses: drafts.map((clause) => ({ body: clause.body.trim(), heading: clause.heading.trim() })),
        depositAmountPaise: Math.round(Number(deposit || "0") * 100),
        propertyId: selectedProperty.id,
        rentAmountPaise: Math.round(Number(rent) * 100),
        roomId,
        startDate: dateToStr(startDate),
        idCheckConfirmed,
        tenantName: tenantName.trim() ? tenantName.trim() : null,
        tenantPhone: phone.trim(),
      }).unwrap();
      setResult({ tenancy: res.tenancy, tenantAccountCreated: res.tenantAccountCreated });
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
                    <Input value={rent} onChangeText={setRent} placeholder="From room base rent" keyboardType="number-pad" prefix="₹" />
                  </Field>
                  <Field label="Deposit">
                    <Input value={deposit} onChangeText={setDeposit} placeholder="From property policy" keyboardType="number-pad" prefix="₹" />
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
          {!isDaily && agreementMode === "ALL_MONTHLY" ? (
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              This property requires an accepted agreement for every monthly tenancy. The tenancy stays pending until
              the tenant accepts.
            </Text>
          ) : null}
          <IdCheckDeclaration checked={idCheckConfirmed} onToggle={() => setIdCheckConfirmed((value) => !value)} />

          {!isDaily && agreementMode === "SELECTIVE" ? (
            <>
              {/* Per-tenancy choice: the two buttons ARE the choice. */}
              <PrimaryButton
                label="Continue to agreement"
                onPress={() => {
                  if (idCheckMissing()) return;
                  setWithAgreementChoice(true);
                  setStep("agreement");
                }}
              />
              <PrimaryButton
                label="Continue without agreement"
                muted
                onPress={handleConfirm}
                busy={onboardState.isLoading}
              />
            </>
          ) : withAgreement ? (
            <PrimaryButton
              label="Continue to agreement"
              onPress={() => {
                if (idCheckMissing()) return;
                setStep("agreement");
              }}
            />
          ) : (
            <PrimaryButton label="Confirm and create tenancy" onPress={handleConfirm} busy={onboardState.isLoading} />
          )}
          <PrimaryButton label="Back" muted onPress={() => setStep("details")} />
        </Card>
      ) : null}

      {step === "agreement" ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Tenancy agreement
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 13, lineHeight: 19 }]} selectable>
              These are the exact terms the tenant will accept. System rules are locked for uniformity — only the
              custom clauses below can be tailored for this tenancy.
            </Text>
            {previewQuery.isFetching && !previewQuery.data ? <ActivityIndicator color={colors.primary} /> : null}
            {previewQuery.data ? (
              <AgreementClauseList clauses={previewQuery.data.filter((clause) => clause.kind === "SYSTEM")} />
            ) : null}
          </Card>

          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              House rules & other terms (editable)
            </Text>
            {(customDrafts ?? []).map((clause, index) => (
              <View key={`draft-${index}`} style={{ gap: spacing.sm }}>
                {index > 0 ? <Divider /> : null}
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                    Clause {index + 1}
                  </Text>
                  <AnimatedPressable
                    accessibilityLabel={`Remove clause ${index + 1}`}
                    onPress={() => setCustomDrafts((current) => (current ?? []).filter((_, i) => i !== index))}
                    style={{ padding: 4 }}
                  >
                    <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                  </AnimatedPressable>
                </View>
                <Field label="Clause Heading">
                  <Input
                    value={clause.heading}
                    onChangeText={(text) =>
                      setCustomDrafts((current) => (current ?? []).map((item, i) => (i === index ? { ...item, heading: text } : item)))
                    }
                    placeholder="e.g. Liability, Guests, Parking"
                  />
                </Field>
                <Field label="Clause Body">
                  <Input
                    multiline
                    value={clause.body}
                    onChangeText={(text) =>
                      setCustomDrafts((current) => (current ?? []).map((item, i) => (i === index ? { ...item, body: text } : item)))
                    }
                    placeholder="Write the rule exactly as the tenant should read it"
                  />
                </Field>
              </View>
            ))}
            <PrimaryButton
              label="Add clause"
              muted
              onPress={() => setCustomDrafts((current) => [...(current ?? []), { body: "", heading: "" }])}
            />
          </Card>

          <Card>
            <PrimaryButton
              label="Create tenancy — send for acceptance"
              onPress={handleConfirmWithAgreement}
              busy={onboardWithAgreementState.isLoading}
            />
            <PrimaryButton label="Back" muted onPress={() => setStep("review")} />
          </Card>
        </>
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
              {result.tenancy.status === "PENDING_ACCEPTANCE"
                ? "Tenancy created — awaiting acceptance"
                : result.tenantAccountCreated
                  ? "Tenant account and tenancy created"
                  : "Tenancy created"}
            </Text>
            {result.tenancy.status === "PENDING_ACCEPTANCE" ? (
              <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} selectable>
                The bed is reserved. The tenancy and billing start once the tenant accepts the agreement in their app
                — pending tenancies auto-cancel after 3 days.
              </Text>
            ) : null}
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

function Input({ prefix, ...props }: React.ComponentProps<typeof TextInput> & { prefix?: string }) {
  const { colors, fonts } = useTheme();
  if (prefix) {
    // Adornment (e.g. ₹) rendered inside the field: the container owns the
    // border and the input goes borderless beside the prefix.
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: 10,
          borderWidth: 1,
          flexDirection: "row",
          paddingLeft: spacing.md,
        }}
      >
        <Text style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" }} selectable={false}>
          {prefix}
        </Text>
        <AppTextInput
          {...props}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sans,
            fontSize: 15,
            padding: spacing.md,
            paddingLeft: spacing.xs,
          }}
        />
      </View>
    );
  }
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

/**
 * The owner declaring they checked the tenant's ID. Deliberately worded as their
 * statement, not ours — Khatiyan verifies nothing and keeps no document. Tenant
 * ID verification and police notification are the landlord's legal duty in most
 * states, and many small owners simply don't know that, so the note below says so
 * at the moment it matters.
 */
function IdCheckDeclaration({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{
        alignItems: "flex-start",
        backgroundColor: checked ? colors.primarySoft : colors.surfaceSunken,
        borderColor: checked ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderRadius: 6,
          borderWidth: 2,
          height: 22,
          justifyContent: "center",
          marginTop: 1,
          width: 22,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" }} selectable>
          I have collected and checked this tenant&apos;s ID proof and photograph
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          Most states require landlords to verify tenant ID and notify the local police. Keep a copy for your own
          records — Khatiyan does not store ID documents.
        </Text>
      </View>
    </AnimatedPressable>
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
