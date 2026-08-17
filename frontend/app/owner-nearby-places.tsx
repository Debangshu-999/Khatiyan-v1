import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Compass } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { NearbyPlacesView } from "@/features/discovery/components/nearby-places-view";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";

export default function OwnerNearbyPlacesScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const { canManage: canManageResource } = usePropertyPermissions(property?.id);
  const canManagePlaces = canManageResource("NEARBY_PLACES");

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        onBack={() => router.back()}
        badge={!canManagePlaces ? <ViewOnlyChip /> : null}
        eyebrow="Property"
        title="Nearby"
        italicTail="places."
        subtitle={
          property
            ? `What tenants and prospects see around ${property.name}. Search or filter to preview it.`
            : "Select a property from Home to view its nearby places."
        }
      />

      {!property ? (
        <EmptyState
          icon={Compass}
          eyebrow="Property required"
          title="No property selected"
          description="Choose an active property from Home to view its nearby places."
        />
      ) : (
        <>
          <NearbyPlacesView mode="admin" propertyId={property.id} />

          {/* Hidden, not greyed: the whole card exists to open a management
              screen, so at view-only there is nothing behind it to see. The
              places themselves are still listed above. */}
          {canManagePlaces ? (
          <Section eyebrow="Manage" title="Curate">
            <ActionCard
              meta="Owner tools"
              title="Manage nearby places"
              description="Add, edit or remove the landmarks and services around this property."
              onPress={() => router.push("/owner-local-places")}
              tone="primary"
            />
          </Section>
          ) : null}
        </>
      )}
    </ScreenScrollView>
  );
}
