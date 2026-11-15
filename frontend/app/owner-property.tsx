import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { cardShadow } from "@/theme/shadows";
import { PropertyNameCard } from "@/components/property-name-card";
import { SheetCloseButton } from "@/components/help-modal-header";
import { ModalTitle } from "@/components/modal-title";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { IconSwitch } from "@/components/icon-switch";
import { ratingColor } from "@/features/food/meal-rating-tone";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, EyeOff, Globe, Pencil, UserRoundPlus } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { PropertyArtwork } from "@/components/artwork-icon";
import { PropertyIcon } from "@/components/property-icon";
import { ActionCard } from "@/components/action-card";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Card } from "@/components/card";
import { HighlightPanel } from "@/components/highlight-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { ModalTitleRule } from "@/components/modal-title-rule";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ScreenHeader } from "@/components/screen-header";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import {
  OwnerDataCardSkeleton,
  OwnerMetricTileSkeleton,
  OwnerPropertyOverviewSkeleton,
} from "@/components/skeletons/owner";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { PropertyContactsSection } from "@/features/property/property-contacts-section";
import {
  BookingsIcon,
  EnquiriesIcon,
  FacilitiesIcon,
  ItemCatalogueIcon,
  DamagesIcon,
  ManageListingIcon,
  NearbyLocationsIcon,
  PropertyBoardIcon,
  PropertyVisitsIcon,
  RoomsAndBedsIcon,
} from "@/features/property/property-control-icons";
import { FacilityOverviewGrid } from "@/features/property/facility-overview-grid";
import { ActionButton, FormInput, formatDepositPaise, formatMoneyPaise, humanizeToken, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  useListMyPropertiesQuery,
  useUpdatePropertyMutation,
  NOTICE_PERIOD_LABELS,
  useListPropertyRoomsQuery,
  type OwnerProperty,
  type OwnerRoom,
} from "@/store/services/property-api";
import { useGetOpenEnquiryCountQuery } from "@/store/services/enquiry-api";
import {
  useGetOwnerDiscoveryProfileQuery,
  usePublishOwnerDiscoveryProfileMutation,
  useUnpublishOwnerDiscoveryProfileMutation,
  useUpdateOwnerDiscoveryProfileMutation,
  type OwnerDiscoveryProfile,
} from "@/store/services/discovery-api";
import { spacing, radii } from "@/theme/spacing";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

type PropertyRoute =
  | "/owner-manage-listing"
  | "/owner-enquiries"
  | "/owner-bookings"
  | "/owner-rooms"
  | "/owner-staff"
  | "/owner-board"
  | "/owner-food"
  | "/owner-nearby-places"
  | "/owner-property-visits"
  | "/owner-exit-policies"
  | "/owner-damages";

export default function OwnerPropertyScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const [facilitiesOpen, setFacilitiesOpen] = useState(false);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  // Editing the property and its listing is PROPERTY_SETTINGS at MANAGE.
  const { canManage: canManageResource, isReady: permissionsReady, owner: isPropertyOwner } = usePropertyPermissions(selectedProperty?.id);
  const canManageSettings = canManageResource("PROPERTY_SETTINGS");

  // "Rent from" is the cheapest bed a prospective tenant could take, which is
  // the number the discovery listing advertises. Computed here from the rooms
  // rather than stored on the property, so it cannot go stale when a room is
  // repriced or deactivated.
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? skipToken);
  const startingRentPaise = lowestActiveRoomRentPaise(roomsQuery.data ?? []);
  const roomsLoading = roomsQuery.isFetching && !roomsQuery.data;
  const openEnquiryCountQuery = useGetOpenEnquiryCountQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty,
  });
  const openEnquiryCount = openEnquiryCountQuery.data ?? 0;

  const loadFailed = loadFailure(propertiesQuery, roomsQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={selectedProperty && !canManageSettings ? <ViewOnlyChip /> : null}
        italicTail="control."
        subtitle={selectedProperty ? `Property workspace for ${selectedProperty.name}.` : "Select a property on Home first."}
        title="Property"
      />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <OwnerPropertyOverviewSkeleton />
      ) : null}

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={PropertyIcon}

          title="No active property selected"
          description="Choose the property you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          {/* One card (user, 2026-11-14): the property's name on the Home property
              card's face, joined to its details under it. One border round the whole
              (user, 2026-11-15): the details are a plain panel, not a second card with
              its own corners and shadow sitting over the first. */}
          <View style={{ borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, marginTop: -spacing.xs, overflow: "hidden", ...cardShadow(colors.shadow) }}>
          <PropertyNameCard joined name={selectedProperty.name} />
          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <HighlightPanel variant="property" style={{ borderRadius: 0, borderWidth: 0, padding: spacing.lg, paddingTop: spacing.md }}>
            {/* The property mark beside its own name, as on the Home selector.
                This card IS the property; every other card on the screen is a
                part of it, and the glyph is what says which is which. */}
            <View style={{ gap: spacing.xs }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={[type.eyebrow, { color: colors.inkSoft }]}>{selectedProperty.referenceCode}</Text>
                </View>
                <View style={{ backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={[type.caption, { color: colors.accent }]}>{humanizeToken(selectedProperty.type)}</Text>
                </View>
              </View>
              {/* The address close beside its pin (user, 2026-11-15). */}
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xxs }}>
                <View style={{ alignItems: "center", width: 22, paddingTop: 2 }}>
                  <Svg width={21} height={24} viewBox="0 0 24 24" accessible={false}>
                    <Path fill={colors.danger} d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8Z" />
                    <Circle cx={12} cy={10} r={3} fill="#FFFFFF" />
                  </Svg>
                </View>
                <Text style={[type.body, { color: colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 }]}>
                  {[selectedProperty.address, selectedProperty.area, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row" }}>
              <ActionButton borderColor={canManageSettings ? colors.ink : colors.borderStrong} disabled={!canManageSettings} icon={Pencil} label="Edit property" onPress={() => router.push("/owner-edit-property")} variant="neutral" />
            </View>
          </HighlightPanel>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {roomsLoading ? (
              <OwnerMetricTileSkeleton />
            ) : (
              <MetricTile
                iconPlacement="side"
                label="Rent from"
                value={startingRentPaise == null ? "No rooms yet" : formatMoneyPaise(startingRentPaise)}
                hint="Lowest room"
                tone="primary"
              />
            )}
            <MetricTile iconPlacement="side" label="Deposit" value={formatDepositPaise(selectedProperty.standardDepositPaise)} hint="Standard" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              iconPlacement="side"
              label="Notice"
              value={NOTICE_PERIOD_LABELS[selectedProperty.noticePeriod]}
              hint="Notice period"
            />
            <MetricTile
              iconPlacement="side"
              label="Grace"
              value={selectedProperty.rentGraceDays > 0 ? `${selectedProperty.rentGraceDays}d` : "None"}
              hint="Rent grace"
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              iconPlacement="side"
              label="Late fee"
              value={selectedProperty.rentLateFeePerDayPaise ? `${formatMoneyPaise(selectedProperty.rentLateFeePerDayPaise)}/day` : "None"}
              hint="After due date"
            />
            {roomsLoading ? (
              <OwnerMetricTileSkeleton />
            ) : (
              <MetricTile
                iconPlacement="side"
                label="Rooms"
                value={String((roomsQuery.data ?? []).filter((room) => room.active).length)}
                hint="Active"
              />
            )}
          </View>

          {selectedProperty.facilities.length || selectedProperty.customFacilities.length ? (
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="View facilities" onPress={() => setFacilitiesOpen(true)}>
              <Card>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                  <FacilitiesIcon size={36} />
                  <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 17, lineHeight: 23 }]}>View facilities</Text>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.neutralSoft,
                      borderRadius: 999,
                      height: 32,
                      justifyContent: "center",
                      width: 32,
                    }}
                  >
                    <ChevronRight color={colors.ink} size={18} />
                  </View>
                </View>
              </Card>
            </AnimatedPressable>
          ) : null}

          <Section title="Property workspace">
            <ActionCard
              borderRadius={12}
              icon={ManageListingIcon}
              iconSize={48}
              showArrow={false}
              title="Manage listing"
              description="Control discovery visibility, listing details and the contacts prospects can use."
              onPress={() => open(router, "/owner-manage-listing")}
            />
            <ActionCard
              borderRadius={12}
              icon={RoomsAndBedsIcon}
              iconSize={48}
              showArrow={false}
              title="Rooms & beds"
              description="Create rooms single or in bulk, edit, set status and manage occupancy."
              onPress={() => open(router, "/owner-rooms")}
            />
            {/* Room types and move-in checklists pick from this catalogue;
                settlement charges use its damage levels. */}
            <ActionCard
              borderRadius={12}
              icon={ItemCatalogueIcon}
              iconSize={48}
              showArrow={false}
              title="Item catalogue & Damages"
              description="Everything a room can have, and what each damage level costs."
              onPress={() => open(router, "/owner-exit-policies")}
            />
            {/* Damage found in the rooms, charged to their tenants, and repaired (user, 2026-10-29). */}
            <ActionCard
              borderRadius={12}
              icon={DamagesIcon}
              iconSize={48}
              showArrow={false}
              title="Damages & Repairs"
              description="Record damage to a room's items, bill it to the tenant, and mark it repaired or replaced."
              onPress={() => open(router, "/owner-damages")}
            />
            <ActionCard
              borderRadius={12}
              icon={PropertyBoardIcon}
              iconSize={48}
              showArrow={false}
              title="Property board"
              description="Always-on info for tenants - rules, timings and contacts, organised by category."
              onPress={() => open(router, "/owner-board")}
            />
            <ActionCard
              borderRadius={12}
              icon={NearbyLocationsIcon}
              iconSize={48}
              showArrow={false}
              title="Nearby locations"
              description="See what tenants find around the property, then curate the landmarks and services."
              onPress={() => open(router, "/owner-nearby-places")}
            />
            {permissionsReady && isPropertyOwner ? (
              <ActionCard
                borderRadius={12}
                icon={BookingsIcon}
                iconSize={48}
                showArrow={false}
                title="Bookings"
                description="Review post-visit requests and set the terms and team who handle them."
                onPress={() => open(router, "/owner-bookings")}
              />
            ) : null}
            <ActionCard
              badge={openEnquiryCount}
              borderRadius={12}
              icon={EnquiriesIcon}
              iconSize={48}
              showArrow={false}
              title="Enquiries"
              description="Review questions from interested people and respond from the property enquiry inbox."
              onPress={() => open(router, "/owner-enquiries")}
            />
            <ActionCard
              borderRadius={12}
              icon={PropertyVisitsIcon}
              iconSize={48}
              showArrow={false}
              title="Visiting Hours"
              description="Set the time slots, day by day, when tenants can book a visit to the property."
              onPress={() => open(router, "/owner-property-visits")}
            />
          </Section>

        </>
      ) : null}

      {facilitiesOpen && selectedProperty ? (
        <BottomSheetModal navigationBarTranslucent statusBarTranslucent onRequestClose={() => setFacilitiesOpen(false)}>
          {(dismiss) => (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <SheetCloseButton onClose={() => dismiss()} />
              <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, gap: spacing.md, maxHeight: "100%" }}>
                {/* Held at full height: the web title shrinks with a long list under it and was cut in half (2026-11-07). */}
                <View style={{ alignItems: "center", flexShrink: 0 }}>
                  <ModalTitle style={[type.display, { color: colors.ink, fontSize: 22, textAlign: "center" }]}>Facilities</ModalTitle>
                </View>
                <ModalTitleRule />
                <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1, width: "100%" }} contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: spacing.md }}>
                  <FacilityOverviewGrid variant="cards" collapsible={false} facilities={[...selectedProperty.facilities, ...selectedProperty.customFacilities]} />
                </ScrollView>
              </View>
            </View>
          )}
        </BottomSheetModal>
      ) : null}
    </ScreenScrollView>
  );
}

// List/unlist toggle for discovery visibility. Wraps the existing publish /
// unpublish endpoints; unlisting only hides the property from discovery search —
// onboarded tenants and the owner's other workspaces are unaffected.
/** A small blue-bordered button for a section heading's right (user, 2026-11-07). */
function HeaderAction({ disabled, icon: Icon, label, onPress }: {
  disabled?: boolean;
  icon: typeof Pencil;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.primary,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        opacity: disabled ? 0.5 : 1,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 6,
      }}
    >
      <Icon color={colors.primary} size={15} strokeWidth={2.3} />
      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
  );
}

export function DiscoveryListingCard({ canManage, propertyId }: { canManage: boolean; propertyId: string }) {
  // Server refusal — nothing on screen to correct, so it interrupts.
  const listErrors = useFormErrors<never>();

  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const profileQuery = useGetOwnerDiscoveryProfileQuery(propertyId);
  const [publishProfile, publishState] = usePublishOwnerDiscoveryProfileMutation();
  const [unpublishProfile, unpublishState] = useUnpublishOwnerDiscoveryProfileMutation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The add-manager picker, opened from the Property contacts heading.
  const [contactPicker, setContactPicker] = useState(false);
  // Shows the target state the moment the switch is flipped; cleared once the
  // refetched profile confirms it (or immediately on failure, snapping back).
  const [optimisticListed, setOptimisticListed] = useState<boolean | null>(null);
  const [updateMealRating, updateMealRatingState] = useUpdateOwnerDiscoveryProfileMutation();
  const [optimisticMealRating, setOptimisticMealRating] = useState<boolean | null>(null);

  const profile = profileQuery.data;
  const listed = profile?.publicVisible ?? false;
  const loadingProfile = profileQuery.isFetching && !profile;
  const busy = publishState.isLoading || unpublishState.isLoading;
  const displayedListed = optimisticListed ?? listed;
  const showMealRating = profile?.showMealRating ?? false;
  const displayedMealRating = optimisticMealRating ?? showMealRating;
  const mealRating = profile?.mealRating ?? null;

  useEffect(() => {
    if (optimisticListed != null && listed === optimisticListed) {
      setOptimisticListed(null);
    }
  }, [listed, optimisticListed]);

  useEffect(() => {
    if (optimisticMealRating != null && showMealRating === optimisticMealRating) {
      setOptimisticMealRating(null);
    }
  }, [optimisticMealRating, showMealRating]);

  if (loadingProfile) {
    return (
      <>
        <Section title="Listing">
          <OwnerDataCardSkeleton actions={1} bodyLines={2} />
        </Section>
        <Section title="Property contacts">
          <PropertyContactsSection canManage={canManage} propertyId={propertyId} />
        </Section>
      </>
    );
  }

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
      listErrors.failFromServer(
        message ??
          (next
            ? "Could not list the property. Add a headline and description to its listing details first."
            : "Could not unlist the property. Please try again."),
      );
    }
  }

  async function toggleMealRating(next: boolean) {
    if (!profile || updateMealRatingState.isLoading) {
      return;
    }
    setOptimisticMealRating(next);
    try {
      // Headline and description go back as they are, and the contact flags are left alone.
      await updateMealRating({
        propertyId,
        payload: {
          description: profile.description ?? "",
          headline: profile.headline ?? "",
          profileImageUrl: profile.profileImageUrl,
          showMealRating: next,
        },
      }).unwrap();
      toast.success(next ? "Meal rating is now on your listing." : "Meal rating removed from your listing.");
    } catch (error) {
      setOptimisticMealRating(null);
      listErrors.failFromServer(errorMessage(error) || "Could not change that. Please try again.");
    }
  }

  return (
    <>
      {/* Edit listing sits in the heading, on the right (user, 2026-11-07). */}
      <Section
        title="Listing"
        trailing={canManage ? (
          <HeaderAction
            disabled={loadingProfile || !profile}
            icon={Pencil}
            label="Edit listing"
            onPress={() => setDetailsOpen(true)}
          />
        ) : null}
      >
        <Card>
        {/* Laid out like the Manage Meals card, with the same switch and its own picture on the knob. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: radii.pill, height: 42, justifyContent: "center", width: 42 }}>
            {displayedListed ? <Globe color={colors.ink} size={22} strokeWidth={2} /> : <EyeOff color={colors.ink} size={22} strokeWidth={2} />}
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15.5, lineHeight: 20 }}>
              {loadingProfile ? "Checking listing…" : displayedListed ? "Listed in discovery" : "Not listed"}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {displayedListed
                ? "Visible to people searching nearby."
                : "Hidden from discovery search."}
            </Text>
          </View>
          <IconSwitch
            accessibilityLabel={displayedListed ? "Remove from discovery" : "List in discovery"}
            busy={busy}
            disabled={loadingProfile || !canManage}
            enabled={displayedListed}
            onChange={() => void toggleListing()}
            raised
            renderIcon={(color) => <MaterialCommunityIcons color={color} name="eye" size={13} />}
          />
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 13 }}>
            Listing details
          </Text>
          <View style={{ backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: radii.card, gap: spacing.xs, padding: spacing.md }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>
              {profile?.headline?.trim() || "No headline yet"}
            </Text>
            <Text ellipsizeMode="tail" numberOfLines={4} style={[type.description, { color: colors.muted }]}>
              {profile?.description?.trim() || "Add a short description so prospects know what makes this property worth a look."}
            </Text>
          </View>
        </View>

        {listErrors.serverError ? <AlertModal message={listErrors.serverError} onClose={listErrors.dismissServerError} /> : null}
        </Card>

        <Card>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: radii.pill, height: 42, justifyContent: "center", width: 42 }}>
              <MaterialCommunityIcons color={colors.ink} name="silverware-fork-knife" size={22} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15.5, lineHeight: 20 }}>
                Show meal rating
              </Text>
              {mealRating == null ? (
                <Text style={[type.caption, { color: colors.muted }]}>No ratings yet</Text>
              ) : (
                <Text style={[type.caption, { color: colors.muted }]}>
                  Current rating:{" "}
                  <Text style={{ color: ratingColor(mealRating, colors), fontFamily: fonts.sansBold }}>{`${mealRating.toFixed(1)}/5`}</Text>
                </Text>
              )}
            </View>
            <IconSwitch
              accessibilityLabel="Show meal rating"
              busy={updateMealRatingState.isLoading}
              disabled={!profile || !canManage}
              enabled={displayedMealRating}
              onChange={(next) => void toggleMealRating(next)}
              raised
              renderIcon={(color) => <MaterialCommunityIcons color={color} name="star" size={13} />}
            />
          </View>
        </Card>
      </Section>

      {/* Add manager sits in the heading, on the right (user, 2026-11-07). */}
      <Section
        title="Property contacts"
        trailing={canManage ? (
          <HeaderAction icon={UserRoundPlus} label="Add manager" onPress={() => setContactPicker(true)} />
        ) : null}
      >
        <PropertyContactsSection
          canManage={canManage}
          picker={{ open: contactPicker, setOpen: setContactPicker }}
          propertyId={propertyId}
        />
      </Section>

      {detailsOpen && profile ? (
        <EditListingDetailsSheet onClose={() => setDetailsOpen(false)} profile={profile} propertyId={propertyId} />
      ) : null}
    </>
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
  const form = useFormErrors<"description" | "headline">();
  const [updateProfile, { isLoading }] = useUpdateOwnerDiscoveryProfileMutation();

  async function submit() {
    if (isLoading) {
      return;
    }
    const trimmedHeadline = headline.trim();
    const trimmedDescription = description.trim();
    const cleared = form.validate({
      ...(trimmedHeadline ? {} : { headline: "Headline is required." }),
      ...(trimmedDescription ? {} : { description: "Description is required." }),
    });
    if (!cleared) {
      return;
    }

    // Saving an untouched listing would fire a request and close the sheet,
    // reporting success for a change nobody made.
    if (
      isUnchanged(
        { description: profile.description, headline: profile.headline },
        { description: trimmedDescription, headline: trimmedHeadline },
      )
    ) {
      toast.warning("No changes have been made.");
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
      form.failFromServer(errorMessage(error) || "Could not update the listing details. Please try again.");
    }
  }

  return (
    <SheetShell size="content" contentMaxSize="tall" onClose={onClose} title="Edit listing details">
      <FormInput
        error={form.errors.headline}
        label="Headline"
        maxLength={160}
        onChangeText={(next) => {
          setHeadline(next);
          form.clearField("headline");
        }}
        placeholder="Short listing headline"
        required
        value={headline}
      />
      <FormInput
        error={form.errors.description}
        label="Description"
        maxLength={1000}
        multiline
        onChangeText={(next) => {
          setDescription(next);
          form.clearField("description");
        }}
        placeholder="What should prospects know?"
        required
        value={description}
      />
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading || form.blocked} label={isLoading ? "Saving…" : "Save details"} onPress={() => void submit()} />
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
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

/**
 * The cheapest bed currently on offer, or null when there is nothing to let.
 *
 * <p>Only active rooms count — a deactivated or under-maintenance room cannot be
 * taken, so advertising its price would be a number nobody can actually pay.
 */
function lowestActiveRoomRentPaise(rooms: OwnerRoom[]) {
  const lettable = rooms.filter((room) => room.active).map((room) => room.baseRentPaise);
  return lettable.length > 0 ? Math.min(...lettable) : null;
}
