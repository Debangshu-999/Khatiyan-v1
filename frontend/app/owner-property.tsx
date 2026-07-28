import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { BedDouble, Building2, ClipboardList, DoorOpen, EyeOff, FileSignature, Globe, MapPin, Pencil, UsersRound, X } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal, type PickedLocation } from "@/features/geo/map-location-picker";
import { FacilitiesField } from "@/features/owner/facilities-field";
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
  PROPERTY_TYPES,
  BATHROOM_TYPES,
  MEAL_TYPES,
  PG_FOR_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  ROOM_TYPES,
  useListMyPropertiesQuery,
  useUpdatePropertyMutation,
  type BathroomType,
  type MealType,
  type OwnerProperty,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomType,
  type UpdatePropertyPayload,
} from "@/store/services/property-api";
import {
  useGetOwnerDiscoveryProfileQuery,
  usePublishOwnerDiscoveryProfileMutation,
  useUnpublishOwnerDiscoveryProfileMutation,
  useUpdateOwnerDiscoveryProfileMutation,
  type OwnerDiscoveryProfile,
} from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyRoute =
  | "/owner-rooms"
  | "/owner-staff"
  | "/owner-board"
  | "/owner-nearby-places"
  | "/owner-tenancy-agreement"
  | "/owner-exit-policies";

export default function OwnerPropertyScreen() {
  const router = useGuardedRouter();
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
        <SkeletonCard />
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
                {selectedProperty.referenceCode}  /  {humanizeToken(selectedProperty.type)}
              </Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 24, lineHeight: 29 }]} selectable>
                {selectedProperty.name}
              </Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>
                {[selectedProperty.address, selectedProperty.area, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")}
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
              value={selectedProperty.rentLateFeePerDayPaise ? `${formatMoneyPaise(selectedProperty.rentLateFeePerDayPaise)}/d` : "-"}
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

          {selectedProperty.discoveryProfileCreated ? <DiscoveryListingCard propertyId={selectedProperty.id} /> : null}

          <Section eyebrow="Manage" title="Property workspace">
            <ActionCard
              icon={BedDouble}
              meta="Rooms"
              title="Rooms & beds"
              description="Create rooms single or in bulk, edit, set status and manage occupancy."
              onPress={() => open(router, "/owner-rooms")}
            />
            <ActionCard
              icon={UsersRound}
              meta="Staff"
              title="Staff management"
              description="Manage managers, staff categories, employment details and manual salary tracking."
              onPress={() => open(router, "/owner-staff")}
            />
            <ActionCard
              icon={ClipboardList}
              meta="Board"
              title="Property board"
              description="Always-on info for tenants - rules, timings and contacts, organised by category."
              onPress={() => open(router, "/owner-board")}
            />
            <ActionCard
              icon={MapPin}
              meta="Discovery"
              title="Nearby places"
              description="See what tenants find around the property, then curate the landmarks and services."
              onPress={() => open(router, "/owner-nearby-places")}
            />
            <ActionCard
              icon={FileSignature}
              meta="Compliance"
              title="Tenancy agreement"
              description="Choose whether monthly tenancies need an accepted agreement, and author its default terms."
              onPress={() => open(router, "/owner-tenancy-agreement")}
            />
            <ActionCard
              icon={DoorOpen}
              meta="Exit"
              title="Exit policies"
              description="Set the damage-charge schedule and move-out checklist used when a tenancy ends and its deposit is settled."
              onPress={() => open(router, "/owner-exit-policies")}
            />
          </Section>
        </>
      ) : null}

      {editOpen && selectedProperty ? <EditPropertyModal onClose={() => setEditOpen(false)} property={selectedProperty} /> : null}
    </ScreenScrollView>
  );
}

// List/unlist toggle for discovery visibility. Wraps the existing publish /
// unpublish endpoints; unlisting only hides the property from discovery search —
// onboarded tenants and the owner's other workspaces are unaffected.
function DiscoveryListingCard({ propertyId }: { propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const profileQuery = useGetOwnerDiscoveryProfileQuery(propertyId);
  const [publishProfile, publishState] = usePublishOwnerDiscoveryProfileMutation();
  const [unpublishProfile, unpublishState] = useUnpublishOwnerDiscoveryProfileMutation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Shows the target state the moment the switch is flipped; cleared once the
  // refetched profile confirms it (or immediately on failure, snapping back).
  const [optimisticListed, setOptimisticListed] = useState<boolean | null>(null);

  const profile = profileQuery.data;
  const listed = profile?.publicVisible ?? false;
  const loadingProfile = profileQuery.isFetching && !profile;
  const busy = publishState.isLoading || unpublishState.isLoading;
  const displayedListed = optimisticListed ?? listed;

  useEffect(() => {
    if (optimisticListed != null && listed === optimisticListed) {
      setOptimisticListed(null);
    }
  }, [listed, optimisticListed]);

  async function toggleListing() {
    if (busy || loadingProfile) {
      return;
    }
    const next = !listed;
    setOptimisticListed(next);
    try {
      if (next) {
        await publishProfile(propertyId).unwrap();
        toast.success("Property is now listed in discovery.");
      } else {
        await unpublishProfile(propertyId).unwrap();
        toast.success("Property removed from discovery.");
      }
    } catch (error) {
      setOptimisticListed(null);
      const message = (error as { data?: { message?: string } })?.data?.message;
      toast.error(
        message ??
          (next
            ? "Could not list the property. Add a headline and description to its listing details first."
            : "Could not unlist the property. Please try again."),
      );
    }
  }

  return (
    <Section eyebrow="Discovery" title="Listing">
      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: displayedListed ? colors.primarySoft : colors.surfaceSunken,
              borderRadius: 12,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            {displayedListed ? <Globe color={colors.primary} size={20} strokeWidth={2.2} /> : <EyeOff color={colors.muted} size={20} strokeWidth={2.2} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
              {loadingProfile ? "Checking listing…" : displayedListed ? "Listed in discovery" : "Not listed"}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              {displayedListed
                ? "Visible to people searching nearby."
                : "Hidden from discovery search."}
            </Text>
          </View>
          <Switch
            accessibilityLabel={displayedListed ? "Remove from discovery" : "List in discovery"}
            disabled={busy || loadingProfile}
            onValueChange={() => void toggleListing()}
            thumbColor={colors.surface}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            value={displayedListed}
          />
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Listing details
          </Text>
          <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
            {profile?.headline?.trim() || "No headline yet"}
          </Text>
          <Text numberOfLines={3} style={[type.caption, { color: colors.muted }]} selectable>
            {profile?.description?.trim() || "Add a short description so prospects know what makes this property worth a look."}
          </Text>
        </View>

        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={loadingProfile || !profile}
            icon={Pencil}
            label="Edit listing details"
            onPress={() => setDetailsOpen(true)}
            variant="secondary"
          />
        </View>
      </Card>

      {detailsOpen && profile ? (
        <EditListingDetailsSheet onClose={() => setDetailsOpen(false)} profile={profile} propertyId={propertyId} />
      ) : null}
    </Section>
  );
}

function EditListingDetailsSheet({
  onClose,
  profile,
  propertyId,
}: {
  onClose: () => void;
  profile: OwnerDiscoveryProfile;
  propertyId: string;
}) {
  const toast = useToast();
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [description, setDescription] = useState(profile.description ?? "");
  const [headlineError, setHeadlineError] = useState<string | undefined>();
  const [descriptionError, setDescriptionError] = useState<string | undefined>();
  const [updateProfile, { isLoading }] = useUpdateOwnerDiscoveryProfileMutation();

  async function submit() {
    if (isLoading) {
      return;
    }
    const trimmedHeadline = headline.trim();
    const trimmedDescription = description.trim();
    const headlineProblem = !trimmedHeadline ? "Headline is required." : undefined;
    const descriptionProblem = !trimmedDescription ? "Description is required." : undefined;
    setHeadlineError(headlineProblem);
    setDescriptionError(descriptionProblem);
    if (headlineProblem || descriptionProblem) {
      return;
    }
    try {
      await updateProfile({
        propertyId,
        payload: {
          headline: trimmedHeadline,
          description: trimmedDescription,
          // PATCH is a full replace — carry the stored image and contact flags
          // through or they get reset.
          profileImageUrl: profile.profileImageUrl,
          showOwnerContact: profile.showOwnerContact,
          showManagerContact: profile.showManagerContact,
        },
      }).unwrap();
      toast.success("Listing details updated.");
      onClose();
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      toast.error(message ?? "Could not update the listing details. Please try again.");
    }
  }

  return (
    <SheetShell onClose={onClose} title="Edit listing details">
      <FormInput
        error={headlineError}
        label="Headline"
        maxLength={160}
        onChangeText={setHeadline}
        placeholder="Short listing headline"
        value={headline}
      />
      <FormInput
        error={descriptionError}
        label="Description"
        maxLength={1000}
        multiline
        onChangeText={setDescription}
        placeholder="What should prospects know?"
        value={description}
      />
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading} label={isLoading ? "Saving…" : "Save details"} onPress={() => void submit()} />
      </View>
    </SheetShell>
  );
}

function EditPropertyModal({ onClose, property }: { onClose: () => void; property: OwnerProperty }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
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
  const [noticeDays, setNoticeDays] = useState(String(property.noticePeriodDays));
  const [graceDays, setGraceDays] = useState(String(property.rentGraceDays));
  const [lateFee, setLateFee] = useState(paiseToRupees(property.rentLateFeePerDayPaise));
  const [acRate, setAcRate] = useState(paiseToRupees(property.dailyGuestAcRatePaise));
  const [nonAcRate, setNonAcRate] = useState(paiseToRupees(property.dailyGuestNonAcRatePaise));
  const [error, setError] = useState<string | null>(null);
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

  function toggleSharingType(roomType: RoomType) {
    setAvailableSharingTypes((current) => (current.includes(roomType) ? current.filter((item) => item !== roomType) : [...current, roomType]));
  }

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
    const notice = Number(noticeDays);
    const grace = Number(graceDays);
    if (!Number.isInteger(notice) || notice < 0 || !Number.isInteger(grace) || grace < 0) {
      setError("Notice and grace days must be whole numbers.");
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
      noticePeriodDays: notice,
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
      onClose();
    } catch {
      setError("Could not save the property. Please try again.");
    }
  }

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: "94%",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                alignItems: "center",
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.eyebrow, { color: colors.accent }]} selectable>
                  {property.referenceCode}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: "500", letterSpacing: -0.3 }} selectable>
                  Edit property
                </Text>
              </View>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              <ModalSection eyebrow="Basics" title="Name & location">
                <FormInput autoCapitalize="words" label="Property name" onChangeText={setName} placeholder="Property name" value={name} />
                <LocationPinCard
                  addressSummary={addressSummaryLine(area, city, pincode)}
                  coords={latitude != null && longitude != null ? { latitude, longitude } : null}
                  onPress={() => setPickerOpen(true)}
                />
                <FormInput label="Address line 1" multiline onChangeText={setAddress} placeholder="Building, street, landmark" value={address} />
                <FormInput autoCapitalize="words" label="Address line 2 / Area" onChangeText={setArea} placeholder="Area or locality" value={area} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="City" onChangeText={setCity} placeholder="City" value={city} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput autoCapitalize="words" label="State" onChangeText={setState} placeholder="State" value={state} />
                  </View>
                </View>
                <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} onChangeText={setPincode} placeholder="Pincode" value={pincode} />
              </ModalSection>

              <ModalSection eyebrow="Setup" title="Rooms & inclusions">
                <Labeled label="Property type">
                  {PROPERTY_TYPES.map((option) => (
                    <ChoiceButton active={option === propertyType} key={option} label={humanizeToken(option)} onPress={() => setPropertyType(option)} />
                  ))}
                </Labeled>

                <Labeled label="PG for">
                  {PG_FOR_OPTIONS.map((option) => (
                    <ChoiceButton active={option === pgFor} key={option} label={humanizeToken(option)} onPress={() => setPgFor(option)} />
                  ))}
                </Labeled>

                <Labeled label="Preferred for">
                  {PREFERRED_TENANT_OPTIONS.map((option) => (
                    <ChoiceButton active={option === preferredFor} key={option} label={humanizeToken(option)} onPress={() => setPreferredFor(option)} />
                  ))}
                </Labeled>

                <Labeled label="Meals included">
                  {MEAL_TYPES.map((meal) => (
                    <ChoiceButton active={includedMeals.includes(meal)} key={meal} label={humanizeToken(meal)} onPress={() => toggleMeal(meal)} />
                  ))}
                </Labeled>

                <Labeled label="Electricity included">
                  <ChoiceButton active={electricityIncluded} label="Yes" onPress={() => setElectricityIncluded(true)} />
                  <ChoiceButton active={!electricityIncluded} label="No" onPress={() => setElectricityIncluded(false)} />
                </Labeled>

                <Labeled label="Bathroom type">
                  {BATHROOM_TYPES.map((option) => (
                    <ChoiceButton active={option === bathroomType} key={option} label={humanizeToken(option)} onPress={() => setBathroomType(option)} />
                  ))}
                </Labeled>

                <Labeled label="Available sharing types">
                  {ROOM_TYPES.map((option) => (
                    <ChoiceButton active={availableSharingTypes.includes(option)} key={option} label={humanizeToken(option)} onPress={() => toggleSharingType(option)} />
                  ))}
                </Labeled>

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
                    <FormInput keyboardType="decimal-pad" label="Std. deposit" onChangeText={setDeposit} placeholder="Amount" prefix="₹" value={deposit} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Late fee/day" onChangeText={setLateFee} placeholder="Optional" prefix="₹" value={lateFee} />
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
                    <FormInput keyboardType="decimal-pad" label="Guest AC/day" onChangeText={setAcRate} placeholder="Optional" prefix="₹" value={acRate} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput keyboardType="decimal-pad" label="Guest non-AC/day" onChangeText={setNonAcRate} placeholder="Optional" prefix="₹" value={nonAcRate} />
                  </View>
                </View>
              </ModalSection>

              {error ? (
                <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 14, padding: spacing.md }}>
                  <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
                    {error}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View
              style={{
                borderTopColor: colors.border,
                borderTopWidth: 1,
                flexDirection: "row",
                paddingBottom: Math.max(insets.bottom, spacing.md),
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              }}
            >
              <ActionButton disabled={isLoading} label={isLoading ? "Saving..." : "Save property"} onPress={() => void submit()} />
            </View>
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
    </Modal>
  );
}

function ModalSection({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.accent }]} selectable>
          {eyebrow}
        </Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "500", letterSpacing: -0.3 }} selectable>
          {title}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </Card>
  );
}

function Labeled({ children, label }: { children: ReactNode; label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.label, { color: colors.inkSoft }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{children}</View>
    </View>
  );
}

function open(router: ReturnType<typeof useGuardedRouter>, route: PropertyRoute) {
  router.push(route);
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
