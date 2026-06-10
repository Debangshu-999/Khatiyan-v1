import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Platform, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ArrowLeft, CalendarDays, Check, ChevronRight, KeyRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
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

type Step = "phone" | "details" | "review" | "done";

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<TenantLookup | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [startDate, setStartDate] = useState<Date>(startOfToday());
  const [showPicker, setShowPicker] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TenancyOnboardingResult | null>(null);

  const [triggerLookup, lookupState] = useLazyLookupTenantQuery();
  const propertiesQuery = useListMyPropertiesQuery(undefined, { skip: step !== "details" });
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = useMemo<OwnerProperty | undefined>(
    () => resolveSelectedProperty(properties, selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = roomsQuery.data ?? [];
  const selectedRoom = useMemo<OwnerRoom | undefined>(
    () => rooms.find((room) => room.id === roomId),
    [roomId, rooms],
  );
  const [onboard, onboardState] = useOnboardTenantMutation();

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

  function goToDetails() {
    if (!lookup?.canOnboard) {
      return;
    }
    setMessage(null);
    setStep("details");
  }

  function goToReview() {
    setMessage(null);
    if (!selectedProperty || !selectedRoom) {
      setMessage("Select a property on Home and choose a room.");
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
    if (!(Number(rent) > 0)) {
      setMessage("Rent must be greater than zero.");
      return;
    }
    setStep("review");
  }

  async function handleConfirm() {
    if (!selectedProperty || !roomId) return;
    setMessage(null);
    try {
      const res = await onboard({
        tenantPhone: phone.trim(),
        tenantName: tenantName.trim() ? tenantName.trim() : null,
        propertyId: selectedProperty.id,
        roomId,
        billingType: "MONTHLY",
        rentAmountPaise: Math.round(Number(rent) * 100),
        depositAmountPaise: Math.round(Number(deposit || "0") * 100),
        startDate: dateToStr(startDate),
      }).unwrap();
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

              {lookup.canOnboard ? <PrimaryButton label="Continue" onPress={goToDetails} /> : null}
            </View>
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
              {rooms.map((room) => {
                const full = room.availableVacancies <= 0;
                return (
                  <SelectRow
                    key={room.id}
                    title={`Room ${room.roomNumber}${room.floor ? ` / ${room.floor}` : ""}`}
                    subtitle={`${rupees(room.baseRentPaise)} / ${full ? "Full" : `${room.availableVacancies} vacancy`}`}
                    selected={room.id === roomId}
                    disabled={full}
                    onPress={() => selectRoom(room)}
                  />
                );
              })}
            </Card>
          ) : null}

          {roomId ? (
            <Card>
              <Field label="Rent / month">
                <Input value={rent} onChangeText={setRent} placeholder="From room base rent" keyboardType="number-pad" />
              </Field>
              <Field label="Deposit">
                <Input value={deposit} onChangeText={setDeposit} placeholder="From property policy" keyboardType="number-pad" />
              </Field>
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
              { label: "Property", value: selectedProperty?.name ?? "-" },
              { label: "Room", value: selectedRoom ? `Room ${selectedRoom.roomNumber}` : "-" },
              { label: "Rent / month", value: rupees(Math.round(Number(rent) * 100)), mono: true },
              { label: "Deposit", value: rupees(Math.round(Number(deposit || "0") * 100)), mono: true },
              { label: "Start date", value: formatDateLong(startDate) },
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
              { label: "Rent / month", value: rupees(result.tenancy.rentAmountPaise ?? 0), mono: true },
              { label: "Deposit", value: rupees(result.tenancy.depositAmountPaise ?? 0), mono: true },
              { label: "Start date", value: result.tenancy.startDate },
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

      {message ? (
        <Text style={[type.body, { color: colors.danger }]} selectable>
          {message}
        </Text>
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
    <TextInput
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
