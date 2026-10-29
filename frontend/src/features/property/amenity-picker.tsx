import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, Info } from "lucide-react-native";
import { ItemIcon } from "@/features/property/item-icon";
import { SectionHeading } from "@/components/section-heading";

import { AnimatedPressable } from "@/components/animated-pressable";

import { ROOM_AMENITY_ICONS, type AmenityIconProps } from "@/features/property/room-amenity-icons";
import { useGetPropertyExitPoliciesQuery, useListMyPropertiesQuery, type RoomAmenity, type RoomConditioning } from "@/store/services/property-api";
import { useAppSelector } from "@/store/hooks";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

export const MAX_CUSTOM_AMENITIES = 50;
export const MAX_CUSTOM_AMENITY_LENGTH = 80;

export const AMENITY_LABELS: Record<RoomAmenity, string> = {
  ATTACHED_TOILET: "Attached toilet",
  BEDDING: "Bedding",
  COMMON_TOILET: "Common toilet",
  CUPBOARD: "Cupboard",
  GEYSER: "Geyser",
  TV: "TV",
};

/**
 * What a room comes with, picked from the damage list (user, 2026-10-29): its
 * Room items and, where bathrooms are attached, its Bathroom items. That list
 * is the one list of what a room can have, so anything new is added there, on
 * Exit policies. AC and the toilet stay answered and not answerable: the
 * variant decides one, the property's bathroom type the other.
 *
 * <p>A pick whose name is one of the old amenities (Cupboard, TV, Geyser,
 * Bedding) is saved as that amenity, so listings keep its picture; any other
 * is saved by name.
 */
export function AmenityPicker({
  amenities,
  conditioning,
  customAmenities,
  error,
  headingBand = false,
  onChangeAmenities,
  onChangeCustom,
}: {
  amenities: RoomAmenity[];
  /** Said under the lists: at least one amenity is needed (room type sheet, 2026-10-29). */
  error?: string;
  /** The app's subheading band for its title, where the screen is divided by them (room type sheet, 2026-10-29). */
  headingBand?: boolean;
  /** Decides the AC row, which is shown answered and not answerable. */
  conditioning: RoomConditioning;
  customAmenities: string[];
  onChangeAmenities: (next: RoomAmenity[]) => void;
  onChangeCustom: (next: string[]) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const router = useRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const bathroomType = propertiesQuery.data?.find((property) => property.id === selectedPropertyId)?.bathroomType ?? "ATTACHED";
  const policiesQuery = useGetPropertyExitPoliciesQuery(selectedPropertyId ?? "", { skip: !selectedPropertyId });
  const list = policiesQuery.data?.damageCharges ?? [];

  const enumFor = (name: string) =>
    (Object.keys(AMENITY_LABELS) as RoomAmenity[]).find(
      (amenity) => amenity !== "ATTACHED_TOILET" && amenity !== "COMMON_TOILET" && AMENITY_LABELS[amenity].toLowerCase() === name.toLowerCase(),
    );
  const picked = (name: string) => {
    const amenity = enumFor(name);
    return amenity ? amenities.includes(amenity) : customAmenities.some((item) => item.toLowerCase() === name.toLowerCase());
  };
  function toggle(name: string) {
    const amenity = enumFor(name);
    if (amenity) {
      onChangeAmenities(amenities.includes(amenity) ? amenities.filter((item) => item !== amenity) : [...amenities, amenity]);
      return;
    }
    onChangeCustom(
      customAmenities.some((item) => item.toLowerCase() === name.toLowerCase())
        ? customAmenities.filter((item) => item.toLowerCase() !== name.toLowerCase())
        : [...customAmenities, name],
    );
  }

  // Two sections (user, 2026-10-29): the room's things, and the bathroom's, from
  // the attached bathroom's list or the common toilet's, by the bathroom type.
  const roomItems = list.filter((item) => item.category === "ROOM" || item.category === "AMENITY").map((item) => item.name);
  const bathroomCategory = bathroomType === "COMMON" ? "COMMON_TOILET" : "BATHROOM";
  const bathroomItems = list.filter((item) => item.category === bathroomCategory).map((item) => item.name);

  // Each section its own box, headed and ruled off, so Room and Bathroom read as two lists (user, 2026-10-29).
  const group = (title: string, fixed: React.ReactNode, names: string[]) => (
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        <View style={{ backgroundColor: colors.surfaceSunken, borderBottomColor: colors.border, borderBottomWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15 }}>{title}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", padding: spacing.md, rowGap: spacing.sm }}>
          {fixed}
          {names.map((name) => {
            const amenity = enumFor(name);
            return (
              <AmenityCell
                icon={({ color, size }) => <ItemIcon color={color} name={name} size={size} />}
                key={name}
                label={name}
                on={picked(name)}
                onPress={() => toggle(name)}
              />
            );
          })}
        </View>
      </View>
    );

  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      {headingBand ? (
        <SectionHeading title="Amenities" trailing={<Text style={{ color: colors.danger, fontSize: 18 }}>*</Text>} trailingInline />
      ) : (
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Amenities</Text>
      )}

      <View style={{ gap: spacing.md }}>
        {/* AC and the toilet are answered elsewhere (the variant, the bathroom
            type) and lead their sections, fixed. */}
        {group(
          "Room",
          // The variant's own thing, ticked and fixed: AC, or a fan on a non-AC room (user, 2026-10-29).
          <AmenityCell
            icon={({ color, size }) => <ItemIcon color={color} name={conditioning === "AC" ? "AC" : "Fan"} size={size} />}
            label={conditioning === "AC" ? "AC" : "Fan"}
            locked
            on
          />,
          roomItems,
        )}
        {group(
          bathroomType === "COMMON" ? "Common toilet" : "Attached bathroom",
          // The section is the common toilet; it is not an item in its own list (user, 2026-10-29).
          bathroomType === "COMMON" ? null : (
            <AmenityCell
              icon={({ color, size }) => <ItemIcon color={color} name="Toilet" size={size} />}
              label="Attached toilet"
              locked
              on
            />
          ),
          bathroomItems,
        )}

        {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
        {/* New things are added to the one list, not here (user, 2026-10-29). */}
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <Info color={colors.muted} size={14} strokeWidth={2.2} style={{ marginTop: 2 }} />
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
            Something missing? Add it under{" "}
            <Text
              accessibilityRole="link"
              onPress={() => router.push("/owner-exit-policies")}
              style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, textDecorationLine: "underline" }}
            >
              Item catalogue &amp; Damages
            </Text>.
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * One amenity: the tick, the picture, the word — in that order.
 *
 * <p>The tick leads because the grid is read down the checkboxes to see what is
 * on, not down the labels to see what exists. Half-width so three rows fill two
 * columns.
 */
function AmenityCell({
  icon: Icon,
  label,
  locked,
  on,
  onPress,
}: {
  icon: (props: AmenityIconProps) => React.ReactElement;
  label: string;
  /** True for AC, which the variant decides. Shown, greyed, and not tappable. */
  locked?: boolean;
  on: boolean;
  onPress?: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={{
        alignItems: "center",
        flexDirection: "row",
        // Tighter than the row gap: the tick, the picture and the word are one
        // thing, and at the row's spacing "Attached toilet" lost its tail.
        gap: 7,
        // Fixed, so a two-line label does not make its row taller than the
        // others. Two rows of ticks at different heights read as two lists.
        minHeight: 34,
        opacity: locked ? 0.5 : 1,
        // Just under half. The row's space-between turns what is left into the
        // gutter between the columns.
        width: "48%",
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: on ? colors.jade : "transparent",
          borderColor: on ? colors.jade : colors.borderStrong,
          borderRadius: 5,
          borderWidth: 1.5,
          height: 21,
          justifyContent: "center",
          width: 21,
        }}
      >
        {on ? <Check color={colors.surface} size={14} strokeWidth={3.2} /> : null}
      </View>

      <Icon color={on ? colors.inkSoft : colors.kicker} size={18} />

      {/* Two lines, not one. A percentage-width column cannot promise that the
          longest label fits at every screen width, and "Attached toile…" is a
          worse answer than a word wrapping. The cell's fixed height keeps the
          grid aligned when one does. */}
      <FitText
        numberOfLines={2}
        style={{ color: on ? colors.ink : colors.muted, flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 15 }}
      >
        {label}
      </FitText>
    </AnimatedPressable>
  );
}
