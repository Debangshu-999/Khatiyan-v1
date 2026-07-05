import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Compass, MapPinned, Pencil, Phone, Plus, Star, Trash2, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SkeletonList } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { LocationPinCard } from "@/features/geo/location-pin-card";
import { MapLocationPickerModal, type PickedLocation } from "@/features/geo/map-location-picker";
import { ActionButton, BackButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, humanizeToken } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateLocalPlaceMutation,
  useDeleteLocalPlaceMutation,
  useListLocalPlaceTagsQuery,
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
        <BackButton onPress={() => router.back()} />
        <ScreenHeader
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
              <ActionButton icon={Plus} label="Add nearby place" onPress={() => setEditing("new")} />
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
                  <PlaceCard
                    key={place.id}
                    onDelete={() => setPendingDelete(place)}
                    onEdit={() => setEditing(place)}
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

function PlaceCard({ onDelete, onEdit, place }: { onDelete: () => void; onEdit: () => void; place: PropertyLocalPlace }) {
  const { colors, fonts, type } = useTheme();
  const pinned = place.latitude != null && place.longitude != null;

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Text style={[type.bodyStrong, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1} selectable>
              {place.name}
            </Text>
            {place.ownerRecommended ? (
              <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 999, flexDirection: "row", gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <Star color={colors.accent} fill={colors.accent} size={10} strokeWidth={2} />
                <Text style={{ color: colors.accent, fontFamily: fonts.sans, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }}>
                  RECOMMENDED
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
            {place.tags.map((tag) => humanizeToken(tag)).join(" · ") || "No tags"}
          </Text>
        </View>
        <Text style={{ color: pinned ? colors.jade : colors.muted, fontFamily: fonts.sans, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "800" }} selectable>
          {place.distanceKm != null ? `${place.distanceKm.toFixed(1)} km` : pinned ? "Pinned" : "Not pinned"}
        </Text>
      </View>

      {place.addressText ? (
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2} selectable>
          {place.addressText}
        </Text>
      ) : null}

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
        {place.phone ? (
          <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.xs }}>
            <Phone color={colors.kicker} size={13} strokeWidth={2.2} />
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
              {place.phone}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <AnimatedPressable
          accessibilityLabel={`Edit ${place.name}`}
          onPress={onEdit}
          style={{ alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
        >
          <Pencil color={colors.primary} size={13} strokeWidth={2.4} />
          <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 12, fontWeight: "800" }}>Edit</Text>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityLabel={`Remove ${place.name}`}
          onPress={onDelete}
          style={{ alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
        >
          <Trash2 color={colors.danger} size={13} strokeWidth={2.4} />
          <Text style={{ color: colors.danger, fontFamily: fonts.sans, fontSize: 12, fontWeight: "800" }}>Remove</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function PlaceFormSheet({ editing, onClose, property }: { editing: PropertyLocalPlace | null; onClose: () => void; property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const tags = useListLocalPlaceTagsQuery().data ?? [];
  const [createPlace, createState] = useCreateLocalPlaceMutation();
  const [updatePlace, updateState] = useUpdateLocalPlaceMutation();

  const [name, setName] = useState(editing?.name ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(editing?.tags ?? []);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [addressText, setAddressText] = useState(editing?.addressText ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    editing?.latitude != null && editing?.longitude != null
      ? { latitude: editing.latitude, longitude: editing.longitude }
      : null,
  );
  const [recommended, setRecommended] = useState(editing?.ownerRecommended ?? false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = createState.isLoading || updateState.isLoading;

  const home = property.latitude != null && property.longitude != null
    ? { latitude: property.latitude, longitude: property.longitude, label: property.name }
    : undefined;

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
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
    if (selectedTags.length === 0) {
      return setError("Pick at least one tag so tenants can filter it.");
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
      photoUrl: editing?.photoUrl ?? null,
      tags: selectedTags,
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

        <FieldLabel>Tags</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {tags.map((tag) => (
            <ChoiceButton active={selectedTags.includes(tag)} key={tag} label={humanizeToken(tag)} onPress={() => toggleTag(tag)} />
          ))}
        </View>

        <FieldLabel>Location</FieldLabel>
        <LocationPinCard
          addressSummary={addressText.trim() ? addressText.trim() : null}
          coords={coords}
          onPress={() => setPickerOpen(true)}
        />
        <FormInput label="Address" multiline onChangeText={setAddressText} placeholder="Filled from the pin — edit freely" value={addressText} />

        <FormInput label="Description" multiline onChangeText={setDescription} placeholder="What makes it useful? Timings, tips…" value={description} />
        <FormInput keyboardType="phone-pad" label="Phone" onChangeText={setPhone} placeholder="Optional contact number" value={phone} />

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
          <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={saving} label={saving ? "Saving…" : editing ? "Save changes" : "Add place"} onPress={() => void submit()} />
      </Sheet>

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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>
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
    <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable>
      {children}
    </Text>
  );
}
