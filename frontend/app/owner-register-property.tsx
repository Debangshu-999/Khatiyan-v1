import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { WizardHeader } from "@/components/wizard-header";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FieldHint } from "@/components/field-hint";
import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal } from "@/features/geo/map-location-picker";
import { FacilitiesField } from "@/features/owner/facilities-field";
import {
  ROOM_TYPE_INTRO,
  RoomTypeBoard,
  removalMessage,
  removalTitle,
  type RoomTypeEntry,
} from "@/features/property/room-type-board";
import { RoomTypeSheet } from "@/features/property/room-type-sheet";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useToast } from "@/components/toast";
import { AddPhotoTarget, PhotoRow, UploadProgress } from "@/features/property/photo-list";
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
  useCreateRoomMoldMutation,
  type BathroomType,
  type MealType,
  type NoticePeriod,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomConditioning,
  type RoomType,
} from "@/store/services/property-api";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Mirrors the backend cap on discovery.property_images. */
const MAX_PROPERTY_IMAGES = 10;
/** Mirrors Property.MIN_NOTICE_PERIOD_DAYS. */

/** Every field the submit check can point at. */
type FormField =
  | "acRate"
  | "address"
  | "area"
  | "city"
  | "deposit"
  | "facilities"
  | "graceDays"
  | "images"
  | "name"
  | "nonAcRate"
  | "pincode"
  | "sharing"
  | "state"
  | "types";

/**
 * The form in the order somebody fills it: what the place is, what it offers,
 * what it costs, what it looks like, and how it is listed.
 *
 * <p>Named rather than numbered so the steps can be reordered without every
 * comparison silently changing meaning.
 */
type EditingType = { conditioning: RoomConditioning; entry: RoomTypeEntry | null; sharingType: RoomType };

/** Beds implied by the sharing type. Null means the owner said, on the draft. */
const FIXED_BEDS: Partial<Record<RoomType, number>> = {
  DOUBLE: 2,
  FOUR_SHARING: 4,
  SINGLE: 1,
  TRIPLE: 3,
};

type RegisterStep = "basics" | "rooms" | "types" | "pricing" | "images" | "listing";

const REGISTER_STEPS: RegisterStep[] = ["basics", "rooms", "types", "pricing", "images", "listing"];

export default function OwnerRegisterPropertyScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const form = useFormErrors<FormField>();
  const [step, setStep] = useState<RegisterStep>("basics");

  /**
   * The room types, held here until there is a property to hang them on.
   *
   * <p>A mold is created at `/properties/{id}/room-molds`, and that id does not
   * exist until this form is submitted — so the step that collects them cannot
   * save as it goes. They are drafts with local ids, written to the server
   * immediately after the property is created.
   */
  const [roomTypes, setRoomTypes] = useState<RoomTypeEntry[]>([]);
  const [editingType, setEditingType] = useState<EditingType | null>(null);
  const [removingType, setRemovingType] = useState<RoomTypeEntry | null>(null);

  /**
   * The room types error clears itself.
   *
   * <p>Every other field error on this form sits directly under the input that
   * caused it and stays until that input is corrected, which is what makes it
   * useful. This one has no input: it is about a board of cards above it, and
   * once read there is nothing left for it to point at — so it stood there red
   * while the owner filled the very thing it was asking for.
   *
   * <p>Clearing it also releases the submit gate, so Continue works again and
   * simply says it a second time if the types are still missing.
   */
  const typesError = form.errors.types;
  useEffect(() => {
    if (!typesError) {
      return;
    }
    const timer = setTimeout(() => form.clearField("types"), 4500);
    return () => clearTimeout(timer);
  }, [form.clearField, typesError]);

  const stepIndex = REGISTER_STEPS.indexOf(step);
  const previousStep = stepIndex > 0 ? REGISTER_STEPS[stepIndex - 1] : null;
  const lastStep = stepIndex === REGISTER_STEPS.length - 1;

  /**
   * Validates only the step being left.
   *
   * <p>The whole form used to be checked on submit, which on a five-step wizard
   * would mean reaching the last screen to be told the first one is wrong. Each
   * step answers for its own fields; submit re-runs the lot as a backstop.
   */
  function advance() {
    if (!form.validate(problemsIn(step))) {
      return;
    }
    if (lastStep) {
      void submit();
      return;
    }
    setStep(REGISTER_STEPS[stepIndex + 1]);
  }

  /** What is wrong on one step, keyed to the field that has to change. */
  function problemsIn(which: RegisterStep): Partial<Record<FormField, string>> {
    if (which === "basics") {
      return {
        ...(name.trim() ? {} : { name: "Enter the property name." }),
        ...(address.trim() ? {} : { address: "Enter address line 1." }),
        ...(area.trim() ? {} : { area: "Enter the area or locality." }),
        ...(city.trim() ? {} : { city: "Enter the city." }),
        ...(state.trim() ? {} : { state: "Enter the state." }),
        ...(pincode.trim() ? {} : { pincode: "Enter the pincode." }),
      };
    }

    if (which === "rooms") {
      return {
        ...(availableSharingTypes.length ? {} : { sharing: "Choose at least one occupancy." }),
        ...(facilities.length || customFacilities.length ? {} : { facilities: "Add at least one facility." }),
      };
    }

    if (which === "types") {
      // One per occupancy, not one in total. An occupancy with no type behind it
      // is a claim the property cannot honour: no room of that size can be
      // created, so it is offered in the listing and unbuildable in the app.
      const missing = availableSharingTypes.filter(
        (occupancy) => !roomTypes.some((entry) => entry.sharingType === occupancy),
      );
      if (!missing.length) {
        return {};
      }
      const named = missing.map((occupancy) => humanizeToken(occupancy).toLowerCase()).join(", ");
      return {
        types:
          missing.length === availableSharingTypes.length
            ? "Create at least one room type for each occupancy."
            : `Still needs a room type: ${named}.`,
      };
    }

    if (which === "pricing") {
      const found: Partial<Record<FormField, string>> = {
        ...(rupeesToPaise(deposit) == null ? { deposit: "Enter the standard deposit amount." } : {}),
      };
      const grace = Number(graceDays);
      if (!graceDays.trim()) {
        found.graceDays = "Enter the rent grace days.";
      } else if (!Number.isInteger(grace)) {
        found.graceDays = "Grace days must be a whole number.";
      } else if (grace < MIN_RENT_GRACE_DAYS || grace > MAX_RENT_GRACE_DAYS) {
        found.graceDays = `Grace days must be between ${MIN_RENT_GRACE_DAYS} and ${MAX_RENT_GRACE_DAYS}.`;
      }
      if (offersDailyStays && rupeesToPaise(acRate) == null) {
        found.acRate = "Enter the AC rate, or turn daily stays off.";
      }
      if (offersDailyStays && rupeesToPaise(nonAcRate) == null) {
        found.nonAcRate = "Enter the non-AC rate, or turn daily stays off.";
      }
      return found;
    }

    if (which === "images") {
      return images.length ? {} : { images: "Add at least one listing image." };
    }

    // The discovery profile is optional throughout — headline and description
    // are the only fields on it and both may be blank.
    return {};
  }
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
  const [createProperty, { isLoading }] = useCreatePropertyMutation();
  const [createRoomMold] = useCreateRoomMoldMutation();
  const toast = useToast();
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
    const depositPaise = rupeesToPaise(deposit);
    const grace = Number(graceDays);
    const acRatePaise = offersDailyStays ? rupeesToPaise(acRate) : null;
    const nonAcRatePaise = offersDailyStays ? rupeesToPaise(nonAcRate) : null;

    // Every problem at once, each one keyed to the field that has to change.
    // Reporting them one at a time turns a half-filled form into a queue of
    // round trips to the submit button.
    const found: Partial<Record<FormField, string>> = {
      ...(name.trim() ? {} : { name: "Enter the property name." }),
      ...(address.trim() ? {} : { address: "Enter address line 1." }),
      ...(area.trim() ? {} : { area: "Enter the area or locality." }),
      ...(city.trim() ? {} : { city: "Enter the city." }),
      ...(state.trim() ? {} : { state: "Enter the state." }),
      ...(pincode.trim() ? {} : { pincode: "Enter the pincode." }),
      ...(availableSharingTypes.length ? {} : { sharing: "Choose at least one sharing option." }),
      ...(facilities.length || customFacilities.length ? {} : { facilities: "Add at least one facility." }),
      ...(depositPaise == null ? { deposit: "Enter the standard deposit amount." } : {}),
      ...(images.length ? {} : { images: "Add at least one listing image." }),
    };
    if (!graceDays.trim()) {
      found.graceDays = "Enter the rent grace days.";
    } else if (!Number.isInteger(grace)) {
      found.graceDays = "Grace days must be a whole number.";
    } else if (grace < MIN_RENT_GRACE_DAYS || grace > MAX_RENT_GRACE_DAYS) {
      found.graceDays = `Grace days must be between ${MIN_RENT_GRACE_DAYS} and ${MAX_RENT_GRACE_DAYS}.`;
    }
    if (offersDailyStays && acRatePaise == null) {
      found.acRate = "Enter the AC rate, or turn daily stays off.";
    }
    if (offersDailyStays && nonAcRatePaise == null) {
      found.nonAcRate = "Enter the non-AC rate, or turn daily stays off.";
    }
    // The deposit re-check is the type narrowing the validate map cannot express.
    if (!form.validate(found) || depositPaise == null) {
      return;
    }

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

      // The room types could not be saved until now — there was no property id
      // to hang them on. Sequential, not Promise.all: the server keys a mold on
      // its shape, and firing them together turns one duplicate into a race
      // over which of the two survives.
      const failed: string[] = [];
      for (const draft of roomTypes) {
        try {
          await createRoomMold({
            payload: {
              amenities: draft.amenities,
              baseRentPaise: draft.baseRentPaise,
              bedCount: draft.sharingType === "DORMITORY" ? draft.bedCount : null,
              conditioning: draft.conditioning,
              customAmenities: draft.customAmenities,
              // Already on Cloudinary: they were uploaded as they were picked,
              // which is what let the wizard collect them with no property yet.
              images: draft.images,
              sharingType: draft.sharingType,
            },
            propertyId: property.id,
          }).unwrap();
        } catch {
          failed.push(removalTitle(draft).replace(/^Remove /, "").replace(/\?$/, ""));
        }
      }

      // The property exists either way, so this is never a failed registration
      // — it is a registration with types missing. Both paths land on the room
      // types screen, which reads the server and shows exactly what is there.
      if (failed.length) {
        toast.warning(`Property registered. Could not save: ${failed.join(", ")}. Add them here.`);
      } else {
        toast.ok("Property registered.");
      }
      router.replace({ params: { propertyId: property.id }, pathname: "/owner-room-types" });
    } catch (caught) {
      form.failFromServer(
        errorMessage(caught) || "Could not register the property. Please check the details and try again.",
      );
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
      form.failFromServer("Allow photo library access to add listing images.");
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
      form.failFromServer(uploadError instanceof Error ? uploadError.message : "Could not upload the images. Try again.");
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
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }} surface={colors.formSurface}>
      <WizardHeader
        accentWord="property"
        onBack={previousStep ? () => setStep(previousStep) : undefined}
        // Plain back. useUnsavedChanges intercepts it and asks when there is
        // something to lose — a dialog here as well would ask twice, and would
        // ask on a step the person had not typed anything into.
        onClose={() => router.back()}
        step={stepIndex}
        title="Register a"
        totalSteps={REGISTER_STEPS.length}
      />

      {step === "basics" ? (
      <FormSection eyebrow="Basics" title="Name & location">
        <FormInput autoCapitalize="words" label="Property name" error={form.errors.name} onChangeText={(next) => { setName(next); form.clearField("name"); }} placeholder="e.g. Sunrise Residency" value={name} required />
        <LocationPinCard
          addressSummary={addressSummaryLine(area, city, pincode)}
          coords={coords}
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
        <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} error={form.errors.pincode} onChangeText={(next) => { setPincode(next); form.clearField("pincode"); }} placeholder="6 digit pincode" value={pincode} required />
      </FormSection>

      ) : null}

      {step === "rooms" ? (
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
          emptyLabel="No sharing types selected"
          error={form.errors.sharing}
          label="Available sharing types"
          required
          onChange={(next) => {
            setAvailableSharingTypes(next);
            // Untick an occupancy and its types go with it. The board only
            // shows tabs for occupancies on offer, so a draft left behind here
            // would be invisible and still get POSTed after registration.
            setRoomTypes((current) => current.filter((entry) => next.includes(entry.sharingType)));
            form.clearField("sharing");
          }}
          options={ROOM_TYPES.map((option) => ({ label: humanizeToken(option), value: option }))}
          title="Choose occupancies"
          value={availableSharingTypes}
        />

        <View style={{ gap: 6 }}>
          <FacilitiesField
            customFacilities={customFacilities}
            facilities={facilities}
            onChangeCustom={(next) => {
              setCustomFacilities(next);
              form.clearField("facilities");
            }}
            onChangeFacilities={(next) => {
              setFacilities(next);
              form.clearField("facilities");
            }}
          />
          <FieldError message={form.errors.facilities} />
        </View>
      </FormSection>

      ) : null}

      {step === "types" ? (
      <FormSection eyebrow="Setup" title="Room types">
        <View style={{ gap: 4 }}>
          {ROOM_TYPE_INTRO.map((line) => (
            <Text key={line} style={[type.body, { color: colors.muted }]}>
              {"• "}
              {line}
            </Text>
          ))}
        </View>

        <RoomTypeBoard
          entries={roomTypes}
          occupancies={availableSharingTypes}
          onCreate={(sharingType, conditioning) => setEditingType({ conditioning, entry: null, sharingType })}
          onEdit={(entry) => setEditingType({ conditioning: entry.conditioning, entry, sharingType: entry.sharingType })}
          onRemove={setRemovingType}
        />

        <FieldError message={form.errors.types} />
      </FormSection>
      ) : null}

      {step === "pricing" ? (
      <FormSection eyebrow="Money" title="Pricing & policy">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Deposit" error={form.errors.deposit} onChangeText={(next) => { setDeposit(next); form.clearField("deposit"); }} placeholder="10000" prefix="₹" value={deposit} required />
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
          error={form.errors.graceDays} onChangeText={(next) => { setGraceDays(next); form.clearField("graceDays"); }}
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
              <FormInput keyboardType="decimal-pad" label="Guest AC/day" error={form.errors.acRate} onChangeText={(next) => { setAcRate(next); form.clearField("acRate"); }} placeholder="800" prefix="₹" value={acRate} required />
            </View>
            <View style={{ flex: 1 }}>
              <FormInput keyboardType="decimal-pad" label="Guest non-AC/day" error={form.errors.nonAcRate} onChangeText={(next) => { setNonAcRate(next); form.clearField("nonAcRate"); }} placeholder="600" prefix="₹" value={nonAcRate} required />
            </View>
          </View>
        ) : null}
      </FormSection>

      ) : null}

      {step === "images" ? (
      <FormSection eyebrow="Photos" title="Listing images" trailing={<UploadRulesInfo max={MAX_PROPERTY_IMAGES} />}>
        {images.length < MAX_PROPERTY_IMAGES ? (
          <AddPhotoTarget busy={uploading} onPress={() => void pickImages()} />
        ) : null}

        <UploadProgress progress={uploadProgress} />

        <View style={{ gap: spacing.xs }}>
          {images.map((asset, index) => (
            <PhotoRow
              busy={uploading}
              cover={index === 0}
              key={asset.publicId}
              muted
              // No pencil: the create endpoint takes a URL and an id, so a
              // caption written here would have nowhere to be saved. They are
              // added from the property once it exists.
              onMakeCover={() =>
                setImages((current) => [current[index], ...current.filter((_, at) => at !== index)])
              }
              onRemove={() => setImages((current) => current.filter((entry) => entry.publicId !== asset.publicId))}
              title={index === 0 ? "Cover photo" : `Photo ${index + 1}`}
              uri={asset.url}
            />
          ))}
        </View>
        <FieldError message={form.errors.images} />
      </FormSection>

      ) : null}

      {step === "listing" ? (
      <FormSection eyebrow="Listing" title="Discovery profile">
        <FormInput autoCapitalize="sentences" label="Headline" onChangeText={setHeadline} placeholder="Optional — short listing headline" value={headline} />
        <FormInput label="Description" multiline onChangeText={setDescription} placeholder="Optional — what should prospects know?" value={description} />
      </FormSection>
      ) : null}

      </ScreenScrollView>

      {/* Fixed footer, matching the edit-property modal: the submit button
          stays reachable no matter how long the form scrolls. */}
      <PinnedFooter>
        <ActionButton
          disabled={isLoading || uploading || form.blocked}
          label={
            uploading
              ? "Uploading images…"
              : isLoading
                ? "Registering…"
                : lastStep
                  ? "Register property"
                  : "Continue"
          }
          onPress={advance}
        />
      </PinnedFooter>

      {editingType ? (
        <RoomTypeSheet
          conditioning={editingType.conditioning}
          entry={editingType.entry}
          onClose={() => setEditingType(null)}
          onSave={(payload) => {
            const edited = editingType.entry;
            setRoomTypes((current) => {
              const draft: RoomTypeEntry = {
                ...payload,
                images: payload.images,
                // The server resolves a null bed count from the sharing type;
                // the board has to show a number now, so resolve it here too.
                bedCount: payload.bedCount ?? FIXED_BEDS[payload.sharingType] ?? 0,
                id: edited?.id ?? `draft-${Date.now()}`,
                roomCount: 0,
              };
              return edited
                ? current.map((entry) => (entry.id === edited.id ? draft : entry))
                : [...current, draft];
            });
            form.clearField("types");
            setEditingType(null);
          }}
          sharingType={editingType.sharingType}
          siblingRentPaise={
            roomTypes.find(
              (entry) =>
                entry.sharingType === editingType.sharingType &&
                entry.conditioning !== editingType.conditioning &&
                (editingType.entry == null || entry.bedCount === editingType.entry.bedCount),
            )?.baseRentPaise ?? null
          }
          takenBedCounts={roomTypes
            .filter(
              (entry) =>
                entry.sharingType === editingType.sharingType &&
                entry.conditioning === editingType.conditioning &&
                entry.id !== editingType.entry?.id,
            )
            .map((entry) => entry.bedCount)}
        />
      ) : null}

      {removingType ? (
        <ConfirmDeleteDialog
          confirmLabel="Remove"
          message={removalMessage(removingType)}
          onCancel={() => setRemovingType(null)}
          onConfirm={() => {
            setRoomTypes((current) => current.filter((entry) => entry.id !== removingType.id));
            setRemovingType(null);
          }}
          title={removalTitle(removingType)}
        />
      ) : null}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}

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

/**
 * One step's worth of form: a heading and its fields, straight on the page.
 *
 * <p>No card. A step holds exactly one of these, so the card was never
 * separating it from anything — all it did was take an 18pt gutter of its own
 * on top of the scroll view's, which the fields inside then gave up again,
 * leaving the inputs visibly narrower than the button under them. Dropping the
 * surface is what widens them.
 *
 * <p>The fields keep their own white fill and hairline, so they are still the
 * surfaces — which is what makes them look like the things you fill in.
 */
/**
 * One step's worth of form, on its own white card.
 *
 * <p>The card is what makes a section a section: on the page ground it defines
 * where one group of fields ends and the next begins, and it gives the white
 * fields inside it something other than the page to sit on.
 */
function FormSection({ children, eyebrow, title, trailing }: { children: ReactNode; eyebrow: string; title: string; trailing?: ReactNode }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
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
    </View>
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
