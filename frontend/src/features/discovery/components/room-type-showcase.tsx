import { useState } from "react";
import { Text, View } from "react-native";
import { AirVent, ChevronDown, Fan, Images } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ImageCarousel } from "@/components/image-carousel";
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

/** How tall a room type's own photos are. Smaller than the property's hero. */
const PHOTO_HEIGHT = 150;

/**
 * The room types a property offers, one occupancy at a time.
 *
 * <p>Grouped by SHARING SIZE, not one card per type: an AC double and a non-AC
 * double are the same room at two prices, and the question a reader is asking is
 * "what does a double cost here" — so the two belong together, where the
 * difference is a number rather than a scroll.
 *
 * <p>Chosen from a picker rather than swiped through. A pager made the reader
 * discover what was on offer by exhausting it, gave no way back to a size they
 * had passed, and — because every page carries a photo strip — turned a section
 * of a profile into most of its height. The picker names every size up front and
 * shows one.
 *
 * <p>The SMALLEST occupancy on offer is shown by default. A section that opened
 * empty made a reader work to see anything at all, and the smallest room is both
 * the cheapest and the one most people are asking about — `ROOM_TYPES` runs from
 * single upward, so the first available option is that one.
 */
export function RoomTypeShowcase({ roomTypes }: { roomTypes: RoomMold[] }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  const occupancies = ROOM_TYPES.filter((option) => roomTypes.some((mold) => mold.sharingType === option));

  const [chosen, setChosen] = useState<RoomType | null>(null);

  // Shown rather than hidden. A property that has published nothing here is a
  // fact worth stating — a section that simply vanishes leaves a reader unsure
  // whether the rooms are unlisted or the page is broken.
  if (occupancies.length === 0) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xl,
        }}
      >
        <Images color={colors.kicker} size={28} strokeWidth={1.8} />
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16, textAlign: "center" }}>
          Room types not listed yet
        </Text>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 19, textAlign: "center" }]}>
          The owner has not published what each room costs. Ask them using the enquiry above.
        </Text>
      </View>
    );
  }

  // Derived below the guard, where the list is known non-empty, and derived
  // rather than defaulted in useState — that would capture the first render's
  // list and keep showing an occupancy a later fetch removed. A size is always
  // on screen, so there is nothing to dismiss: the picker changes which.
  const shown = chosen && occupancies.includes(chosen) ? chosen : occupancies[0];

  const variantsOf = (occupancy: RoomType) =>
    roomTypes
      .filter((mold) => mold.sharingType === occupancy)
      // AC first, then by beds — a dormitory may come in several sizes.
      .sort((left, right) =>
        left.conditioning === right.conditioning
          ? left.bedCount - right.bedCount
          : left.conditioning === "AC"
            ? -1
            : 1,
      );

  return (
    <View style={{ gap: spacing.sm }}>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 8,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14.5 }}>
          {humanizeToken(shown)}
        </Text>
        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </AnimatedPressable>

      <OccupancyPage occupancy={shown} variants={variantsOf(shown)} />

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Room type">
          <View>
            {occupancies.map((occupancy, index) => {
              const variants = variantsOf(occupancy);
              const cheapest = Math.min(...variants.map((mold) => mold.baseRentPaise));
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
                  // What is on offer at this size, so the choice can be made
                  // from the list rather than by opening each one in turn.
                  subtitle={`${variants.length} ${variants.length === 1 ? "option" : "options"} · from ${formatMoneyPaise(cheapest)}`}
                />
              );
            })}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}

/**
 * One occupancy, with BOTH variants accounted for.
 *
 * <p>A size the property offers in only one variant used to leave white space
 * where the other would be. Saying "no AC rooms in this size" fills it with
 * something true — and it is a real answer to a question a reader is asking,
 * since somebody who wants air conditioning needs to know it is not on offer
 * here rather than assume the page is incomplete.
 */
function OccupancyPage({ occupancy, variants }: { occupancy: RoomType; variants: RoomMold[] }) {
  const { colors, fonts } = useTheme();

  const byVariant = {
    AC: variants.filter((mold) => mold.conditioning === "AC"),
    NON_AC: variants.filter((mold) => mold.conditioning === "NON_AC"),
  } as const;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {/* No close control. One size is always shown, so there is nothing for a
          cross to reveal — the picker above changes which, and that is the only
          thing a reader wants to do here. */}
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>
        {humanizeToken(occupancy)}
      </Text>

      {/* No flex weighting on these blocks. The pager needed every page to be
          the height of the tallest, so a size with one variant stretched to
          fill; with one card on screen at a time there is nothing to equalise
          against. */}
      {(["AC", "NON_AC"] as const).map((conditioning, index) => (
        <View key={conditioning} style={{ gap: spacing.sm }}>
          {index > 0 ? <View style={{ backgroundColor: colors.border, height: 1 }} /> : null}
          {byVariant[conditioning].length > 0 ? (
            byVariant[conditioning].map((mold) => <VariantBlock key={mold.id} mold={mold} />)
          ) : (
            <MissingVariant conditioning={conditioning} occupancy={occupancy} />
          )}
        </View>
      ))}
    </View>
  );
}

/** The variant this size is NOT offered in. */
function MissingVariant({ conditioning, occupancy }: { conditioning: "AC" | "NON_AC"; occupancy: RoomType }) {
  const { colors, fonts, type } = useTheme();

  const Variant = conditioning === "AC" ? AirVent : Fan;
  const label = conditioning === "AC" ? "AC" : "Non-AC";

  return (
    <View style={{ alignItems: "center", gap: 6, justifyContent: "center", paddingVertical: spacing.lg }}>
      <Variant color={colors.border} size={24} strokeWidth={1.8} />
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>
        No {label} option
      </Text>
      <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
        This property does not offer {humanizeToken(occupancy).toLowerCase()} rooms with{" "}
        {conditioning === "AC" ? "air conditioning" : "no air conditioning"}.
      </Text>
    </View>
  );
}

function VariantBlock({ mold }: { mold: RoomMold }) {
  const { colors, fonts, type } = useTheme();

  const Variant = mold.conditioning === "AC" ? AirVent : Fan;
  const amenities = ROOM_AMENITIES.filter((amenity) => mold.amenities.includes(amenity));
  const images = mold.images.map((image) => image.url);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Variant color={colors.inkSoft} size={18} strokeWidth={2} />
        <Text style={{ color: colors.text, flex: 1, fontFamily: fonts.sansBold, fontSize: 15 }}>
          {mold.conditioning === "AC" ? "AC" : "Non-AC"}
        </Text>
        {/* The unit sits with the number it qualifies. On its own line below,
            "per bed, per month" read as a second fact about the room rather
            than as part of the price. Two Texts on a shared baseline, not one
            nested in the other — a small caption inside a display line takes
            that line's metrics and Android clips its descenders. */}
        <View style={{ alignItems: "baseline", flexDirection: "row", gap: 2 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 17 }}>
            {formatMoneyPaise(mold.baseRentPaise)}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>/month</Text>
        </View>
      </View>

      <Text style={[type.caption, { color: colors.muted }]}>
        {mold.bedCount} {mold.bedCount === 1 ? "bed" : "beds"}
      </Text>

      {/* The property's own carousel at a section's scale, or an empty state
          the same size. Omitting the photos entirely left a reader unsure
          whether the type has none or the page failed — and it made the pages
          different heights, so the pager jumped as it scrolled. */}
      {images.length > 0 ? (
        <ImageCarousel height={PHOTO_HEIGHT} images={images} radius={12} />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderCurve: "continuous",
            borderRadius: 12,
            gap: 6,
            height: PHOTO_HEIGHT,
            justifyContent: "center",
            paddingHorizontal: spacing.md,
          }}
        >
          <Images color={colors.kicker} size={26} strokeWidth={1.8} />
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            No photos of this room type yet
          </Text>
        </View>
      )}

      {amenities.length > 0 || mold.customAmenities.length > 0 ? (
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {amenities.map((amenity) => {
            const Icon = ROOM_AMENITY_ICONS[amenity];
            return (
              <View
                accessibilityLabel={AMENITY_LABELS[amenity]}
                accessible
                key={amenity}
                style={{ alignItems: "center", flexDirection: "row", gap: 5 }}
              >
                <Icon color={colors.inkSoft} size={16} />
                <Text style={[type.caption, { color: colors.muted }]}>{AMENITY_LABELS[amenity]}</Text>
              </View>
            );
          })}
          {mold.customAmenities.map((name) => (
            <Text key={name} style={[type.caption, { color: colors.muted }]}>
              {name}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
