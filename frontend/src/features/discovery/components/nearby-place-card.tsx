import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Info, MapPin, Navigation, Pencil, Phone, Star, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import type { PropertyLocalPlace } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type NearbyPlaceCardProps = {
  place: PropertyLocalPlace;
  // Passing these puts the place into "manage" mode with edit/remove controls.
  onEdit?: () => void;
  onDelete?: () => void;
};

// One card shared by the nearby-places list (view) and the manage screen. The
// view mode offers call + directions; manage mode (edit/delete handlers given)
// shows only edit/remove — four buttons overflow the card.
export function NearbyPlaceCard({ onDelete, onEdit, place }: NearbyPlaceCardProps) {
  const { colors, fonts, type } = useTheme();
  const pinned = place.latitude != null && place.longitude != null;
  const manage = Boolean(onEdit || onDelete);

  function openDirections() {
    if (place.directionsUrl) {
      void Linking.openURL(place.directionsUrl);
      return;
    }
    const query = encodeURIComponent([place.name, place.addressText].filter(Boolean).join(", "));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  function openDialer() {
    if (!place.phone) {
      return;
    }
    void Linking.openURL(`tel:${place.phone.replace(/[^\d+]/g, "")}`);
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {place.subcategoryNames.join(" · ") || "No categories"}
          </Text>
        </View>
        {/* Distance only. Recommended moved down to the action row, where it
            reads as a property OF the place rather than a label over its name. */}
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          {place.distanceKm != null ? (
            <View style={{ alignItems: "center", backgroundColor: colors.jadeSoft, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
              <Navigation color={colors.jade} fill={colors.jade} size={10} strokeWidth={2} />
              <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 11, fontVariant: ["tabular-nums"], }}>
                {place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m away` : `${place.distanceKm.toFixed(1)} km away`}
              </Text>
            </View>
          ) : manage ? (
            <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
              <MapPin color={colors.muted} size={10} strokeWidth={2.4} />
              <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, }}>
                {pinned ? "Pinned" : "Not pinned"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {place.addressText ? (
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <MapPin color={colors.muted} size={13} strokeWidth={2.2} style={{ marginTop: 2.5 }} />
          <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]} numberOfLines={2}>
            {place.addressText}
          </Text>
        </View>
      ) : null}

      {place.description ? (
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <Info color={colors.muted} size={13} strokeWidth={2.2} style={{ marginTop: 2.5 }} />
          <Text style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 18 }]} numberOfLines={3}>
            {place.description}
          </Text>
        </View>
      ) : null}

      {/* View mode: Call + Directions. Manage mode: only Edit/Remove. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        {!manage ? (
          <>
            <CardButton
              disabled={!place.phone}
              icon={<Phone color={place.phone ? colors.jade : colors.muted} size={13} strokeWidth={2.4} />}
              label={place.phone ? "Call" : "No number"}
              onPress={openDialer}
              tint={place.phone ? colors.jade : colors.muted}
            />
            <CardButton icon={<MaterialCommunityIcons color={colors.primary} name="directions" size={17} />} label="Directions" onPress={openDirections} tint={colors.primary} />
          </>
        ) : null}
        {onEdit ? <CardButton icon={<Pencil color={colors.primary} size={13} strokeWidth={2.4} />} label="Edit" onPress={onEdit} tint={colors.primary} /> : null}
        {onDelete ? <CardButton icon={<Trash2 color={colors.danger} size={13} strokeWidth={2.4} />} label="Remove" onPress={onDelete} tint={colors.danger} /> : null}
        {/* Last in the row in BOTH modes, so it trails Directions when viewing
            and Remove when managing. It is a state of the place, not an action,
            hence a plain chip rather than a CardButton. */}
        {place.ownerRecommended ? (
          <View
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderRadius: 10,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.xs,
              paddingHorizontal: spacing.sm,
              paddingVertical: 6,
            }}
          >
            <Star color={colors.ink} fill={colors.ink} size={12} strokeWidth={2} />
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>Recommended</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function CardButton({ disabled, icon, label, onPress, tint }: { disabled?: boolean; icon: ReactNode; label: string; onPress: () => void; tint: string }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, opacity: disabled ? 0.5 : 1, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
    >
      {icon}
      <Text style={{ color: tint, fontFamily: fonts.sansBold, fontSize: 12, }}>{label}</Text>
    </AnimatedPressable>
  );
}
