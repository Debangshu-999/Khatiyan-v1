import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ArrowLeft, Wrench } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerServicePlaceholderScreen() {
  const router = useRouter();
  const { service, title } = useLocalSearchParams<{ service?: string; title?: string }>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = selectedPropertyId
    ? properties.find((item) => item.id === selectedPropertyId)
    : properties.length === 1
      ? properties[0]
      : undefined;
  const { colors, type } = useTheme();
  const serviceTitle = title ?? "Owner service";

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScreenHeader
        eyebrow="Owner service"
        title={serviceTitle}
        italicTail="workspace."
        subtitle={property ? `Scoped to ${property.name}.` : "Select a property from Home first."}
      />

      {property ? (
        <Card>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Selected property
          </Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]} selectable>
            {property.name}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {[property.address, property.city, property.state, property.pincode].filter(Boolean).join(", ")}
          </Text>
        </Card>
      ) : null}

      <EmptyState
        icon={Wrench}
        eyebrow={(service ?? "service").toString()}
        title="Mobile screen not wired yet"
        description="This service is intentionally separated from the owner overview. The backend/test app flow exists; the mobile UI can now be built here without making the owner tab too long."
      />
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
        selectable
      >
        Back
      </Text>
    </AnimatedPressable>
  );
}
