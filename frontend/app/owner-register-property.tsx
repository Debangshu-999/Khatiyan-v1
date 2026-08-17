import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Card } from "@/components/card";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FieldHint } from "@/components/field-hint";
import { useToast } from "@/components/toast";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal } from "@/features/geo/map-location-picker";
import { FacilitiesField } from "@/features/owner/facilities-field";
import { PropertyImageGrid } from "@/features/property/property-image-grid";
import { uploadAssets, type UploadedAsset } from "@/features/uploads/upload-asset";
import { UploadRulesInfo } from "@/features/uploads/upload-rules-info";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  FormInput,
  humanizeToken,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { useAppDispatch } from "@/store/hooks";
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
  useCreatePropertyMutation,
  type BathroomType,
  type MealType,
  type NoticePeriod,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomType,
} from "@/store/services/property-api";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Mirrors the backend cap on discovery.property_images. */
const MAX_PROPERTY_IMAGES = 10;
/** Mirrors Property.MIN_NOTICE_PERIOD_DAYS. */

export default function OwnerRegisterPropertyScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [propertyType, setPropertyType] = useState<PropertyType>("PG");
  const [pgFor, setPgFor] = useState<PgFor>("ANYONE");
  const [preferredFor, setPreferredFor] = useState<PreferredTenantType>("ANYONE");
  const [includedMeals, setIncludedMeals] = useState<MealType[]>([]);
  const [electricityIncluded, setElectricityIncluded] = useState(false);
  const [bathroomType, setBathroomType] = useState<BathroomType>("COMMON");
  const [availableSharingTypes, setAvailableSharingTypes] = useState<RoomType[]>([]);
  const [facilities, setFacilities] = useState<PropertyFacility[]>([]);
  const [customFacilities, setCustomFacilities] = useState<string[]>([]);
  // Already-uploaded images. Uploading as each is picked keeps the bytes out of
  // the create call — ten photos over a slow connection would otherwise run
  // inside the request and time it out. Abandoning the form leaks the assets;
  // the orphan sweep reclaims them.
  const [images, setImages] = useState<UploadedAsset[]>([]);
  // Daily stays are opt-in. Empty rate fields used to mean "not offered", which
  // is indistinguishable from "forgot to fill them in"; the switch makes the
  // owner say which, and only then are the rates required.
  const [offersDailyStays, setOffersDailyStays] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [noticePeriod, setNoticePeriod] = useState<NoticePeriod>("ONE_MONTH");
  const [graceDays, setGraceDays] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [acRate, setAcRate] = useState("");
  const [nonAcRate, setNonAcRate] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  // Validation/submit failures surface as toasts; success navigates to property.
  const setError = (value: string | null) => {
    if (value) {
      toast.error(value);
    }
  };
  const [createProperty, { isLoading }] = useCreatePropertyMutation();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);

  // A create form is dirty the moment anything has been entered — there is no
  // saved version to compare against.
  const dirty = Boolean(
    name.trim() ||
      address.trim() ||
      area.trim() ||
      city.trim() ||
      state.trim() ||
      pincode.trim() ||
      deposit.trim() ||
      lateFee.trim() ||
      headline.trim() ||
      description.trim() ||
      availableSharingTypes.length ||
      facilities.length ||
      customFacilities.length ||
      includedMeals.length ||
      images.length ||
      coords,
  );
  const unsaved = useUnsavedChanges(dirty);

  async function submit() {
    if (isLoading || uploading) {
      return;
    }
    if (!name.trim() || !address.trim() || !area.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError("Name, address line 1, area, city, state and pincode are required.");
      return;
    }
    if (availableSharingTypes.length === 0) {
      setError("Choose at least one sharing option.");
      return;
    }
    if (facilities.length === 0 && customFacilities.length === 0) {
      setError("Add at least one facility.");
      return;
    }
    const depositPaise = rupeesToPaise(deposit);
    if (depositPaise == null) {
      setError("Enter the standard deposit amount.");
      return;
    }
    if (!graceDays.trim()) {
      setError("Enter the rent grace days.");
      return;
    }
    // Notice needs no validation any more — it is a picker, so there is no
    // invalid value to enter.
    const grace = Number(graceDays);
    if (!Number.isInteger(grace)) {
      setError("Grace days must be a whole number.");
      return;
    }
    if (grace < MIN_RENT_GRACE_DAYS || grace > MAX_RENT_GRACE_DAYS) {
      setError(`Grace days must be between ${MIN_RENT_GRACE_DAYS} and ${MAX_RENT_GRACE_DAYS}.`);
      return;
    }
    const acRatePaise = offersDailyStays ? rupeesToPaise(acRate) : null;
    const nonAcRatePaise = offersDailyStays ? rupeesToPaise(nonAcRate) : null;
    if (offersDailyStays && (acRatePaise == null || nonAcRatePaise == null)) {
      setError("Enter both daily guest rates, or turn daily stays off.");
      return;
    }
    if (images.length === 0) {
      setError("Add at least one listing image.");
      return;
    }

    setError(null);

    try {
      const property = await createProperty({
        address: address.trim(),
        area: area.trim(),
        availableSharingTypes,
        bathroomType,
        city: city.trim(),
        customFacilities,
        dailyGuestAcRatePaise: acRatePaise,
        dailyGuestNonAcRatePaise: nonAcRatePaise,
        discoveryDescription: description.trim() || null,
        discoveryHeadline: headline.trim() || null,
        discoveryImages: images.map((asset) => ({ publicId: asset.publicId, url: asset.url })),
        // The cover doubles as the legacy single-image field so older readers
        // still see a picture; the gallery is the source of truth.
        discoveryProfileImageUrl: images[0]?.url ?? null,
        electricityIncluded,
        facilities,
        foodIncluded: includedMeals.length > 0,
        includedMeals,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        name: name.trim(),
        noticePeriod,
        pgFor,
        pincode: pincode.trim(),
        preferredFor,
        rentGraceDays: grace,
        rentLateFeePerDayPaise: rupeesToPaise(lateFee),
        standardDepositPaise: depositPaise,
        state: state.trim(),
        type: propertyType,
      }).unwrap();
      unsaved.markSaved();
      dispatch(setSelectedOwnerPropertyId(property.id));
      router.replace("/owner-property");
    } catch {
      setError("Could not register the property. Please check the details and try again.");
    }
  }

  // Every address field follows the pinned point; the owner appends flat /
  // building detail to line 1 afterwards (Swiggy-style flow).
  function applyPickedLocation(result: { latitude: number; longitude: number; address: { street: string | null; locality: string | null; city: string | null; state: string | null; pincode: string | null } | null }) {
    setCoords({ latitude: result.latitude, longitude: result.longitude });
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

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to add listing images.");
      return;
    }
    const remaining = MAX_PROPERTY_IMAGES - images.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    try {
      setUploading(true);
      const uploaded = await uploadAssets(
        result.assets.map((asset, index) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? `Property image ${images.length + index + 1}`,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        "PROPERTY_IMAGE",
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setImages((current) => [...current, ...uploaded].slice(0, MAX_PROPERTY_IMAGES));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the images. Try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  function toggleMeal(meal: MealType) {
    setIncludedMeals((current) => (current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal]));
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {unsaved.dialog}
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="New property"
        title="Register a"
        italicTail="property."
        subtitle="This creates the owner property and its discovery listing together."
      />

      <FormSection eyebrow="Basics" title="Name & location">
        <FormInput autoCapitalize="words" label="Property name" onChangeText={setName} placeholder="e.g. Sunrise Residency" value={name} required />
        <LocationPinCard
          addressSummary={addressSummaryLine(area, city, pincode)}
          coords={coords}
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
        <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} onChangeText={setPincode} placeholder="6 digit pincode" value={pincode} required />
      </FormSection>

      <FormSection eyebrow="Setup" title="Rooms & inclusions">
        <SingleOptionPicker
          label="Property type"
          required
          onChange={setPropertyType}
          options={PROPERTY_TYPES.map((option) => ({ label: humanizeToken(option), value: option }))}
          value={propertyType}
        />

        <OptionGroup label="PG for">
          {PG_FOR_OPTIONS.map((option) => (
            <ChoiceButton active={option === pgFor} key={option} label={humanizeToken(option)} onPress={() => setPgFor(option)} square />
          ))}
        </OptionGroup>

        <OptionGroup label="Preferred for">
          {PREFERRED_TENANT_OPTIONS.map((option) => (
            <ChoiceButton active={option === preferredFor} key={option} label={humanizeToken(option)} onPress={() => setPreferredFor(option)} square />
          ))}
        </OptionGroup>

        <OptionGroup label="Meals included (optional)">
          {MEAL_TYPES.map((meal) => (
            <ChoiceButton active={includedMeals.includes(meal)} key={meal} label={humanizeToken(meal)} onPress={() => toggleMeal(meal)} square />
          ))}
        </OptionGroup>

        <OptionGroup label="Electricity included">
          <ChoiceButton active={electricityIncluded} label="Yes" onPress={() => setElectricityIncluded(true)} square />
          <ChoiceButton active={!electricityIncluded} label="No" onPress={() => setElectricityIncluded(false)} square />
        </OptionGroup>

        <OptionGroup label="Bathroom type">
          {BATHROOM_TYPES.map((option) => (
            <ChoiceButton active={option === bathroomType} key={option} label={humanizeToken(option)} onPress={() => setBathroomType(option)} square />
          ))}
        </OptionGroup>

        <OptionPicker
          emptyLabel="No sharing options selected"
          label="Sharing options"
          required
          onChange={setAvailableSharingTypes}
          options={ROOM_TYPES.map((option) => ({ label: humanizeToken(option), value: option }))}
          title="Sharing options"
          value={availableSharingTypes}
        />

        <FacilitiesField
          customFacilities={customFacilities}
          facilities={facilities}
          onChangeCustom={setCustomFacilities}
          onChangeFacilities={setFacilities}
        />
      </FormSection>

      <FormSection eyebrow="Money" title="Pricing & policy">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Deposit" onChangeText={setDeposit} placeholder="10000" prefix="₹" value={deposit} required />
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
          label="Grace days"
          onChangeText={setGraceDays}
          placeholder={`e.g. 3 — max ${MAX_RENT_GRACE_DAYS}`}
          required
          value={graceDays}
        />
        <FieldHint text={RENT_GRACE_RANGE_HINT} />
        <OptionGroup label="Offers daily stays">
          <ChoiceButton active={offersDailyStays} label="Yes" onPress={() => setOffersDailyStays(true)} square />
          <ChoiceButton active={!offersDailyStays} label="No" onPress={() => setOffersDailyStays(false)} square />
        </OptionGroup>
        {offersDailyStays ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <FormInput keyboardType="decimal-pad" label="Guest AC/day" onChangeText={setAcRate} placeholder="800" prefix="₹" value={acRate} required />
            </View>
            <View style={{ flex: 1 }}>
              <FormInput keyboardType="decimal-pad" label="Guest non-AC/day" onChangeText={setNonAcRate} placeholder="600" prefix="₹" value={nonAcRate} required />
            </View>
          </View>
        ) : null}
      </FormSection>

      <FormSection eyebrow="Photos" title="Listing images" trailing={<UploadRulesInfo max={MAX_PROPERTY_IMAGES} />}>
        <PropertyImageGrid
          busy={uploading}
          max={MAX_PROPERTY_IMAGES}
          onAdd={() => void pickImages()}
          onRemove={(tile) => setImages((current) => current.filter((asset) => asset.publicId !== tile.key))}
          progress={uploadProgress}
          tiles={images.map((asset, index) => ({ cover: index === 0, key: asset.publicId, uri: asset.url }))}
        />
      </FormSection>

      <FormSection eyebrow="Listing" title="Discovery profile">
        <FormInput autoCapitalize="sentences" label="Headline" onChangeText={setHeadline} placeholder="Optional — short listing headline" value={headline} />
        <FormInput label="Description" multiline onChangeText={setDescription} placeholder="Optional — what should prospects know?" value={description} />
      </FormSection>

      </ScreenScrollView>

      {/* Fixed footer, matching the edit-property modal: the submit button
          stays reachable no matter how long the form scrolls. */}
      <PinnedFooter>
        <ActionButton
          disabled={isLoading || uploading}
          label={uploading ? "Uploading images…" : isLoading ? "Registering…" : "Register property"}
          onPress={() => void submit()}
        />
      </PinnedFooter>

      {pickerOpen ? (
        <MapLocationPickerModal
          initial={coords ?? undefined}
          onClose={() => setPickerOpen(false)}
          onPick={applyPickedLocation}
          title="Property location"
        />
      ) : null}
    </View>
  );
}

function FormSection({ children, eyebrow, title, trailing }: { children: ReactNode; eyebrow: string; title: string; trailing?: ReactNode }) {
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

function OptionGroup({ children, label }: { children: ReactNode; label: string }) {
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
