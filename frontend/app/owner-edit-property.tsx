import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FieldHint } from "@/components/field-hint";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { useToast } from "@/components/toast";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal, type PickedLocation } from "@/features/geo/map-location-picker";
import { FacilitiesField } from "@/features/owner/facilities-field";
import {
  ActionButton,
  ChoiceButton,
  FormInput,
  IconButton,
  humanizeToken,
  paiseToRupees,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { PropertyImagesSection } from "@/features/property/property-images-section";
import { UploadRulesInfo } from "@/features/uploads/upload-rules-info";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  BATHROOM_TYPES,
  MAX_RENT_GRACE_DAYS,
  MEAL_TYPES,
  MIN_RENT_GRACE_DAYS,
  NOTICE_PERIOD_LABELS,
  NOTICE_PERIOD_OPTIONS,
  NOTICE_PERIOD_RANGE_HINT,
  PG_FOR_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  PROPERTY_TYPES,
  RENT_GRACE_RANGE_HINT,
  ROOM_TYPES,
  useListMyPropertiesQuery,
  useUpdatePropertyMutation,
  type BathroomType,
  type MealType,
  type NoticePeriod,
  type OwnerProperty,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomType,
  type UpdatePropertyPayload,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Mirrors the backend cap on discovery.property_images. */
const MAX_PROPERTY_IMAGES = 10;
/** Mirrors Property.MIN_NOTICE_PERIOD_DAYS. */

/**
 * Editing a property, as a screen rather than a sheet.
 *
 * <p>It was a modal, which put its validation messages inside a window the
 * person could not scroll far enough to see — and a form this long needs room
 * of its own. As a route it also gets a back gesture and a URL.
 */
export default function OwnerEditPropertyScreen() {
  const { colors } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = selectedPropertyId
    ? properties.find((candidate) => candidate.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;

  if (!property) {
    return (
      <View style={{ backgroundColor: colors.background, flex: 1, padding: spacing.lg }}>
        <EmptyState
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property you want to edit from Home."
        />
      </View>
    );
  }

  // Keyed so the form re-seeds from scratch when the active property changes;
  // the state below is initialised from props exactly once.
  return <EditPropertyForm key={property.id} property={property} />;
}

function EditPropertyForm({ property }: { property: OwnerProperty }) {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colors, fonts, type } = useTheme();
  const onClose = () => router.back();
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address);
  const [area, setArea] = useState(property.area);
  const [city, setCity] = useState(property.city);
  const [state, setState] = useState(property.state ?? "");
  const [pincode, setPincode] = useState(property.pincode);
  const [latitude, setLatitude] = useState<number | null>(property.latitude);
  const [longitude, setLongitude] = useState<number | null>(property.longitude);
  const [propertyType, setPropertyType] = useState<PropertyType>(property.type);
  const [pgFor, setPgFor] = useState<PgFor>(property.pgFor ?? "ANYONE");
  const [preferredFor, setPreferredFor] = useState<PreferredTenantType>(property.preferredFor ?? "ANYONE");
  const [includedMeals, setIncludedMeals] = useState<MealType[]>(property.includedMeals ?? []);
  const [electricityIncluded, setElectricityIncluded] = useState(Boolean(property.electricityIncluded));
  const [bathroomType, setBathroomType] = useState<BathroomType>(property.bathroomType ?? "COMMON");
  const [availableSharingTypes, setAvailableSharingTypes] = useState<RoomType[]>(property.availableSharingTypes ?? []);
  const [facilities, setFacilities] = useState<PropertyFacility[]>(property.facilities);
  const [customFacilities, setCustomFacilities] = useState<string[]>(property.customFacilities);
  const [deposit, setDeposit] = useState(paiseToRupees(property.standardDepositPaise));
  const [noticePeriod, setNoticePeriod] = useState<NoticePeriod>(property.noticePeriod);
  const [graceDays, setGraceDays] = useState(String(property.rentGraceDays));
  const [lateFee, setLateFee] = useState(paiseToRupees(property.rentLateFeePerDayPaise));
  const [acRate, setAcRate] = useState(paiseToRupees(property.dailyGuestAcRatePaise));
  const [nonAcRate, setNonAcRate] = useState(paiseToRupees(property.dailyGuestNonAcRatePaise));
  const toast = useToast();
  // A toast, not an inline banner. The banner lived at the bottom of a long
  // scroll: submitting from the top said nothing, because the message rendered
  // off-screen behind the pinned footer.
  const setError = (value: string | null) => {
    if (value) {
      toast.error(value);
    }
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();

  // Every address field follows the pinned point; the owner appends flat /
  // building detail to line 1 afterwards (Swiggy-style flow).
  function applyPickedLocation(result: PickedLocation) {
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    const picked = result.address;
    if (!picked) {
      return;
    }
    if (picked.street) {
      setAddress(picked.street);
    }
    if (picked.locality) {
      setArea(picked.locality);
    }
    if (picked.city) {
      setCity(picked.city);
    }
    if (picked.state) {
      setState(picked.state);
    }
    if (picked.pincode) {
      setPincode(picked.pincode);
    }
  }

  function toggleMeal(meal: MealType) {
    setIncludedMeals((current) => (current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal]));
  }

  // Compared against the property as loaded, so returning a field to its
  // original value clears the warning rather than arming it forever.
  const dirty =
    name !== property.name ||
    address !== property.address ||
    area !== property.area ||
    city !== property.city ||
    state !== (property.state ?? "") ||
    pincode !== property.pincode ||
    propertyType !== property.type ||
    pgFor !== (property.pgFor ?? "ANYONE") ||
    preferredFor !== (property.preferredFor ?? "ANYONE") ||
    electricityIncluded !== Boolean(property.electricityIncluded) ||
    bathroomType !== (property.bathroomType ?? "COMMON") ||
    includedMeals.join() !== (property.includedMeals ?? []).join() ||
    availableSharingTypes.join() !== (property.availableSharingTypes ?? []).join() ||
    facilities.join() !== (property.facilities ?? []).join() ||
    customFacilities.join() !== (property.customFacilities ?? []).join() ||
    deposit !== paiseToRupees(property.standardDepositPaise) ||
    lateFee !== paiseToRupees(property.rentLateFeePerDayPaise) ||
    acRate !== paiseToRupees(property.dailyGuestAcRatePaise) ||
    nonAcRate !== paiseToRupees(property.dailyGuestNonAcRatePaise) ||
    latitude !== property.latitude ||
    longitude !== property.longitude;

  const unsaved = useUnsavedChanges(dirty);

  async function submit() {
    if (isLoading) {
      return;
    }
    if (!name.trim() || !address.trim() || !area.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError("Name, address line 1, area, city, state and pincode are required.");
      return;
    }
    const depositPaise = rupeesToPaise(deposit);
    if (depositPaise == null) {
      setError("Enter a valid standard deposit.");
      return;
    }
    // Notice is a picker now, so there is no invalid value left to guard.
    const grace = Number(graceDays);
    if (!Number.isInteger(grace) || grace < MIN_RENT_GRACE_DAYS || grace > MAX_RENT_GRACE_DAYS) {
      setError(`Grace days must be a whole number between ${MIN_RENT_GRACE_DAYS} and ${MAX_RENT_GRACE_DAYS}.`);
      return;
    }
    setError(null);
    const payload: UpdatePropertyPayload = {
      address: address.trim(),
      area: area.trim(),
      city: city.trim(),
      customFacilities,
      dailyGuestAcRatePaise: rupeesToPaise(acRate),
      dailyGuestNonAcRatePaise: rupeesToPaise(nonAcRate),
      availableSharingTypes,
      bathroomType,
      electricityIncluded,
      facilities,
      foodIncluded: includedMeals.length > 0,
      includedMeals,
      latitude,
      longitude,
      name: name.trim(),
      noticePeriod,
      pincode: pincode.trim(),
      pgFor,
      preferredFor,
      rentGraceDays: grace,
      rentLateFeePerDayPaise: rupeesToPaise(lateFee),
      standardDepositPaise: depositPaise,
      state: state.trim(),
      type: propertyType,
    };
    try {
      await updateProperty({ payload, propertyId: property.id }).unwrap();
      unsaved.markSaved();
      onClose();
    } catch {
      setError("Could not save the property. Please try again.");
    }
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {unsaved.dialog}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {/* The inset is on the header, not the screen: it was a bottom
                sheet, which never met the status bar. As a route it starts at
                the top of the display and needs to clear it. */}
            <View
              style={{
                alignItems: "center",
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingBottom: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingTop: insets.top + spacing.md,
              }}
            >
              <IconButton accessibilityLabel="Back" icon={ArrowLeft} onPress={onClose} />
              <View style={{ flex: 1, gap: 2, paddingLeft: spacing.sm }}>
                <Text style={[type.eyebrow, { color: colors.accent }]}>
                  {property.referenceCode}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.3 }}>
                  Edit property
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{
                gap: spacing.lg,
                padding: spacing.lg,
                paddingBottom: PINNED_FOOTER_CLEARANCE,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              <ModalSection eyebrow="Basics" title="Name & location">
                <FormInput autoCapitalize="words" label="Property name" onChangeText={setName} placeholder="Property name" value={name} required />
                <LocationPinCard
                  addressSummary={addressSummaryLine(area, city, pincode)}
                  coords={latitude != null && longitude != null ? { latitude, longitude } : null}
                  onPress={() => setPickerOpen(true)}
                />
                <FormInput label="Address line 1" multiline onChangeText={setAddress} placeholder="Building, street, landmark" value={address} required />
                <FormInput autoCapitalize="words" label="Address line 2 / Area" onChangeText={setArea} placeholder="Area or locality" value={area} required />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="City" onChangeText={setCity} placeholder="City" value={city} required />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="State" onChangeText={setState} placeholder="State" value={state} required />
                  </View>
                </View>
                <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} onChangeText={setPincode} placeholder="Pincode" value={pincode} required />
              </ModalSection>

              <ModalSection eyebrow="Setup" title="Rooms & inclusions">
                <SingleOptionPicker
                  label="Property type"
                  required
                  onChange={setPropertyType}
                  options={PROPERTY_TYPES.map((option) => ({ label: humanizeToken(option), value: option }))}
                  value={propertyType}
                />

                <Labeled label="PG for">
                  {PG_FOR_OPTIONS.map((option) => (
                    <ChoiceButton active={option === pgFor} key={option} label={humanizeToken(option)} onPress={() => setPgFor(option)} square />
                  ))}
                </Labeled>

                <Labeled label="Preferred for">
                  {PREFERRED_TENANT_OPTIONS.map((option) => (
                    <ChoiceButton active={option === preferredFor} key={option} label={humanizeToken(option)} onPress={() => setPreferredFor(option)} square />
                  ))}
                </Labeled>

                <Labeled label="Meals included (optional)">
                  {MEAL_TYPES.map((meal) => (
                    <ChoiceButton active={includedMeals.includes(meal)} key={meal} label={humanizeToken(meal)} onPress={() => toggleMeal(meal)} square />
                  ))}
                </Labeled>

                <Labeled label="Electricity included">
                  <ChoiceButton active={electricityIncluded} label="Yes" onPress={() => setElectricityIncluded(true)} square />
                  <ChoiceButton active={!electricityIncluded} label="No" onPress={() => setElectricityIncluded(false)} square />
                </Labeled>

                <Labeled label="Bathroom type">
                  {BATHROOM_TYPES.map((option) => (
                    <ChoiceButton active={option === bathroomType} key={option} label={humanizeToken(option)} onPress={() => setBathroomType(option)} square />
                  ))}
                </Labeled>

                <OptionPicker
                  emptyLabel="No sharing types selected"
                  label="Available sharing types"
                  required
                  onChange={setAvailableSharingTypes}
                  options={ROOM_TYPES.map((option) => ({ label: humanizeToken(option), value: option }))}
                  title="Available sharing types"
                  value={availableSharingTypes}
                />

                <FacilitiesField
                  customFacilities={customFacilities}
                  facilities={facilities}
                  onChangeCustom={setCustomFacilities}
                  onChangeFacilities={setFacilities}
                />
              </ModalSection>

              <ModalSection eyebrow="Money" title="Pricing & policy">
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Std. deposit" onChangeText={setDeposit} placeholder="Amount" prefix="₹" value={deposit} required />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Late fee/day" onChangeText={setLateFee} placeholder="Optional" prefix="₹" value={lateFee} />
                  </View>
                </View>
                <SingleOptionPicker
                  label="Notice period"
                  onChange={setNoticePeriod}
                  options={NOTICE_PERIOD_OPTIONS.map((option) => ({
                    label: NOTICE_PERIOD_LABELS[option],
                    value: option,
                  }))}
                  required
                  title="Notice period"
                  value={noticePeriod}
                />
                <FieldHint text={NOTICE_PERIOD_RANGE_HINT} />
                <FormInput
                  keyboardType="number-pad"
                  label="Grace (days)"
                  onChangeText={setGraceDays}
                  placeholder={`e.g. 3 — max ${MAX_RENT_GRACE_DAYS}`}
                  required
                  value={graceDays}
                />
                <FieldHint text={RENT_GRACE_RANGE_HINT} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Guest AC/day" onChangeText={setAcRate} placeholder="Optional" prefix="₹" value={acRate} required />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Guest non-AC/day" onChangeText={setNonAcRate} placeholder="Optional" prefix="₹" value={nonAcRate} required />
                  </View>
                </View>
              </ModalSection>

              {/* Saved immediately, unlike the fields above. The property already
                  exists, so an image has somewhere to belong the moment it
                  uploads — there is nothing to batch it into. */}
              <ModalSection eyebrow="Photos" title="Listing images" trailing={<UploadRulesInfo max={MAX_PROPERTY_IMAGES} />}>
                <PropertyImagesSection propertyId={property.id} />
              </ModalSection>

            </ScrollView>

            <PinnedFooter>
              <ActionButton disabled={isLoading} label={isLoading ? "Saving..." : "Save property"} onPress={() => void submit()} />
            </PinnedFooter>
          </View>
        </View>
      </KeyboardAvoidingView>

      {pickerOpen ? (
        <MapLocationPickerModal
          initial={latitude != null && longitude != null ? { latitude, longitude } : undefined}
          onClose={() => setPickerOpen(false)}
          onPick={applyPickedLocation}
          title="Property location"
        />
      ) : null}
    </View>
  );
}

function ModalSection({ children, eyebrow, title, trailing }: { children: ReactNode; eyebrow: string; title: string; trailing?: ReactNode }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.accent }]}>
            {eyebrow}
          </Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3 }}>
            {title}
          </Text>
        </View>
        {trailing}
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </Card>
  );
}

function Labeled({ children, label }: { children: ReactNode; label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{children}</View>
    </View>
  );
}
