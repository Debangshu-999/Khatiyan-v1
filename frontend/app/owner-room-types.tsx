import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { WizardHeader } from "@/components/wizard-header";
import { ActionButton } from "@/features/owner/owner-ui";
import { ROOM_TYPE_INTRO } from "@/features/property/room-type-board";
import { RoomTypesSection } from "@/features/property/room-types-section";
import { useGetPropertyQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The room types of an existing property, on their own screen.
 *
 * <p>Where registration lands after creating the property, and where anything
 * it could not create itself gets finished. The same `RoomTypesSection` that
 * edit-property embeds — this is only the frame around it.
 */
export default function OwnerRoomTypesScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();

  const property = useGetPropertyQuery(propertyId ?? "", { skip: !propertyId });

  return (
    <>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}
        surface={colors.formSurface}
      >
        <WizardHeader accentWord="types" onClose={() => router.back()} step={null} title="Room" totalSteps={0} />

        <View style={{ gap: 4, marginBottom: spacing.md, marginTop: spacing.sm }}>
          {ROOM_TYPE_INTRO.map((line) => (
            <Text key={line} style={[type.body, { color: colors.muted }]}>
              {"\u2022 "}
              {line}
            </Text>
          ))}
        </View>

        {propertyId ? (
          <RoomTypesSection
            occupancies={property.data?.availableSharingTypes ?? []}
            propertyId={propertyId}
          />
        ) : null}
      </ScreenScrollView>

      <PinnedFooter>
        <ActionButton label="Done" onPress={() => router.back()} />
      </PinnedFooter>
    </>
  );
}
