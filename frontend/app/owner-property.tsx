import { useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Building2, ClipboardList, Pencil, ShieldCheck, BedDouble, X } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  FormInput,
  IconButton,
  formatMoneyPaise,
  humanizeToken,
  paiseToRupees,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  PROPERTY_FACILITIES,
  PROPERTY_TYPES,
  useListMyPropertiesQuery,
  useUpdatePropertyMutation,
  type OwnerProperty,
  type PropertyFacility,
  type PropertyType,
  type UpdatePropertyPayload,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyRoute = "/owner-rooms" | "/owner-staff" | "/owner-board";

export default function OwnerPropertyScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : null}

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Building2}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                {selectedProperty.referenceCode} · {humanizeToken(selectedProperty.type)}
              </Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 24, lineHeight: 29 }]} selectable>
                {selectedProperty.name}
              </Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>
                {[selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")}
              </Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <ActionButton icon={Pencil} label="Edit property" onPress={() => setEditOpen(true)} variant="secondary" />
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Deposit" value={formatMoneyPaise(selectedProperty.standardDepositPaise)} hint="Standard" tone="primary" />
            <MetricTile label="Notice" value={`${selectedProperty.noticePeriodDays}d`} hint="Notice period" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Grace" value={`${selectedProperty.rentGraceDays}d`} hint="Rent grace" />
            <MetricTile
              label="Late fee"
              value={selectedProperty.rentLateFeePerDayPaise ? `${formatMoneyPaise(selectedProperty.rentLateFeePerDayPaise)}/d` : "—"}
              hint="Per day"
            />
          </View>

          {selectedProperty.facilities.length || selectedProperty.customFacilities.length ? (
            <Card tone="sunken">
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Facilities
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {[...selectedProperty.facilities.map(humanizeToken), ...selectedProperty.customFacilities].map((facility) => (
                  <View key={facility} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                    <Text style={[type.caption, { color: colors.muted }]} selectable>
                      {facility}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Section eyebrow="Manage" title="Property workspace">
            <ActionCard
              meta="Rooms"
              title="Rooms & beds"
              description="Create rooms single or in bulk, edit, set status and manage occupancy."
              onPress={() => open(router, "/owner-rooms")}
              tone="primary"
            />
            <ActionCard
              meta="Staff"
              title="Managers"
              description="Add or remove managers who run day-to-day operations for this property."
              onPress={() => open(router, "/owner-staff")}
            />
            <ActionCard
              meta="Board"
              title="Property board"
              description="Always-on info for tenants — rules, timings and contacts, organised by category."
              onPress={() => open(router, "/owner-board")}
            />
          </Section>
        </>
      ) : null}

      {editOpen && selectedProperty ? <EditPropertyModal onClose={() => setEditOpen(false)} property={selectedProperty} /> : null}
    </ScreenScrollView>
  );
}

function EditPropertyModal({ onClose, property }: { onClose: () => void; property: OwnerProperty }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address);
  const [city, setCity] = useState(property.city);
  const [state, setState] = useState(property.state ?? "");
  const [pincode, setPincode] = useState(property.pincode);
  const [propertyType, setPropertyType] = useState<PropertyType>(property.type);
  const [facilities, setFacilities] = useState<PropertyFacility[]>(property.facilities);
  const [customFacilities, setCustomFacilities] = useState(property.customFacilities.join(", "));
  const [deposit, setDeposit] = useState(paiseToRupees(property.standardDepositPaise));
  const [noticeDays, setNoticeDays] = useState(String(property.noticePeriodDays));
  const [graceDays, setGraceDays] = useState(String(property.rentGraceDays));
  const [lateFee, setLateFee] = useState(paiseToRupees(property.rentLateFeePerDayPaise));
  const [acRate, setAcRate] = useState(paiseToRupees(property.dailyGuestAcRatePaise));
  const [nonAcRate, setNonAcRate] = useState(paiseToRupees(property.dailyGuestNonAcRatePaise));
  const [error, setError] = useState<string | null>(null);
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();

  function toggleFacility(facility: PropertyFacility) {
    setFacilities((current) => (current.includes(facility) ? current.filter((item) => item !== facility) : [...current, facility]));
  }

  async function submit() {
    if (isLoading) {
      return;
    }
    if (!name.trim() || !address.trim() || !city.trim() || !pincode.trim()) {
      setError("Name, address, city and pincode are required.");
      return;
    }
    const depositPaise = rupeesToPaise(deposit);
    if (depositPaise == null) {
      setError("Enter a valid standard deposit.");
      return;
    }
    const notice = Number(noticeDays);
    const grace = Number(graceDays);
    if (!Number.isInteger(notice) || notice < 0 || !Number.isInteger(grace) || grace < 0) {
      setError("Notice and grace days must be whole numbers.");
      return;
    }
    setError(null);
    const payload: UpdatePropertyPayload = {
      address: address.trim(),
      city: city.trim(),
      customFacilities: customFacilities.split(",").map((item) => item.trim()).filter(Boolean),
      dailyGuestAcRatePaise: rupeesToPaise(acRate),
      dailyGuestNonAcRatePaise: rupeesToPaise(nonAcRate),
      facilities,
      name: name.trim(),
      noticePeriodDays: notice,
      pincode: pincode.trim(),
      rentGraceDays: grace,
      rentLateFeePerDayPaise: rupeesToPaise(lateFee),
      standardDepositPaise: depositPaise,
      state: state.trim() || null,
      type: propertyType,
    };
    try {
      await updateProperty({ payload, propertyId: property.id }).unwrap();
      onClose();
    } catch {
      setError("Could not save the property. Please try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              gap: spacing.md,
              maxHeight: "92%",
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
                Edit property
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={{ flexShrink: 1 }}>
              <FormInput label="Name" onChangeText={setName} placeholder="Property name" value={name} />
              <FormInput label="Address" multiline onChangeText={setAddress} placeholder="Street address" value={address} />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput label="City" onChangeText={setCity} placeholder="City" value={city} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput label="State" onChangeText={setState} placeholder="State" value={state} />
                </View>
              </View>
              <FormInput keyboardType="number-pad" label="Pincode" onChangeText={setPincode} placeholder="Pincode" value={pincode} />

              <Labeled label="Property type">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {PROPERTY_TYPES.map((option) => (
                    <ChoiceButton active={option === propertyType} key={option} label={humanizeToken(option)} onPress={() => setPropertyType(option)} />
                  ))}
                </View>
              </Labeled>

              <Labeled label="Facilities">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {PROPERTY_FACILITIES.map((facility) => (
                    <ChoiceButton active={facilities.includes(facility)} key={facility} label={humanizeToken(facility)} onPress={() => toggleFacility(facility)} />
                  ))}
                </View>
              </Labeled>

              <FormInput label="Custom facilities (comma separated)" onChangeText={setCustomFacilities} placeholder="e.g. Rooftop, Balcony" value={customFacilities} />

              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="decimal-pad" label="Std. deposit (₹)" onChangeText={setDeposit} placeholder="Amount" value={deposit} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="decimal-pad" label="Late fee/day (₹)" onChangeText={setLateFee} placeholder="Optional" value={lateFee} />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="number-pad" label="Notice (days)" onChangeText={setNoticeDays} placeholder="30" value={noticeDays} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="number-pad" label="Grace (days)" onChangeText={setGraceDays} placeholder="5" value={graceDays} />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="decimal-pad" label="Guest AC/day (₹)" onChangeText={setAcRate} placeholder="Optional" value={acRate} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="decimal-pad" label="Guest non-AC/day (₹)" onChangeText={setNonAcRate} placeholder="Optional" value={nonAcRate} />
                </View>
              </View>

              {error ? (
                <Text style={[type.caption, { color: colors.danger }]} selectable>
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={isLoading} label={isLoading ? "Saving" : "Save property"} onPress={() => void submit()} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Labeled({ children, label }: { children: ReactNode; label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      {children}
    </View>
  );
}

function open(router: ReturnType<typeof useRouter>, route: PropertyRoute) {
  router.push(route);
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
