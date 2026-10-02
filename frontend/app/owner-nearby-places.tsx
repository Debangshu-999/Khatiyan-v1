import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, Compass, MapPin } from "lucide-react-native";
import { ImageBackground, Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { NearbyPlacesView } from "@/features/discovery/components/nearby-places-view";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NEARBY_MAP_PREVIEW = require("../assets/images/nearby-map-preview.png");

export default function OwnerNearbyPlacesScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, isDark } = useTheme();
  const frost = isDark ? "rgba(15, 23, 42, 0.72)" : "rgba(255, 255, 255, 0.78)";
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const { canManage: canManageResource } = usePropertyPermissions(property?.id);
  const canManagePlaces = canManageResource("NEARBY_PLACES");

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={!canManagePlaces ? <ViewOnlyChip /> : null}
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
          title="No property selected"
          description="Choose an active property from Home to view its nearby places."
        />
      ) : (
        <>
          {canManagePlaces ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Manage nearby places"
              onPress={() => router.push("/owner-local-places")}
            >
              <ImageBackground
                source={NEARBY_MAP_PREVIEW}
                resizeMode="cover"
                imageStyle={{ borderRadius: 20 }}
                style={{ borderColor: colors.borderStrong, borderRadius: 20, borderWidth: 1, overflow: "hidden" }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
                  <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: frost, borderRadius: 12, height: 36, width: 36 }}>
                    <MapPin color={colors.ink} size={20} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, backgroundColor: frost, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                    <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 23 }}>Manage nearby places</Text>
                  </View>
                  <ChevronRight color={colors.ink} size={18} strokeWidth={2.2} />
                </View>
              </ImageBackground>
            </AnimatedPressable>
          ) : null}
          <NearbyPlacesView mode="admin" propertyId={property.id} />
        </>
      )}
    </ScreenScrollView>
  );
}
