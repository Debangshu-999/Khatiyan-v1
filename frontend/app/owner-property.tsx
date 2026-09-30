import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { EyeOff, Globe, Pencil } from "lucide-react-native";

import { PropertyArtwork } from "@/components/artwork-icon";
import { PropertyIcon } from "@/components/property-icon";
import { ActionCard } from "@/components/action-card";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Card } from "@/components/card";
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
  EnquiriesIcon,
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
import { spacing } from "@/theme/spacing";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTheme } from "@/theme/use-theme";

type PropertyRoute =
  | "/owner-manage-listing"
  | "/owner-enquiries"
  | "/owner-rooms"
  | "/owner-staff"
  | "/owner-board"
  | "/owner-food"
  | "/owner-nearby-places"
  | "/owner-property-visits";

export default function OwnerPropertyScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  // Editing the property and its listing is PROPERTY_SETTINGS at MANAGE.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
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
          <Card>
            {/* The property mark beside its own name, as on the Home selector.
                This card IS the property; every other card on the screen is a
                part of it, and the glyph is what says which is which. */}
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
              <PropertyArtwork size={34} />
            <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {selectedProperty.referenceCode}  /  {humanizeToken(selectedProperty.type)}
              </Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 24, lineHeight: 29 }]}>
                {selectedProperty.name}
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>
                {[selectedProperty.address, selectedProperty.area, selectedProperty.city, selectedProperty.state, selectedProperty.pincode].filter(Boolean).join(", ")}
              </Text>
            </View>
            </View>
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={!canManageSettings} icon={Pencil} label="Edit property" onPress={() => router.push("/owner-edit-property")} variant="secondary" />
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {roomsLoading ? (
              <OwnerMetricTileSkeleton />
            ) : (
              <MetricTile
                label="Rent from"
                value={startingRentPaise == null ? "No rooms yet" : formatMoneyPaise(startingRentPaise)}
                hint="Lowest room"
                tone="primary"
              />
            )}
            <MetricTile label="Deposit" value={formatDepositPaise(selectedProperty.standardDepositPaise)} hint="Standard" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              label="Notice"
              value={NOTICE_PERIOD_LABELS[selectedProperty.noticePeriod]}
              hint="Notice period"
            />
            <MetricTile
              label="Grace"
              value={selectedProperty.rentGraceDays > 0 ? `${selectedProperty.rentGraceDays}d` : "None"}
              hint="Rent grace"
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              label="Late fee"
              value={selectedProperty.rentLateFeePerDayPaise ? `${formatMoneyPaise(selectedProperty.rentLateFeePerDayPaise)}/d` : "None"}
              hint="Per day"
            />
            {roomsLoading ? (
              <OwnerMetricTileSkeleton />
            ) : (
              <MetricTile
                label="Rooms"
                value={String((roomsQuery.data ?? []).filter((room) => room.active).length)}
                hint="Active"
              />
            )}
          </View>

          {selectedProperty.facilities.length || selectedProperty.customFacilities.length ? (
            <FacilityOverviewGrid
              facilities={[...selectedProperty.facilities, ...selectedProperty.customFacilities]}
            />
          ) : null}

          <Section title="Property workspace">
            <ActionCard
              borderRadius={12}
              icon={ManageListingIcon}
              iconSize={58}
              showArrow={false}
              title="Manage listing"
              description="Control discovery visibility, listing details and the contacts prospects can use."
              onPress={() => open(router, "/owner-manage-listing")}
            />
            <ActionCard
              badge={openEnquiryCount}
              borderRadius={12}
              icon={EnquiriesIcon}
              iconSize={58}
              showArrow={false}
              title="Enquiries"
              description="Review questions from interested people and respond from the property enquiry inbox."
              onPress={() => open(router, "/owner-enquiries")}
            />
            <ActionCard
              borderRadius={12}
              icon={RoomsAndBedsIcon}
              iconSize={58}
              showArrow={false}
              title="Rooms & beds"
              description="Create rooms single or in bulk, edit, set status and manage occupancy."
              onPress={() => open(router, "/owner-rooms")}
            />
            <ActionCard
              borderRadius={12}
              icon={PropertyBoardIcon}
              iconSize={58}
              showArrow={false}
              title="Property board"
              description="Always-on info for tenants - rules, timings and contacts, organised by category."
              onPress={() => open(router, "/owner-board")}
            />
            <ActionCard
              borderRadius={12}
              icon={NearbyLocationsIcon}
              iconSize={58}
              showArrow={false}
              title="Nearby locations"
              description="See what tenants find around the property, then curate the landmarks and services."
              onPress={() => open(router, "/owner-nearby-places")}
            />
            <ActionCard
              borderRadius={12}
              icon={PropertyVisitsIcon}
              iconSize={58}
              showArrow={false}
              title="Property visits"
              description="Set the time slots, day by day, when tenants can book a visit to the property."
              onPress={() => open(router, "/owner-property-visits")}
            />
          </Section>

        </>
      ) : null}

    </ScreenScrollView>
  );
}

// List/unlist toggle for discovery visibility. Wraps the existing publish /
// unpublish endpoints; unlisting only hides the property from discovery search —
// onboarded tenants and the owner's other workspaces are unaffected.
export function DiscoveryListingCard({ canManage, propertyId }: { canManage: boolean; propertyId: string }) {
  // Server refusal — nothing on screen to correct, so it interrupts.
  const listErrors = useFormErrors<never>();

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

  return (
    <>
      <Section title="Listing">
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
            <Text style={[type.bodyStrong, { color: colors.ink }]}>
              {loadingProfile ? "Checking listing…" : displayedListed ? "Listed in discovery" : "Not listed"}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {displayedListed
                ? "Visible to people searching nearby."
                : "Hidden from discovery search."}
            </Text>
          </View>
          <Switch
            accessibilityLabel={displayedListed ? "Remove from discovery" : "List in discovery"}
            disabled={busy || loadingProfile || !canManage}
            onValueChange={() => void toggleListing()}
            thumbColor={colors.surface}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            value={displayedListed}
          />
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Listing details
          </Text>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>
            {profile?.headline?.trim() || "No headline yet"}
          </Text>
          <Text numberOfLines={3} style={[type.description, { color: colors.muted }]}>
            {profile?.description?.trim() || "Add a short description so prospects know what makes this property worth a look."}
          </Text>
        </View>

        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={loadingProfile || !profile || !canManage}
            icon={Pencil}
            label="Edit listing details"
            onPress={() => setDetailsOpen(true)}
            variant="secondary"
          />
        </View>
        {listErrors.serverError ? <AlertModal message={listErrors.serverError} onClose={listErrors.dismissServerError} /> : null}
        </Card>
      </Section>

      <Section title="Property contacts">
        <PropertyContactsSection canManage={canManage} propertyId={propertyId} />
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
    <SheetShell onClose={onClose} title="Edit listing details">
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
