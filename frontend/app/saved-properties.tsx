import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { EmptyBookmarks } from "@/components/empty-art";
import { EmptyState } from "@/components/empty-state";
import { LoadFailed } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ListingResultsSkeleton } from "@/components/skeletons/discovery/listing-results";
import { useToast } from "@/components/toast";
import { PropertyListingCard } from "@/features/discovery/components/property-listing-card";
import { PropertyProfileLayer, type PropertyProfileLayerHandle } from "@/features/discovery/components/property-profile-layer";
import { errorMessage } from "@/features/forms/server-error";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentLocation } from "@/store/slices/location-slice";
import { useListSavedPropertiesQuery, useSetPropertySavedMutation } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Saved properties (user, 2026-11-14), opened from View saved on Discover: the
 * listings this person bookmarked, newest first, on the same cards as a search.
 * A card opens the property's profile over this screen. Its bookmark removes it.
 */
export default function SavedPropertiesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  // Distances from where the person is, as on Discover's results.
  const location = useAppSelector((state) => state.location);
  const dispatch = useAppDispatch();
  const hasLocation = location.latitude != null && location.longitude != null;
  // No place known yet (never opened Home, or no permission asked): ask once, so the cards can
  // say how far each one is rather than "Distance unavailable" (user, 2026-11-14).
  useEffect(() => {
    if (!hasLocation) void dispatch(fetchCurrentLocation());
    // Once per visit: a refusal is not asked again until the screen is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const savedQuery = useListSavedPropertiesQuery({ latitude: location.latitude, longitude: location.longitude });
  const [setSaved] = useSetPropertySavedMutation();
  const [refusal, setRefusal] = useState<string | null>(null);
  const profileLayer = useRef<PropertyProfileLayerHandle>(null);
  const saved = savedQuery.data ?? [];

  async function remove(propertyId: string) {
    try {
      await setSaved({ propertyId, saved: false }).unwrap();
      toast.success("Removed from saved.");
    } catch (caught) {
      setRefusal(errorMessage(caught));
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenScrollView
        onRefresh={() => void savedQuery.refetch()}
        safeAreaEdges={["top", "bottom"]}
        surface={colors.surface}
      >
        {/* All black, at the left beside back (user, 2026-11-14): no italic tail. */}
        <ScreenHeader
          alignLeft
          subtitle="Places you bookmarked, newest first."
          title="Saved properties"
        />

        {savedQuery.isError && !savedQuery.data ? (
          <LoadFailed error={savedQuery.error} onReload={() => void savedQuery.refetch()} />
        ) : savedQuery.isLoading ? (
          <ListingResultsSkeleton rows={3} />
        ) : saved.length === 0 ? (
          <EmptyState
            artworkNode={<EmptyBookmarks size={120} />}
            description="Tap the bookmark on a property's profile to keep it here."
            title="No saved properties yet"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {saved.map((property) => (
              <PropertyListingCard
                key={property.propertyId}
                onRemove={() => void remove(property.propertyId)}
                onView={() => profileLayer.current?.open(property.propertyId, "OTHER")}
                property={property}
              />
            ))}
          </View>
        )}
      </ScreenScrollView>
      <PropertyProfileLayer ref={profileLayer} />
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </View>
  );
}
