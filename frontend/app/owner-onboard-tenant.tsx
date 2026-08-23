import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, BackHandler, Platform, Text, TextInput, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ArrowLeft, CalendarDays, Check, ChevronRight, KeyRound, Trash2, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { AlertModal } from "@/components/alert-modal";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { deductionCategories, validityMonths } from "@/features/compliance/clause-values";
import { AgreementClauseList } from "@/features/compliance/agreement-clause-list";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
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
import { ChoiceButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Step = "phone" | "type" | "details" | "review" | "agreement" | "done";

/**
 * Where Back goes from each step.
 *
 * <p>"phone" has no previous step, so Back leaves the flow; "done" has nothing
 * to go back to — the tenancy already exists and stepping back into the form
 * would invite a second submission.
 */
const PREVIOUS_STEP: Partial<Record<Step, Step>> = {
  agreement: "review",
  details: "type",
  review: "details",
  type: "phone",
};
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
  // Server refusal — nothing on screen to correct.
  const opErrors = useFormErrors<never>();

  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  // Onboarding only surfaces error feedback (success advances the wizard step).
  const setMessage = (value: string | null) => {
    if (value) {
      opErrors.failFromServer(value);
    }
  };

  const [step, setStep] = useState<Step>("phone");
  const previousStep = PREVIOUS_STEP[step] ?? null;

  // The device back button walks the wizard too. Without this it unmounted the
  // whole screen from step 4, losing everything typed — the hardware button
  // knows nothing about steps unless told.
  useEffect(() => {
    if (!previousStep) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep(previousStep);
      return true;
    });
    return () => subscription.remove();
  }, [previousStep]);
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

  // Writing clause prose is a TENANCY_RULES power. A manager may well hold
  // TENANCY_CREATE without it, so they onboard on the property's stored terms
  // and cannot alter them here. The server drops submitted prose regardless.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const clausesReadOnly = !canManageResource("TENANCY_RULES");

  // Every monthly tenancy is agreement-backed. There is no opt-out any more:
  // the agreement is the two-way handshake that makes a tenancy record mean
  // anything, and without it an owner can fabricate a stay end to end.
  const withAgreement = billingType === "MONTHLY";

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

  // The property's own clauses supply both the starting term and the ceiling on
  // permitted deductions: onboarding may narrow what the deposit covers, never
  // widen it past what the property's agreement already claims.
  const previewValidityClause = useMemo(
    () =>
      (previewQuery.data ?? []).find(
        (clause) => clause.systemType === "VALIDITY" || clause.systemType === "LOCK_IN",
      ) ?? null,
    [previewQuery.data],
  );
  const previewDeductionClause = useMemo(
    () => (previewQuery.data ?? []).find((clause) => clause.systemType === "ALLOWED_DEDUCTIONS") ?? null,
    [previewQuery.data],
  );
  const allowedDeductions = useMemo(
    () => (previewDeductionClause ? deductionCategories(previewDeductionClause) : []),
    [previewDeductionClause],
  );

  // Null until the preview lands, then seeded from it. Kept separate from the
  // property's stored clauses so editing here never writes back to the template.
  const [termMonths, setTermMonths] = useState<number | null>(null);
  const [fixedTerm, setFixedTerm] = useState(false);
  const [chosenDeductions, setChosenDeductions] = useState<string[] | null>(null);

  useEffect(() => {
    if (step === "agreement" && previewQuery.data && chosenDeductions === null) {
      const months = previewValidityClause ? validityMonths(previewValidityClause) : null;
      setFixedTerm(months != null);
      setTermMonths(months);
      setChosenDeductions(allowedDeductions);
    }
  }, [allowedDeductions, chosenDeductions, previewQuery.data, previewValidityClause, step]);

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
      const res = await triggerLookup({ phone: phone.trim(), propertyId: selectedPropertyId ?? undefined }).unwrap();
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
        permittedDeductions: chosenDeductions ?? undefined,
        term: { months: fixedTerm ? termMonths ?? 11 : null },
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
        <HeaderButton
          icon={ArrowLeft}
          label="Back"
          onPress={() => {
            // Steps back through the wizard. It used to call router.back(),
            // which left the screen entirely and threw away everything typed —
            // the same thing the X does, so one of the two buttons was a trap.
            if (previousStep) {
              setStep(previousStep);
            } else {
              router.back();
            }
          }}
        />
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {step === "done" ? "Complete" : `Onboard / ${step}`}
        </Text>
        <HeaderButton icon={X} onPress={() => router.back()} />
      </View>

      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 28, }}>
        {step === "done" ? "Tenancy" : "Onboard"}
        <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }}>
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
                <Text style={[type.bodyStrong, { color: colors.ink }]}>
                  {lookup.exists ? lookup.fullName ?? "Existing user" : "New user"}
                </Text>
                <Text
                  style={[type.eyebrow, { color: lookup.canOnboard ? colors.primary : colors.danger, textAlign: "right" }]}
                >
                  {lookup.canOnboard ? "Eligible" : "Blocked"}
                </Text>
              </View>
              <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Tenancy type
          </Text>
          {propertiesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {!propertiesQuery.isLoading && !selectedProperty ? (
            <EmptyState
              icon={KeyRound}
              title={properties.length > 1 ? "Select a property from Home" : "No property available"}
              description="Onboarding uses the owner workspace property selected on Home."
            />
          ) : null}
          {selectedProperty ? (
            <>
              <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
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
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
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
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
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
                    <Text style={[type.bodyStrong, { color: dailyRatePaise != null ? colors.ink : colors.danger }]}>
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
                  <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
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
                      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
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

                  <Text style={[type.caption, { color: colors.muted }]}>
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
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
          {!isDaily ? (
            <Text style={[type.caption, { color: colors.muted }]}>
              Every monthly tenancy needs an accepted agreement. The tenancy stays pending until the
              tenant accepts.
            </Text>
          ) : null}
          <IdCheckDeclaration checked={idCheckConfirmed} onToggle={() => setIdCheckConfirmed((value) => !value)} />

          {withAgreement ? (

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
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Tenancy agreement
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 13, lineHeight: 19 }]}>
              These are the exact terms this tenant will accept. The term, permitted deductions and custom clauses
              below apply to this tenancy only — they do not change the property's standard agreement.
            </Text>
            {previewQuery.isFetching && !previewQuery.data ? <ActivityIndicator color={colors.primary} /> : null}
            {previewQuery.data ? (
              <AgreementClauseList clauses={previewQuery.data.filter((clause) => clause.kind === "SYSTEM")} />
            ) : null}
          </Card>

          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Agreement term
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ChoiceButton
                active={!fixedTerm}
                label="Indefinite"
                onPress={() => {
                  setFixedTerm(false);
                  setTermMonths(null);
                }}
              />
              <ChoiceButton
                active={fixedTerm}
                label="Fixed term"
                onPress={() => {
                  setFixedTerm(true);
                  setTermMonths((current) => current ?? 11);
                }}
              />
            </View>
            {fixedTerm ? (
              <>
                <Field label="Length (months)">
                  <Input
                    keyboardType="number-pad"
                    onChangeText={(text) => {
                      const parsed = Number(text.replace(/[^0-9]/g, ""));
                      setTermMonths(parsed > 0 ? Math.min(parsed, 12) : null);
                    }}
                    placeholder="11"
                    value={termMonths != null ? String(termMonths) : ""}
                  />
                </Field>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Min 1, max 12 months. A fixed term ends the tenancy on its last day.
                </Text>
              </>
            ) : (
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Runs until the tenancy ends. The notice period applies to exits.
              </Text>
            )}
          </Card>

          {allowedDeductions.length > 0 ? (
            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Permitted deductions
              </Text>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                What this tenant's deposit may be used for. You can narrow the property's list, but not add to it.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {allowedDeductions.map((category) => {
                  const on = (chosenDeductions ?? []).includes(category);
                  return (
                    <ChoiceButton
                      active={on}
                      key={category}
                      label={category.toLowerCase().replace(/_/g, " ")}
                      onPress={() =>
                        setChosenDeductions((current) =>
                          on
                            ? (current ?? []).filter((item) => item !== category)
                            : [...(current ?? []), category],
                        )
                      }
                    />
                  );
                })}
              </View>
              {(chosenDeductions ?? []).length === 0 ? (
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Nothing selected — the deposit is returned in full, less any charges agreed at exit.
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              {clausesReadOnly ? "House rules & other terms" : "House rules & other terms (editable)"}
            </Text>
            {clausesReadOnly ? (
              <Text style={[type.caption, { color: colors.inkSoft }]}>
                These are the property's standard terms. Only someone with access to tenancy rules can change them.
              </Text>
            ) : null}
            {(customDrafts ?? []).map((clause, index) => (
              <View key={`draft-${index}`} style={{ gap: spacing.sm }}>
                {index > 0 ? <Divider /> : null}
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]}>
                    Clause {index + 1}
                  </Text>
                  {clausesReadOnly ? null : (
                    <AnimatedPressable
                      accessibilityLabel={`Remove clause ${index + 1}`}
                      onPress={() => setCustomDrafts((current) => (current ?? []).filter((_, i) => i !== index))}
                      style={{ padding: 4 }}
                    >
                      <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                    </AnimatedPressable>
                  )}
                </View>
                <Field label="Clause Heading">
                  <Input
                    editable={!clausesReadOnly}
                    value={clause.heading}
                    onChangeText={(text) =>
                      setCustomDrafts((current) => (current ?? []).map((item, i) => (i === index ? { ...item, heading: text } : item)))
                    }
                    placeholder="e.g. Liability, Guests, Parking"
                  />
                </Field>
                <Field label="Clause Body">
                  <Input
                    editable={!clausesReadOnly}
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
              disabled={clausesReadOnly}
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
            <Text style={[type.bodyStrong, { color: colors.ink, textAlign: "center" }]}>
              {result.tenancy.status === "PENDING_ACCEPTANCE"
                ? "Tenancy created — awaiting acceptance"
                : result.tenantAccountCreated
                  ? "Tenant account and tenancy created"
                  : "Tenancy created"}
            </Text>
            {result.tenancy.status === "PENDING_ACCEPTANCE" ? (
              <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
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
            <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
              The tenant can now sign up with this phone number to set their PIN.
            </Text>
          ) : null}
          <PrimaryButton label="Done" onPress={() => router.back()} />
        </Card>
      ) : null}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input({ prefix, ...props }: React.ComponentProps<typeof TextInput> & { prefix?: string }) {
  const { colors, fonts } = useTheme();
  // A locked field has to LOOK locked — editable={false} alone still reads as a
  // field you can type into, which invites a tap that does nothing.
  const locked = props.editable === false;
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
        <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 15, }}>
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
        color: locked ? colors.inkSoft : colors.ink,
        fontFamily: fonts.sans,
        fontSize: 15,
        opacity: locked ? 0.7 : 1,
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
        <Text style={[type.bodyStrong, { color: colors.ink }]}>
          {title}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
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
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
        {label}
      </Text>
      <Text
        style={[
          type.body,
          { color: colors.ink, flex: 1, fontFamily: mono ? fonts.mono : fonts.sans, fontWeight: "800", textAlign: "right" },
        ]}
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
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, }}>
          I have collected and checked this tenant&apos;s ID proof and photograph
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
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
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  muted?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const foreground = disabled ? colors.muted : muted ? colors.primary : colors.onPrimary;
  return (
    <AnimatedPressable
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={busy || disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled && !muted ? colors.surfaceRaised : muted ? "transparent" : colors.primary,
        borderColor: muted ? colors.border : "transparent",
        borderRadius: 12,
        borderWidth: muted ? 1 : 0,
        justifyContent: "center",
        minHeight: 50,
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.lg,
      }}
    >
      {busy ? (
        <ActivityIndicator color={muted ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={{ color: foreground, fontFamily: fonts.sansBold, fontSize: 14, }}>
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
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, }}>
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
