import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, Compass, MapPinned, Plus, Star, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SkeletonList } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { CategoryPickerModal } from "@/features/discovery/components/category-picker-modal";
import { NearbyPlaceCard } from "@/features/discovery/components/nearby-place-card";
import { LocationPinCard } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal, type PickedLocation } from "@/features/geo/map-location-picker";
import { SingleImageField } from "@/features/uploads/single-image-field";
import { ActionButton, ConfirmDialog, FormInput, IconButton,
  ViewOnlyChip,
} from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateLocalPlaceMutation,
  useDeleteLocalPlaceMutation,
  useListLocalPlaceTaxonomyQuery,
  useListManagedLocalPlacesQuery,
  useUpdateLocalPlaceMutation,
  type LocalPlacePayload,
  type PropertyLocalPlace,
} from "@/store/services/discovery-api";
import type { OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerLocalPlacesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";
  // Curating places is NEARBY_PLACES at MANAGE.
  const { canManage: canManageResource } = usePropertyPermissions(propertyId);
  const canManagePlaces = canManageResource("NEARBY_PLACES");

  const placesQuery = useListManagedLocalPlacesQuery(propertyId, { skip: !propertyId });
  const places = placesQuery.data ?? [];
  const [editing, setEditing] = useState<PropertyLocalPlace | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PropertyLocalPlace | null>(null);
  const [deletePlace] = useDeleteLocalPlaceMutation();

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target || !propertyId) {
      return;
    }
    try {
      await deletePlace({ placeId: target.id, propertyId }).unwrap();
      toast.success(`${target.name} removed.`);
    } catch {
      toast.error("Could not remove the place.");
    }
  }

  return (
    <>
      <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
        <ScreenHeader
        onBack={() => router.back()}
        badge={!canManagePlaces ? <ViewOnlyChip /> : null}
          eyebrow="Discovery"
          title="Nearby"
          italicTail="places."
          subtitle={
            property
              ? `Curate landmarks, services and conveniences around ${property.name}. Tenants and prospects see these with real distances.`
              : "Select a property from Home to curate its nearby places."
          }
        />

        {!property ? (
          <EmptyState
            icon={Compass}
            eyebrow="Property required"
            title="No property selected"
            description="Choose an active property from Home before curating nearby places."
          />
        ) : (
          <>
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={!canManagePlaces} icon={Plus} label="Add nearby place" onPress={() => setEditing("new")} />
            </View>

            <Section eyebrow={`${places.length} place${places.length === 1 ? "" : "s"}`} title="Curated list">
              {placesQuery.isFetching && places.length === 0 ? (
                <SkeletonList />
              ) : null}

              {!placesQuery.isFetching && places.length === 0 ? (
                <EmptyState
                  icon={MapPinned}
                  eyebrow="Nothing yet"
                  title="No nearby places added"
                  description="Add the metro station, hospital, market or gym around your property — pinned places show tenants real distances."
                />
              ) : null}

              <View style={{ gap: spacing.sm }}>
                {places.map((place) => (
                  // Withholding the handlers drops the card into its view mode
                  // (call + directions) instead of manage mode. The component
                  // already had both; a view-only manager gets the read half.
                  <NearbyPlaceCard
                    key={place.id}
                    onDelete={canManagePlaces ? () => setPendingDelete(place) : undefined}
                    onEdit={canManagePlaces ? () => setEditing(place) : undefined}
                    place={place}
                  />
                ))}
              </View>
            </Section>
          </>
        )}
      </ScreenScrollView>

      {editing && property ? (
        <PlaceFormSheet
          editing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          property={property}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={`Remove ${pendingDelete.name} from the nearby places list? Tenants will no longer see it.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
          title="Remove place?"
        />
      ) : null}
    </>
  );
}

function PlaceFormSheet({ editing, onClose, property }: { editing: PropertyLocalPlace | null; onClose: () => void; property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const taxonomy = useListLocalPlaceTaxonomyQuery(property.id).data ?? [];
  const [createPlace, createState] = useCreateLocalPlaceMutation();
  const [updatePlace, updateState] = useUpdateLocalPlaceMutation();

  const [name, setName] = useState(editing?.name ?? "");
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>(editing?.subcategoryIds ?? []);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [addressText, setAddressText] = useState(editing?.addressText ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    editing?.latitude != null && editing?.longitude != null
      ? { latitude: editing.latitude, longitude: editing.longitude }
      : null,
  );
  const [recommended, setRecommended] = useState(editing?.ownerRecommended ?? false);
  // Stored URL, not a device URI: the photo is uploaded when it is picked.
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = createState.isLoading || updateState.isLoading;

  const home = property.latitude != null && property.longitude != null
    ? { latitude: property.latitude, longitude: property.longitude, label: property.name }
    : undefined;

  // Names of the currently-selected subcategories, for the summary chips.
  const selectedNames = taxonomy
    .flatMap((category) => category.subcategories)
    .filter((sub) => selectedSubcategoryIds.includes(sub.id))
    .map((sub) => sub.name);

  function toggleSubcategory(id: string) {
    setSelectedSubcategoryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function applyPickedLocation(result: PickedLocation) {
    setCoords({ latitude: result.latitude, longitude: result.longitude });
    if (result.address?.formattedAddress) {
      setAddressText(result.address.formattedAddress);
    }
  }

  async function submit() {
    if (!name.trim()) {
      return setError("Give this place a name.");
    }
    if (selectedSubcategoryIds.length === 0) {
      return setError("Pick at least one category so tenants can filter it.");
    }
    // PATCH replaces every field, so carry through values the form doesn't
    // surface to avoid wiping them on edit.
    const payload: LocalPlacePayload = {
      addressText: addressText.trim() || null,
      description: description.trim() || null,
      directionsUrl: editing?.directionsUrl ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      name: name.trim(),
      ownerRecommended: recommended,
      phone: phone.trim() || null,
      photoUrl: photoUrl.trim() || null,
      subcategoryIds: selectedSubcategoryIds,
    };
    try {
      if (editing) {
        await updatePlace({ payload, placeId: editing.id, propertyId: property.id }).unwrap();
      } else {
        await createPlace({ payload, propertyId: property.id }).unwrap();
      }
      onClose();
      toast.success(editing ? "Place updated." : "Place added.");
    } catch {
      setError("Could not save the place. Check the details and try again.");
    }
  }

  return (
    <>
      <Sheet onClose={onClose} title={editing ? "Edit place" : "Add nearby place"}>
        <FormInput autoCapitalize="words" label="Place name" onChangeText={setName} placeholder="e.g. Hitec City Metro Station" value={name} />

        <FieldLabel>Categories</FieldLabel>
        <AnimatedPressable
          accessibilityLabel="Choose categories"
          accessibilityRole="button"
          onPress={() => setCategoryPickerOpen(true)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={[type.body, { color: selectedNames.length > 0 ? colors.ink : colors.muted, flex: 1, fontWeight: "700" }]} numberOfLines={1}>
            {selectedNames.length > 0 ? `${selectedNames.length} selected` : "Choose categories"}
          </Text>
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.3} />
        </AnimatedPressable>
        {selectedNames.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {selectedNames.map((subcategory) => (
              <View key={subcategory} style={{ backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                <Text style={[type.caption, { color: colors.primary, fontWeight: "800" }]}>{subcategory}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <FieldLabel>Location</FieldLabel>
        <LocationPinCard
          addressSummary={addressText.trim() ? addressText.trim() : null}
          coords={coords}
          onPress={() => setPickerOpen(true)}
        />
        <FormInput label="Address" multiline onChangeText={setAddressText} placeholder="Filled from the pin — edit freely" value={addressText} />

        <FormInput label="Description" multiline onChangeText={setDescription} placeholder="What makes it useful? Timings, tips…" value={description} />
        <FormInput keyboardType="phone-pad" label="Phone" onChangeText={setPhone} placeholder="Optional contact number" value={phone} />

        <SingleImageField
          attachedLabel="Photo attached"
          label="Photo (optional)"
          onChange={setPhotoUrl}
          target="LOCAL_PLACE_PHOTO"
          url={photoUrl}
        />

        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setRecommended((current) => !current)}
          style={{
            alignItems: "center",
            backgroundColor: recommended ? colors.accentSoft : colors.surface,
            borderColor: recommended ? colors.accent : colors.border,
            borderRadius: 14,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          <Star color={recommended ? colors.accent : colors.kicker} fill={recommended ? colors.accent : "transparent"} size={18} strokeWidth={2.2} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.ink }]}>Owner recommended</Text>
            <Text style={[type.caption, { color: colors.muted }]}>Recommended places rank first in the tenant list.</Text>
          </View>
        </AnimatedPressable>

        {error ? (
          <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]}>
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={saving} label={saving ? "Saving…" : editing ? "Save changes" : "Add place"} onPress={() => void submit()} />
      </Sheet>

      <CategoryPickerModal
        categories={taxonomy}
        mode="assign"
        onClose={() => setCategoryPickerOpen(false)}
        onToggleSubcategory={toggleSubcategory}
        propertyId={property.id}
        selectedSubcategoryIds={selectedSubcategoryIds}
        visible={categoryPickerOpen}
      />

      {pickerOpen ? (
        <MapLocationPickerModal
          home={home}
          initial={coords ?? undefined}
          onClose={() => setPickerOpen(false)}
          onPick={applyPickedLocation}
          title={name.trim() ? `Pin ${name.trim()}` : "Pin this place"}
        />
      ) : null}
    </>
  );
}

function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      {/* "padding" on BOTH platforms: Android is edge-to-edge (Expo 56), where
          adjustResize never resizes the modal window — without this the
          keyboard slides over the sheet instead of lifting it. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={1}>
                {title}
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldLabel({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
      {children}
    </Text>
  );
}
