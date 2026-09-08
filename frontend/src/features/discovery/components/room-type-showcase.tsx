import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { AirVent, ChevronDown, Fan, ImageOff } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Lightbox } from "@/components/image-carousel";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SheetShell } from "@/components/sheet-shell";
import { ROOM_AMENITY_ICONS } from "@/features/property/room-amenity-icons";
import { ROOM_AMENITIES, ROOM_TYPES, type RoomMold, type RoomType } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { formatMoneyPaise, humanizeToken } from "../discovery-format";

const AMENITY_LABELS: Record<string, string> = {
  ATTACHED_TOILET: "Attached toilet",
  BEDDING: "Bedding",
  CUPBOARD: "Cupboard",
  GEYSER: "Geyser",
  TV: "TV",
};

export function RoomTypeShowcase({ roomTypes }: { roomTypes: RoomMold[] }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<RoomType | null>(null);
  const occupancies = ROOM_TYPES.filter((option) => roomTypes.some((room) => room.sharingType === option));

  if (occupancies.length === 0) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.xs,
          padding: spacing.xl,
        }}
      >
        <ImageOff color={colors.kicker} size={28} strokeWidth={1.7} />
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16 }}>
          Room types not listed yet
        </Text>
        <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
          Ask the property about available rooms using the enquiry above.
        </Text>
      </View>
    );
  }

  const shown = chosen && occupancies.includes(chosen) ? chosen : occupancies[0];
  const variants = roomTypes
    .filter((room) => room.sharingType === shown)
    .sort((left, right) =>
      left.conditioning === right.conditioning
        ? left.bedCount - right.bedCount
        : left.conditioning === "AC"
          ? -1
          : 1,
    );

  return (
    <View style={{ gap: spacing.md }}>
      <AnimatedPressable
        accessibilityLabel="Choose room type"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          minHeight: 54,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text style={{ color: colors.text, flex: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>
          {humanizeToken(shown)}
        </Text>
        <ChevronDown color={colors.muted} size={20} strokeWidth={2.2} />
      </AnimatedPressable>

      {variants.map((room) => (
        <RoomVariantCard key={room.id} room={room} />
      ))}

      {(["AC", "NON_AC"] as const).map((conditioning) =>
        variants.some((room) => room.conditioning === conditioning) ? null : (
          <MissingVariant conditioning={conditioning} key={conditioning} occupancy={shown} />
        ),
      )}

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Room type">
          <View>
            {occupancies.map((occupancy, index) => {
              const matching = roomTypes.filter((room) => room.sharingType === occupancy);
              const cheapest = Math.min(...matching.map((room) => room.baseRentPaise));
              return (
                <PickerOptionRow
                  first={index === 0}
                  key={occupancy}
                  label={humanizeToken(occupancy)}
                  onPress={() => {
                    setChosen(occupancy);
                    setOpen(false);
                  }}
                  selected={occupancy === shown}
                  subtitle={`${matching.length} ${matching.length === 1 ? "option" : "options"} · from ${formatMoneyPaise(cheapest)}`}
                />
              );
            })}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}

function RoomVariantCard({ room }: { room: RoomMold }) {
  const { colors, fonts, type } = useTheme();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const images = room.images.map((image) => image.url).filter(Boolean);
  const amenities = ROOM_AMENITIES.filter((amenity) => room.amenities.includes(amenity));
  const ConditioningIcon = room.conditioning === "AC" ? AirVent : Fan;
  const conditioningLabel = room.conditioning === "AC" ? "AC" : "NON AC";
  const roomLabel = `${humanizeToken(room.sharingType)} (${conditioningLabel})`;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 3, width: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        {images.length > 0 ? (
          <Pressable
            accessibilityLabel={`Open photos for ${roomLabel}`}
            accessibilityRole="button"
            onPress={() => setLightboxOpen(true)}
            style={{
              borderCurve: "continuous",
              borderRadius: radii.sm,
              height: 118,
              overflow: "hidden",
              width: 118,
            }}
          >
            <Image resizeMode="cover" source={{ uri: images[0] }} style={{ height: "100%", width: "100%" }} />
            {images.length > 1 ? (
              <View
                style={{
                  backgroundColor: "rgba(15,23,42,0.65)",
                  borderRadius: 999,
                  bottom: 7,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  position: "absolute",
                  right: 7,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10 }}>
                  1 / {images.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderCurve: "continuous",
              borderRadius: radii.sm,
              height: 118,
              justifyContent: "center",
              width: 118,
            }}
          >
            <ImageOff color={colors.kicker} size={26} strokeWidth={1.7} />
            <Text style={[type.caption, { color: colors.muted, marginTop: 5, textAlign: "center" }]}>
              No room photo
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.displaySoft, fontSize: 17, lineHeight: 22 }}>
              {humanizeToken(room.sharingType)}
            </Text>
            <ConditioningIcon color={colors.inkSoft} size={16} strokeWidth={1.9} />
            <Text style={{ color: colors.text, fontFamily: fonts.displaySoft, fontSize: 15, lineHeight: 22 }}>
              ({conditioningLabel})
            </Text>
          </View>
          <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.displaySoft, fontSize: 17 }}>
              {formatMoneyPaise(room.baseRentPaise)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>/month</Text>
          </View>
          <Text style={[type.bodyStrong, { color: colors.muted }]}>
            {room.bedCount} {room.bedCount === 1 ? "bed" : "beds"}
          </Text>
        </View>
      </View>

      {amenities.length > 0 || room.customAmenities.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {amenities.map((amenity) => {
            const Icon = ROOM_AMENITY_ICONS[amenity];
            return (
              <View key={amenity} style={{ alignItems: "center", flexDirection: "row", gap: 6, width: "46%" }}>
                <Icon color={colors.inkSoft} size={18} />
                <Text numberOfLines={2} style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
                  {AMENITY_LABELS[amenity]}
                </Text>
              </View>
            );
          })}
          {room.customAmenities.map((name) => (
            <Text key={name} style={[type.caption, { color: colors.inkSoft, width: "46%" }]}>
              {name}
            </Text>
          ))}
        </View>
      ) : null}

      {lightboxOpen ? <Lightbox images={images} initialIndex={0} onClose={() => setLightboxOpen(false)} /> : null}
    </View>
  );
}

function MissingVariant({ conditioning, occupancy }: { conditioning: "AC" | "NON_AC"; occupancy: RoomType }) {
  const { colors, fonts, type } = useTheme();
  const Variant = conditioning === "AC" ? AirVent : Fan;
  const label = conditioning === "AC" ? "AC" : "Non-AC";

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <Variant color={colors.kicker} size={30} strokeWidth={1.7} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 15 }}>
          No {label} option
        </Text>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          This property does not offer {humanizeToken(occupancy).toLowerCase()} rooms with{" "}
          {conditioning === "AC" ? "air conditioning" : "no air conditioning"}.
        </Text>
      </View>
    </View>
  );
}
