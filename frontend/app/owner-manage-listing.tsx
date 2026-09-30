import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ManageListingIcon } from "@/features/property/property-control-icons";
import { ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";

import { DiscoveryListingCard } from "./owner-property";

/** Listing controls moved out of the property overview so that overview stays navigational. */
export default function OwnerManageListingScreen() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);
  const { canManage } = usePropertyPermissions(selectedProperty?.id);
  const canManageSettings = canManage("PROPERTY_SETTINGS");

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={selectedProperty && !canManageSettings ? <ViewOnlyChip /> : null}
        italicTail="listing."
        subtitle={
          selectedProperty
            ? `Control how ${selectedProperty.name} appears to interested people.`
            : "Select a property on Home first."
        }
        title="Manage"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Choose the property whose discovery listing you want to manage."
          icon={ManageListingIcon}
          title="No property selected"
        />
      ) : null}

      {selectedProperty && !selectedProperty.discoveryProfileCreated ? (
        <EmptyState
          description="Complete this property's discovery profile before managing its public listing."
          icon={ManageListingIcon}
          title="No listing profile"
        />
      ) : null}

      {selectedProperty?.discoveryProfileCreated ? (
        <DiscoveryListingCard canManage={canManageSettings} propertyId={selectedProperty.id} />
      ) : null}
    </ScreenScrollView>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
