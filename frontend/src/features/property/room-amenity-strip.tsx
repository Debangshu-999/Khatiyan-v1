import { Text, View } from "react-native";

import { ROOM_AMENITY_ICONS } from "@/features/property/room-amenity-icons";
import { ROOM_AMENITIES, type RoomAmenity } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const AMENITY_LABELS: Record<RoomAmenity, string> = {
  ATTACHED_TOILET: "Attached toilet",
  BEDDING: "Bedding",
  CUPBOARD: "Cupboard",
  GEYSER: "Geyser",
  TV: "TV",
};

/**
 * What a room comes with, as a row of glyphs.
 *
 * <p>Icons rather than the ticked grid the forms use: on a card in a list this
 * answers "does it have a geyser" at a glance, and six labelled rows would be
 * taller than the bed tiles above it. Absent amenities are drawn faint rather
 * than omitted, so the row is the same shape on every card and the eye can run
 * down a column of rooms comparing the same positions.
 *
 * <p>No AC glyph: the card already carries an AC / Non-AC chip beside the room
 * number, and the same fact stated twice on one card is a reader wondering
 * which of the two is authoritative.
 */
export function RoomAmenityStrip({
  amenities,
  custom,
}: {
  amenities: RoomAmenity[];
  custom: string[];
}) {
  const { colors, fonts, type } = useTheme();

  const on = (amenity: RoomAmenity) => amenities.includes(amenity);

  return (
    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {ROOM_AMENITIES.map((amenity) => {
        const Icon = ROOM_AMENITY_ICONS[amenity];
        return (
          <Glyph key={amenity} label={AMENITY_LABELS[amenity]} on={on(amenity)}>
            <Icon color={on(amenity) ? colors.inkSoft : colors.border} size={17} />
          </Glyph>
        );
      })}

      {custom.length > 0 ? (
        <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>
          +{custom.length}
        </Text>
      ) : null}
    </View>
  );
}

function Glyph({ children, label, on }: { children: React.ReactNode; label: string; on: boolean }) {
  return (
    <View
      accessibilityLabel={`${label}: ${on ? "yes" : "no"}`}
      accessible
      style={{ alignItems: "center", height: 20, justifyContent: "center", width: 20 }}
    >
      {children}
    </View>
  );
}
