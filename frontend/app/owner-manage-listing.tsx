import { useState } from "react";
import { CircleHelp, IdCard } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { EmptyState } from "@/components/empty-state";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ManageListingIcon } from "@/features/property/property-control-icons";
import { ActionButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { useTheme } from "@/theme/use-theme";
import { View } from "react-native";

import { DiscoveryListingCard } from "./owner-property";

const HOW_IT_WORKS = [
  "The switch shows this property in discovery. Turn it off and the property is hidden from search.",
  "A listing needs a headline and a description before it can go live.",
  "Edit listing changes the headline and description people read.",
  "Show meal rating adds your current rating, the average of the last 30 days, to the Food card on your property profile.",
  "The contacts here are who the listing tells people to call.",
  "The owner is always listed and cannot be removed.",
  "Managers you add appear on the public listing. You can only add managers of this property.",
  "Adding or removing a contact saves straight away.",
];

/** Listing controls moved out of the property overview so that overview stays navigational. */
export default function OwnerManageListingScreen() {
  const { colors } = useTheme();
  const router = useGuardedRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);
  const { canManage } = usePropertyPermissions(selectedProperty?.id);
  const canManageSettings = canManage("PROPERTY_SETTINGS");

  const loadFailed = loadFailure(propertiesQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  const canPreview = Boolean(selectedProperty?.discoveryProfileCreated);

  return (
    <View style={{ flex: 1 }}>
    <ScreenScrollView
      bottomPaddingCovered={canPreview}
      contentContainerStyle={canPreview ? { paddingBottom: PINNED_FOOTER_CLEARANCE } : undefined}
      safeAreaEdges={["top", "bottom"]}
    >
      <ScreenHeader
        badge={selectedProperty && !canManageSettings ? <ViewOnlyChip /> : null}
        italicTail="listing."
        subtitle={
          selectedProperty
            ? `Control how ${selectedProperty.name} appears to interested people.`
            : "Select a property on Home first."
        }
        title="Manage"
        trailing={
          <AnimatedPressable
            accessibilityLabel="How this screen works"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setHelpOpen(true)}
            style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
            tapLockMs={0}
          >
            <CircleHelp color={colors.kicker} size={20} strokeWidth={2.4} />
          </AnimatedPressable>
        }
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

      {helpOpen ? (
        <HowItWorksSheet
          eyebrow="Manage listing"
          onClose={() => setHelpOpen(false)}
          steps={HOW_IT_WORKS.map((point) => ({ body: point, title: point }))}
          title="How your listing works"
        />
      ) : null}
    </ScreenScrollView>
    {canPreview ? (
      <PinnedFooter>
        <View style={{ flexDirection: "row" }}>
          <ActionButton icon={IdCard} label="Show listing preview" onPress={() => router.push("/owner-listing-preview")} />
        </View>
      </PinnedFooter>
    ) : null}
    </View>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
