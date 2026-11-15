import { EmptyState } from "@/components/empty-state";
import { LoadFailed } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { PropertyProfileSkeleton } from "@/components/skeletons/discovery/property-profile";
import { PropertyProfile } from "@/features/discovery/components/property-profile";
import { useAppSelector } from "@/store/hooks";
import { useGetListingPreviewQuery } from "@/store/services/discovery-api";
import { useTheme } from "@/theme/use-theme";

/**
 * The current property's profile as people will see it (user, 2026-11-03), listed or
 * not. No Enquire, Visit or Booking, and it counts for nothing in the listing funnel:
 * an owner looking at their own listing is not a prospect.
 */
export default function OwnerListingPreviewScreen() {
  const { colors } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const previewQuery = useGetListingPreviewQuery(propertyId ?? "", { refetchOnMountOrArgChange: true, skip: !propertyId });
  const property = previewQuery.currentData;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} surface={colors.surface}>
      <ScreenHeader italicTail="preview." title="Listing" />

      {!propertyId ? <EmptyState description="Choose a property on Home first." title="Select a property" /> : null}

      {property ? (
        <PropertyProfile property={property} />
      ) : previewQuery.isError ? (
        <LoadFailed error={previewQuery.error} onReload={() => void previewQuery.refetch()} />
      ) : propertyId ? (
        <PropertyProfileSkeleton />
      ) : null}
    </ScreenScrollView>
  );
}
