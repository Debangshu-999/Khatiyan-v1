import { ImageBackground, Text, View } from "react-native";
import { ChevronRight, MapPin, MapPinCheck } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/** "Madhapur, Hyderabad · 500081" from the form's own fields, or null. */
export function addressSummaryLine(area: string, city: string, pincode: string): string | null {
  const locality = [area.trim(), city.trim()].filter(Boolean).join(", ");
  const pin = pincode.trim();
  if (locality && pin) {
    return `${locality} · ${pin}`;
  }
  return locality || pin || null;
}

const NEARBY_MAP_PREVIEW = require("../../../assets/images/nearby-map-preview.png");

/**
 * Entry card for the map location picker used by the property forms.
 * Unpinned it reads as an inviting call-to-action (dashed border, primary
 * tint); pinned it becomes a quiet confirmation showing the resolved address
 * with a PINNED pill. Tapping either state opens the picker.
 */
export function LocationPinCard({
  addressSummary,
  coords,
  onPress,
  raised = false,
}: {
  /** Short human line for the pinned state, e.g. "Madhapur, Hyderabad · 500081". */
  addressSummary: string | null;
  coords: { latitude: number; longitude: number } | null;
  onPress: () => void;
  /** A card of its own on the page, with the app's card corners and a shadow. */
  raised?: boolean;
}) {
  const { colors, isDark, type } = useTheme();
  const pinned = coords != null;
  const frost = isDark ? "rgba(15, 23, 42, 0.72)" : "rgba(255, 255, 255, 0.78)";

  const disc = (
      <View
        style={{
          alignItems: "center",
          backgroundColor: pinned ? colors.jadeSoft : colors.primary,
          borderRadius: 22,
          height: 44,
          justifyContent: "center",
          width: 44,
        }}
      >
        {pinned ? (
          <MapPinCheck color={colors.jade} size={21} strokeWidth={2.2} />
        ) : (
          <MapPin color={colors.onPrimary} size={21} strokeWidth={2.2} />
        )}
      </View>
  );
  const words = (
      <View style={{ flex: 1, gap: 2 }}>
        {pinned ? (
          <>
            <FitText style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={2}>
              {addressSummary || "Location set"}
            </FitText>
            <FitText style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              Tap to adjust
            </FitText>
          </>
        ) : (
          <>
            <Text style={[type.bodyStrong, { color: colors.ink }]}>
              Set location on map
            </Text>
            <FitText style={[type.description, { color: colors.muted }]} numberOfLines={2}>
              Search your area or drop a pin — the address fills in automatically.
            </FitText>
          </>
        )}
      </View>
  );
  const chevron = (
      <ChevronRight color={pinned ? colors.kicker : colors.primary} size={18} strokeWidth={2.4} />
  );

  // On the Manage nearby places map, with the words on frosted panels so they read over it.
  if (raised) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={{ borderCurve: "continuous", borderRadius: radii.card, ...cardShadow(colors.shadow) }}
      >
        <ImageBackground
          imageStyle={{ borderRadius: radii.card }}
          resizeMode="cover"
          source={NEARBY_MAP_PREVIEW}
          style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, padding: spacing.md }}>
            {disc}
            <View style={{ backgroundColor: frost, borderRadius: 8, flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
              {words}
            </View>
            {chevron}
          </View>
        </ImageBackground>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: pinned ? colors.surface : colors.primarySoft,
        borderColor: pinned ? colors.border : colors.primary,
        borderCurve: "continuous",
        borderRadius: 16,
        borderStyle: pinned ? "solid" : "dashed",
        borderWidth: 1.5,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {disc}
      {words}
      {chevron}
    </AnimatedPressable>
  );
}
