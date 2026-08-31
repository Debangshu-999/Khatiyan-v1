import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { FieldHint } from "@/components/field-hint";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { UnderlineTabs } from "@/components/underline-tabs";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
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
import { ROOM_TYPE_INTRO } from "@/features/property/room-type-board";
import { RoomTypesSection } from "@/features/property/room-types-section";
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
  useListRoomMoldsQuery,
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
      <View style={{ backgroundColor: colors.formSurface, flex: 1, padding: spacing.lg }}>
        <EmptyState
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

/** Every field the save check can point at. */
type EditField =
  | "acRate"
  | "address"
  | "area"
  | "city"
  | "deposit"
  | "graceDays"
  | "name"
  | "nonAcRate"
  | "pincode"
  | "state";

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
  const [tab, setTab] = useState<EditTab>("basics");

  // Same cache entry RoomTypesSection reads, so this costs no extra request —
  // the screen needs it to answer for the occupancies at save time.
  const moldsQuery = useListRoomMoldsQuery({ propertyId: property.id }, { skip: !property.id });

  /**
   * Occupancies offered with nothing behind them.
   *
   * <p>Ticking a sharing type in Rooms is a claim the property makes; a room of
   * that size cannot be created until a type exists to cut it from. Saving with
   * the claim and no type would advertise a size the app itself cannot build.
   */
  const occupanciesWithoutTypes = availableSharingTypes.filter(
    (occupancy) =>
      !(moldsQuery.data ?? []).some((mold) => mold.active && mold.sharingType === occupancy),
  );
  const [facilities, setFacilities] = useState<PropertyFacility[]>(property.facilities);
  const [customFacilities, setCustomFacilities] = useState<string[]>(property.customFacilities);
  const [deposit, setDeposit] = useState(paiseToRupees(property.standardDepositPaise));
  const [noticePeriod, setNoticePeriod] = useState<NoticePeriod>(property.noticePeriod);
  const [graceDays, setGraceDays] = useState(String(property.rentGraceDays));
  const [lateFee, setLateFee] = useState(paiseToRupees(property.rentLateFeePerDayPaise));
  // Opt-in, as at registration. Without the toggle the rate fields were
  // permanently `required`: a property that does not offer daily stays could
  // not be saved at all, and one that does could never stop offering them.
  //
  // The rates keep their own state while hidden, so switching this off and back
  // on brings the typed figures back rather than making someone retype them.
  const [offersDailyStays, setOffersDailyStays] = useState(
    property.dailyGuestAcRatePaise != null || property.dailyGuestNonAcRatePaise != null,
  );
  const [acRate, setAcRate] = useState(paiseToRupees(property.dailyGuestAcRatePaise));
  const [nonAcRate, setNonAcRate] = useState(paiseToRupees(property.dailyGuestNonAcRatePaise));
  const toast = useToast();
  const form = useFormErrors<EditField>();
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
    offersDailyStays !== (property.dailyGuestAcRatePaise != null || property.dailyGuestNonAcRatePaise != null) ||
    acRate !== paiseToRupees(property.dailyGuestAcRatePaise) ||
    nonAcRate !== paiseToRupees(property.dailyGuestNonAcRatePaise) ||
    latitude !== property.latitude ||
    longitude !== property.longitude;

  // Photos are written the moment they change, so they are not part of `dirty`.
  // This only exists so Save can tell "you changed nothing" apart from "you
  // changed photos, which are already saved".
  const [photosTouched, setPhotosTouched] = useState(false);

  const unsaved = useUnsavedChanges(dirty);

  /**
   * Turning daily stays back on restores the rates rather than clearing them.
   *
   * <p>Typed figures survive in state while the fields are hidden, so they come
   * back on their own. This also falls back to the property's stored rates, so
   * the fields are never blank when the property has rates on record — the
   * toggle is a visibility switch, not an eraser.
   */
  function setDailyStays(next: boolean) {
    setOffersDailyStays(next);
    if (!next) {
      return;
    }
    setAcRate((current) => current || paiseToRupees(property.dailyGuestAcRatePaise));
    setNonAcRate((current) => current || paiseToRupees(property.dailyGuestNonAcRatePaise));
  }

  async function submit() {
    if (isLoading) {
      return;
    }

    // Saving an untouched form would fire a request and close the screen,
    // reporting success for a change nobody made.
    if (!dirty) {
      // Photos went to the server as they were changed, so there is nothing
      // left to write — but the work IS done, and refusing to close is the
      // wrong answer to someone saying they have finished.
      if (photosTouched) {
        toast.success("Photos updated.");
        onClose();
        return;
      }
      toast.warning("No changes have been made.");
      return;
    }

    if (occupanciesWithoutTypes.length > 0) {
      // A refusal, not a field error: there is no field to put it under, and
      // the fix is on another tab. Modal, then land them where the work is.
      const named = occupanciesWithoutTypes.map((option) => humanizeToken(option).toLowerCase()).join(", ");
      form.failFromServer(
        `Every occupancy you offer needs at least one room type. Add one for: ${named}.`,
      );
      setTab("types");
      return;
    }

    const depositPaise = rupeesToPaise(deposit);
    const acRatePaise = offersDailyStays ? rupeesToPaise(acRate) : null;
    const nonAcRatePaise = offersDailyStays ? rupeesToPaise(nonAcRate) : null;
    // Notice is a picker now, so there is no invalid value left to guard.
    const grace = Number(graceDays);
    const cleared = form.validate({
      ...(name.trim() ? {} : { name: "Enter the property name." }),
      ...(address.trim() ? {} : { address: "Enter address line 1." }),
      ...(area.trim() ? {} : { area: "Enter the area or locality." }),
      ...(city.trim() ? {} : { city: "Enter the city." }),
      ...(state.trim() ? {} : { state: "Enter the state." }),
      ...(pincode.trim() ? {} : { pincode: "Enter the pincode." }),
      ...(depositPaise == null ? { deposit: "Enter a valid standard deposit." } : {}),
      ...(Number.isInteger(grace) && grace >= MIN_RENT_GRACE_DAYS && grace <= MAX_RENT_GRACE_DAYS
        ? {}
        : { graceDays: `Grace days must be a whole number between ${MIN_RENT_GRACE_DAYS} and ${MAX_RENT_GRACE_DAYS}.` }),
      // The fields were marked `required` and nothing checked them. Saving with
      // daily stays on and a blank — or zero — rate stored null, and the reader
      // is shown daily renting only when a rate is greater than zero, so the
      // listing card and the property profile silently stayed off. It looked
      // like the toggle had not taken, which is why the numbers "had to be
      // retyped" before anything picked them up.
      ...(offersDailyStays && !(acRatePaise != null && acRatePaise > 0)
        ? { acRate: "Enter the AC rate, or turn daily stays off." }
        : {}),
      ...(offersDailyStays && !(nonAcRatePaise != null && nonAcRatePaise > 0)
        ? { nonAcRate: "Enter the non-AC rate, or turn daily stays off." }
        : {}),
    });
    // The deposit re-check is the type narrowing the validate map cannot express.
    if (!cleared || depositPaise == null) {
      // Sections are tabs now, so a blamed field can be on a tab nobody is
      // looking at — Save would refuse and the reason would be one screen away
      // with nothing on this one to explain it. Go to the first offender.
      const blamed = (Object.keys(form.errors) as EditField[])[0];
      const owner = blamed ? TAB_OF_FIELD[blamed] : null;
      if (owner && owner !== tab) {
        setTab(owner);
      }
      return;
    }

    const payload: UpdatePropertyPayload = {
      address: address.trim(),
      area: area.trim(),
      city: city.trim(),
      customFacilities,
      // Null when the toggle is off. The typed values survive in state for the
      // rest of the session, but a saved property that no longer offers daily
      // stays must not keep rates on record for it.
      dailyGuestAcRatePaise: acRatePaise,
      dailyGuestNonAcRatePaise: nonAcRatePaise,
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
      // Before the close, not after: the screen unmounts on close and the only
      // other outcome — the refusal below — already speaks for itself, so a save
      // that said nothing at all was indistinguishable from one that was ignored.
      toast.success(`${name.trim() || property.name} updated.`);
      onClose();
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save the property. Please try again.");
    }
  }

  return (
    <View style={{ backgroundColor: colors.formSurface, flex: 1 }}>
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
                // Matches the rule under the tabs below it. These two lines
                // divide the screen into its header, its navigation and its
                // content; drawn as hairlines they read as incidental borders
                // rather than as that structure.
                borderBottomColor: colors.borderStrong,
                borderBottomWidth: 2,
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

            {/* Flush under the header, with no gap of its own. The selected
                tab is a tinted body running from the header's rule down to the
                tabs' own — a strip of page colour above it would leave the
                selection floating between two lines instead of joining them. */}
            <View style={{ paddingHorizontal: spacing.lg }}>
              <UnderlineTabs active={tab} bleed={spacing.lg} onChange={setTab} options={EDIT_TABS} tone="strong" />
            </View>

            <ScrollView
              contentContainerStyle={{
                gap: spacing.lg,
                paddingBottom: PINNED_FOOTER_CLEARANCE,
                paddingHorizontal: spacing.lg,
                // Tighter than the sides. The tab strip already leaves a gap
                // below its rule, and a full gutter on top of that pushed the
                // section title into the middle of the screen with nothing
                // between it and the tabs but air.
                paddingTop: spacing.sm,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              {tab === "basics" ? (
              <ModalSection title="Name & location">
                <FormInput autoCapitalize="words" label="Property name" error={form.errors.name} onChangeText={(next) => { setName(next); form.clearField("name"); }} placeholder="Property name" value={name} required />
                <LocationPinCard
                  addressSummary={addressSummaryLine(area, city, pincode)}
                  coords={latitude != null && longitude != null ? { latitude, longitude } : null}
                  onPress={() => setPickerOpen(true)}
                />
                <FormInput label="Address line 1" multiline error={form.errors.address} onChangeText={(next) => { setAddress(next); form.clearField("address"); }} placeholder="Building, street, landmark" value={address} required />
                <FormInput autoCapitalize="words" label="Address line 2 / Area" error={form.errors.area} onChangeText={(next) => { setArea(next); form.clearField("area"); }} placeholder="Area or locality" value={area} required />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="City" error={form.errors.city} onChangeText={(next) => { setCity(next); form.clearField("city"); }} placeholder="City" value={city} required />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="State" error={form.errors.state} onChangeText={(next) => { setState(next); form.clearField("state"); }} placeholder="State" value={state} required />
                  </View>
                </View>
                <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} error={form.errors.pincode} onChangeText={(next) => { setPincode(next); form.clearField("pincode"); }} placeholder="Pincode" value={pincode} required />
              </ModalSection>
              ) : null}

              {tab === "rooms" ? (
              <ModalSection title="Rooms & inclusions">
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
                  title="Choose occupancies"
                  value={availableSharingTypes}
                />

                <FacilitiesField
                  customFacilities={customFacilities}
                  facilities={facilities}
                  onChangeCustom={setCustomFacilities}
                  onChangeFacilities={setFacilities}
                />
              </ModalSection>
              ) : null}

              {tab === "types" ? (
              <ModalSection title="Room types">
                <View style={{ gap: 4 }}>
                  {ROOM_TYPE_INTRO.map((line) => (
                    <Text key={line} style={[type.body, { color: colors.muted }]}>
                      {"• "}
                      {line}
                    </Text>
                  ))}
                </View>

                {/* Saves as it goes, like the images below it — a room type is
                    not a field of the property, and making it wait for Save
                    would let an owner edit a type, discard the form, and have no
                    way to tell which of the two had happened. */}
                <RoomTypesSection
                  occupancies={availableSharingTypes}
                  onChanged={() => setPhotosTouched(true)}
                  propertyId={property.id}
                />
              </ModalSection>
              ) : null}

              {tab === "pricing" ? (
              <ModalSection title="Pricing & policy">
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Std. deposit" error={form.errors.deposit} onChangeText={(next) => { setDeposit(next); form.clearField("deposit"); }} placeholder="Amount" prefix="₹" value={deposit} required />
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
                  error={form.errors.graceDays} onChangeText={(next) => { setGraceDays(next); form.clearField("graceDays"); }}
                  placeholder={`e.g. 3 — max ${MAX_RENT_GRACE_DAYS}`}
                  required
                  value={graceDays}
                />
                <FieldHint text={RENT_GRACE_RANGE_HINT} />
                <Labeled label="Offers daily stays">
                  <ChoiceButton active={offersDailyStays} label="Yes" onPress={() => setDailyStays(true)} square />
                  <ChoiceButton active={!offersDailyStays} label="No" onPress={() => setDailyStays(false)} square />
                </Labeled>
                {offersDailyStays ? (
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        error={form.errors.acRate}
                        keyboardType="decimal-pad"
                        label="Guest AC/day"
                        onChangeText={(next) => { setAcRate(next); form.clearField("acRate"); }}
                        placeholder="800"
                        prefix="₹"
                        required
                        value={acRate}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        error={form.errors.nonAcRate}
                        keyboardType="decimal-pad"
                        label="Guest non-AC/day"
                        onChangeText={(next) => { setNonAcRate(next); form.clearField("nonAcRate"); }}
                        placeholder="600"
                        prefix="₹"
                        required
                        value={nonAcRate}
                      />
                    </View>
                  </View>
                ) : null}
              </ModalSection>
              ) : null}

              {/* Saved immediately, unlike the fields above. The property already
                  exists, so an image has somewhere to belong the moment it
                  uploads — there is nothing to batch it into. */}
              {tab === "photos" ? (
              <ModalSection title="Listing images" trailing={<UploadRulesInfo max={MAX_PROPERTY_IMAGES} />}>
                <PropertyImagesSection onChanged={() => setPhotosTouched(true)} propertyId={property.id} />
              </ModalSection>
              ) : null}

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* OUTSIDE the KeyboardAvoidingView, and it has to be.

          The footer is position:absolute bottom:0, so it pins to whatever box
          contains it. Inside the KAV that box shrinks from the bottom as padding
          is applied, taking the footer up with it — and the KAV's padding does
          not reliably return to zero after a MODAL closes, because on Android a
          modal is its own window and the view behind it never sees the keyboard
          hide. The button and its shadow were left floating with a band of page
          colour underneath.

          Out here it pins to the screen, which is where "pinned to the bottom"
          was always meant to mean. The scroll content keeps its keyboard
          avoidance; only the footer stops moving. */}
      <PinnedFooter>
        <ActionButton disabled={isLoading || form.blocked} label={isLoading ? "Saving..." : "Save property"} onPress={() => void submit()} />
      </PinnedFooter>

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}

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

/**
 * One tab's worth of the form, straight on the page.
 *
 * <p>No card, matching registration. With one section on screen at a time the
 * card was never separating it from anything — it only took an 18pt gutter of
 * its own on top of the scroll view's, which the fields inside then gave up
 * again, leaving the inputs narrower than the button under them.
 */
/**
 * The parts of a property, as tabs rather than one long scroll.
 *
 * <p>Editing is not registering. Registration is a sequence — you walk it once,
 * in order, and a wizard is right for that. Editing is arriving to change ONE
 * thing, and a single sheet made that a scroll past four sections you did not
 * come for. Tabs put every part one tap away.
 */
type EditTab = "basics" | "rooms" | "types" | "pricing" | "photos";

/** Which tab a field lives on, so a refusal can go to where the fix is. */
const TAB_OF_FIELD: Record<EditField, EditTab> = {
  acRate: "pricing",
  address: "basics",
  area: "basics",
  city: "basics",
  deposit: "pricing",
  graceDays: "pricing",
  name: "basics",
  nonAcRate: "pricing",
  pincode: "basics",
  state: "basics",
};

const EDIT_TABS: { label: string; value: EditTab }[] = [
  { label: "Basics", value: "basics" },
  { label: "Rooms", value: "rooms" },
  { label: "Types", value: "types" },
  { label: "Pricing", value: "pricing" },
  { label: "Photos", value: "photos" },
];

/**
 * One tab's worth of the form, straight on the page.
 *
 * <p>No card, matching registration. With one section on screen at a time the
 * card was never separating it from anything — it only took an 18pt gutter of
 * its own on top of the scroll view's, which the fields inside then gave up
 * again, leaving the inputs narrower than the button under them.
 */
function ModalSection({ children, title, trailing }: { children: ReactNode; title: string; trailing?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {/* No eyebrow. It named the section — "Basics", "Money" — which is the
          job the tab above it now does, and two labels for one section left the
          reader deciding which was the heading. The title takes the weight the
          pair used to carry between them. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.3 }}>
          {title}
        </Text>
        {trailing}
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
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
