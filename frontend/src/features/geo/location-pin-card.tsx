import { Text, View } from "react-native";
import { ChevronRight, MapPin, MapPinCheck } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** "Madhapur, Hyderabad · 500081" from the form's own fields, or null. */
export function addressSummaryLine(area: string, city: string, pincode: string): string | null {
  const locality = [area.trim(), city.trim()].filter(Boolean).join(", ");
  const pin = pincode.trim();
  if (locality && pin) {
    return `${locality} · ${pin}`;
  }
  return locality || pin || null;
}

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
}: {
  /** Short human line for the pinned state, e.g. "Madhapur, Hyderabad · 500081". */
  addressSummary: string | null;
  coords: { latitude: number; longitude: number } | null;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  const pinned = coords != null;

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

      <View style={{ flex: 1, gap: 2 }}>
        {pinned ? (
          <>
            <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={2} selectable>
              {addressSummary || "Location set"}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
              Tap to adjust
            </Text>
          </>
        ) : (
          <>
            <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
              Set location on map
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2} selectable>
              Search your area or drop a pin — the address fills in automatically.
            </Text>
          </>
        )}
      </View>

      <ChevronRight color={pinned ? colors.kicker : colors.primary} size={18} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}
