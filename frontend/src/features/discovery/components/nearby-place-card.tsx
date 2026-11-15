import { useState, type ReactNode } from "react";
import { openDialer } from "@/lib/dial";
import { Image, Linking, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Eye, ImageOff, Info, MapPin, Navigation, Pencil, Phone, Star } from "lucide-react-native";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";
import { WrapTitle } from "@/components/wrap-title";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { ImageCarousel } from "@/components/image-carousel";
import { formatIndianPhone } from "@/features/owner/phone-display";
import type { PropertyLocalPlace } from "@/store/services/discovery-api";
import { cardShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

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
  const [viewing, setViewing] = useState(false);

  function openDirections() {
    if (place.directionsUrl) {
      void Linking.openURL(place.directionsUrl);
      return;
    }
    const query = encodeURIComponent([place.name, place.addressText].filter(Boolean).join(", "));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  function callPlace() {
    if (!place.phone) {
      return;
    }
    openDialer(place.phone);
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...cardShadow(colors.shadow) }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        {/* Its photo, or the No image placeholder (user, 2026-11-07). */}
        <PlacePhoto size={64} uri={place.photoUrl} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {/* A recommended place carries a star before its name rather than a
              chip in the button row (user, 2026-09-27). A long name scrolls
              instead of being cut off. */}
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 6 }}>
            {place.ownerRecommended ? (
              <Star accessibilityLabel="Recommended" color={colors.accent} fill={colors.accent} size={14} strokeWidth={2} style={{ marginTop: 3 }} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <WrapTitle style={[type.bodyStrong, { color: colors.ink }]}>{place.name}</WrapTitle>
            </View>
          </View>
          {/* The distance on the categories line, to their right, as plain words with no pill (user, 2026-11-07). */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          {/* Plain text: a FitText in this row measured it narrow and shrank the words. */}
          <Text style={[type.caption, { color: colors.muted, flexShrink: 1 }]} numberOfLines={1}>
            {place.subcategoryNames.join(" · ") || "No categories"}
          </Text>
          {place.distanceKm != null ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Navigation color={colors.jade} fill={colors.jade} size={10} strokeWidth={2} />
              <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 11, fontVariant: ["tabular-nums"], }}>
                {place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m away` : `${place.distanceKm.toFixed(1)} km away`}
              </Text>
            </View>
          ) : manage ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <MapPin color={colors.muted} size={10} strokeWidth={2.4} />
              <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, }}>
                {pinned ? "Pinned" : "Not pinned"}
              </Text>
            </View>
          ) : null}
          </View>
        </View>
      </View>

      {place.addressText ? (
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <MapPin color={colors.muted} size={13} strokeWidth={2.2} style={{ marginTop: 2.5 }} />
          <FitText style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]} numberOfLines={2}>
            {place.addressText}
          </FitText>
        </View>
      ) : null}

      {place.description ? (
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <Info color={colors.muted} size={13} strokeWidth={2.2} style={{ marginTop: 2.5 }} />
          <FitText style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 18 }]} numberOfLines={3}>
            {place.description}
          </FitText>
        </View>
      ) : null}

      {/* View mode: Call + Directions. Manage mode: only Edit/Remove. */}
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, width: "100%" }}>
        {!manage ? (
          <>
            <CardButton
              disabled={!place.phone}
              icon={<Phone color={place.phone ? colors.jade : colors.muted} size={13} strokeWidth={2.4} />}
              label={place.phone ? "Call" : "No number"}
              onPress={callPlace}
              tint={place.phone ? colors.jade : colors.muted}
            />
            <CardButton icon={<MaterialCommunityIcons color={colors.primary} name="directions" size={17} />} label="Directions" onPress={openDirections} tint={colors.primary} />
            {/* The whole place in a bottom-up sheet, owners and tenants alike (user, 2026-11-14). */}
            <CardButton icon={<Eye color={colors.primary} size={14} strokeWidth={2.4} />} label="View" onPress={() => setViewing(true)} tint={colors.primary} />
          </>
        ) : null}
        {onEdit ? <CardButton icon={<Pencil color={colors.primary} size={13} strokeWidth={2.4} />} label="Edit" onPress={onEdit} tint={colors.primary} /> : null}
        {onDelete ? <CardButton icon={<Trash2 color={colors.danger} size={13} strokeWidth={2.4} />} label="Remove" onPress={onDelete} tint={colors.danger} /> : null}
      </View>
      {viewing ? <NearbyPlaceModal onClose={() => setViewing(false)} place={place} /> : null}
    </View>
  );
}

/**
 * A place in full, as a bottom-up sheet (user, 2026-11-14; a centred modal
 * before): its name and categories in the title, its photos across the sheet's
 * width, then the address, the phone and the description.
 */
function NearbyPlaceModal({ onClose, place }: { onClose: () => void; place: PropertyLocalPlace }) {
  const { colors, type } = useTheme();
  const photos = place.photoUrl ? [place.photoUrl] : [];
  type Row = { icon: ReactNode; text: string };
  const rows = ([] as (Row | null)[]).concat([
    place.addressText ? { icon: <MapPin color={colors.muted} size={15} strokeWidth={2.2} />, text: place.addressText } : null,
    place.phone ? { icon: <Phone color={colors.muted} size={15} strokeWidth={2.2} />, text: formatIndianPhone(place.phone) } : null,
    place.description ? { icon: <Info color={colors.muted} size={15} strokeWidth={2.2} />, text: place.description } : null,
  ]).filter((row): row is Row => row !== null);

  return (
    <SheetShell
      belowTitle={
        place.subcategoryNames.length > 0 ? (
          <Text style={[type.modalDescription, { color: colors.muted }]}>{place.subcategoryNames.join(" · ")}</Text>
        ) : undefined
      }
      onClose={onClose}
      size="content"
      title={place.name}
    >
      <View style={{ gap: spacing.md }}>
        {photos.length > 0 ? <ImageCarousel height={170} images={photos} radius={radii.card} /> : <PlacePhoto height={150} uri={null} />}
        {rows.map((row) => (
          <View key={row.text} style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ paddingTop: 2 }}>{row.icon}</View>
            <Text style={[type.modalDescription, { color: colors.inkSoft, flex: 1 }]}>{row.text}</Text>
          </View>
        ))}
        {rows.length === 0 ? (
          <Text style={[type.modalDescription, { color: colors.muted }]}>No address, phone or description added yet.</Text>
        ) : null}
      </View>
    </SheetShell>
  );
}

/** A place's photo, or the No image placeholder the property cards use. Full width without a size. */
function PlacePhoto({ height, size, uri }: { height?: number; size?: number; uri: string | null }) {
  const { colors, fonts } = useTheme();
  const box = size
    // Squarer corners than the card's (user, 2026-11-07).
    ? { borderColor: colors.border, borderCurve: "continuous" as const, borderRadius: 6, borderWidth: 1, height: size, width: size }
    : { borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, height: height ?? 210, width: "100%" as const };
  if (uri) {
    return <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{ uri }} style={{ backgroundColor: colors.surfaceSunken, ...box }} />;
  }
  const small = Boolean(size);
  return (
    <View accessibilityLabel="No image" style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, gap: small ? 2 : 6, justifyContent: "center", ...box }}>
      <ImageOff color={colors.kicker} size={small ? 18 : 30} strokeWidth={1.9} />
      <Text style={{ color: colors.kicker, fontFamily: fonts.sansBold, fontSize: small ? 9 : 12, letterSpacing: 0.4 }}>No image</Text>
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
