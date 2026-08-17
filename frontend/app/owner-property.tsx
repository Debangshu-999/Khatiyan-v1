import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { BedDouble, Building2, ClipboardList, DoorOpen, EyeOff, FileSignature, Globe, MapPin, Pencil, X } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import { LocationPinCard, addressSummaryLine } from "@/features/geo/location-pin-card";
import { FacilityOverviewGrid } from "@/features/property/facility-overview-grid";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  FormInput,
  IconButton,
  formatDepositPaise,
  formatMoneyPaise,
  humanizeToken,
  rupeesToPaise,
  ViewOnlyChip,
} from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
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
  NOTICE_PERIOD_LABELS,
  useListPropertyRoomsQuery,
  type OwnerProperty,
  type OwnerRoom,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomType,
} from "@/store/services/property-api";
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
  | "/owner-rooms"
  | "/owner-staff"
  | "/owner-board"
  | "/owner-nearby-places";

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

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      {/* The chip shares the back row rather than taking one of its own: it
          qualifies the whole screen, so it belongs level with the way out. */}
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
        {!canManageSettings ? <ViewOnlyChip /> : null}
      </View>

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
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={!canManageSettings} icon={Pencil} label="Edit property" onPress={() => router.push("/owner-edit-property")} variant="secondary" />
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              label="Rent from"
              value={startingRentPaise == null ? "No rooms yet" : formatMoneyPaise(startingRentPaise)}
              hint="Lowest room"
              tone="primary"
            />
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
            <MetricTile
              label="Rooms"
              value={roomsQuery.data ? String(roomsQuery.data.filter((room) => room.active).length) : "-"}
              hint="Active"
            />
          </View>

          {/* Same grid a prospective tenant sees on the discovery profile. The
              owner was previously shown flat pills — the same facts in a weaker
              form, so they could not tell how their own listing actually reads. */}
          {selectedProperty.facilities.length || selectedProperty.customFacilities.length ? (
            <Card tone="sunken">
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Facilities
              </Text>
              <FacilityOverviewGrid
                facilities={[...selectedProperty.facilities, ...selectedProperty.customFacilities]}
              />
            </Card>
          ) : null}

          {selectedProperty.discoveryProfileCreated ? <DiscoveryListingCard canManage={canManageSettings} propertyId={selectedProperty.id} /> : null}

          <Section eyebrow="Manage" title="Property workspace">
            <ActionCard
              icon={BedDouble}
              title="Rooms & beds"
              description="Create rooms single or in bulk, edit, set status and manage occupancy."
              onPress={() => open(router, "/owner-rooms")}
            />
            <ActionCard
              icon={ClipboardList}
              title="Property board"
              description="Always-on info for tenants - rules, timings and contacts, organised by category."
              onPress={() => open(router, "/owner-board")}
            />
            <ActionCard
              icon={MapPin}
              title="Nearby places"
              description="See what tenants find around the property, then curate the landmarks and services."
              onPress={() => open(router, "/owner-nearby-places")}
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
function DiscoveryListingCard({ canManage, propertyId }: { canManage: boolean; propertyId: string }) {
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
          <Text numberOfLines={3} style={[type.caption, { color: colors.muted }]}>
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
