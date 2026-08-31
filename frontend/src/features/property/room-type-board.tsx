import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Bed, Pencil, Plus, Trash2, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { UnderlineTabs } from "@/components/underline-tabs";
import { NoticeBar, formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import {
  ROOM_CONDITIONINGS,
  ROOM_TYPES,
  type RoomAmenity,
  type RoomConditioning,
  type RoomType,
  type RoomTypeImage,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One room type as the board shows it.
 *
 * <p>Deliberately not `RoomMold`: the same board renders types that are only
 * drafts in the registration wizard, where no property exists yet to hang a
 * mold on. A saved `RoomMold` satisfies this shape as it stands, so the
 * standalone screen passes its molds straight through.
 */
export type RoomTypeEntry = {
  amenities: RoomAmenity[];
  baseRentPaise: number;
  bedCount: number;
  conditioning: RoomConditioning;
  customAmenities: string[];
  images: RoomTypeImage[];
  /** The mold's id when saved; any stable local key while still a draft. */
  id: string;
  /** Rooms already cut from it. Always 0 for a draft. */
  roomCount: number;
  sharingType: RoomType;
};

/**
 * What the board is for, in the two lines that actually change a decision.
 *
 * <p>Lives here so the wizard step and the standalone screen say the same
 * thing — the second line in particular, which is the whole reason there are
 * two variants rather than an AC tickbox on one.
 */
export const ROOM_TYPE_INTRO = [
  "Every room is cut from one of these, so its rent and fittings are set once here.",
  "AC and non-AC are separate types — they do not rent for the same money.",
];

/** Names the exact type being removed — a dorm slot can hold several sizes. */
export function removalTitle(entry: RoomTypeEntry) {
  const variant = entry.conditioning === "AC" ? "AC" : "non-AC";
  const size = entry.sharingType === "DORMITORY" ? `${entry.bedCount}-bed ` : "";
  return `Remove ${variant} ${size}${humanizeToken(entry.sharingType).toLowerCase()}?`;
}

export function removalMessage(entry: RoomTypeEntry) {
  if (entry.roomCount === 0) {
    return "It will stop being offered when you create rooms.";
  }
  // Retire, not delete: the mold is what says what those rooms ARE.
  return `${entry.roomCount} ${entry.roomCount === 1 ? "room was" : "rooms were"} cut from this type. They keep working — this only stops it being offered for new rooms.`;
}

/** Short enough that five of them share a phone's width without ellipsising. */
const TAB_LABELS: Record<RoomType, string> = {
  DORMITORY: "Dorm",
  DOUBLE: "Double",
  FOUR_SHARING: "Four",
  SINGLE: "Single",
  TRIPLE: "Triple",
};

/**
 * How many beds to draw for each occupancy.
 *
 * <p>A dormitory draws three and a plus rather than its real count: the count is
 * the owner's to choose and differs per type, so any number here would be a
 * lie about some of them. Three-and-more is the honest shape.
 */
const TAB_BEDS: Record<RoomType, number> = {
  DORMITORY: 3,
  DOUBLE: 2,
  FOUR_SHARING: 4,
  SINGLE: 1,
  TRIPLE: 3,
};

/**
 * The room types of one property, one occupancy per tab.
 *
 * <p>Shared by the registration wizard and the standalone room types screen,
 * which show the same thing over different storage — drafts in memory before
 * the property exists, molds on the server after. Two copies of this would have
 * disagreed on the first change to either.
 *
 * <p>Tabs rather than one long list because the two variants of an occupancy are
 * priced against each other and want to be side by side, while a double and a
 * dormitory have nothing to say to one another.
 */
export function RoomTypeBoard({
  entries,
  occupancies,
  onCreate,
  onEdit,
  onRemove,
}: {
  entries: RoomTypeEntry[];
  occupancies: RoomType[];
  onCreate: (sharingType: RoomType, conditioning: RoomConditioning) => void;
  onEdit: (entry: RoomTypeEntry) => void;
  onRemove: (entry: RoomTypeEntry) => void;
}) {
  const { colors, type } = useTheme();

  // In the order the app always lists occupancies, not the order they happen to
  // have been ticked in — the tabs should not move between two properties.
  const tabs = useMemo(() => ROOM_TYPES.filter((option) => occupancies.includes(option)), [occupancies]);

  const [active, setActive] = useState<RoomType | null>(null);
  const tab = active && tabs.includes(active) ? active : tabs[0] ?? null;

  /**
   * Every type in one slot — usually none or one.
   *
   * <p>A list rather than a single type because the server keys uniqueness on
   * the bed count too, so a property may offer a 6-bed and a 10-bed AC dorm at
   * once. They do not rent for the same money, so they are two types. Taking
   * only the first here would hide the second and quietly edit the wrong one.
   */
  function slot(sharingType: RoomType, conditioning: RoomConditioning) {
    return entries
      .filter((entry) => entry.sharingType === sharingType && entry.conditioning === conditioning)
      .sort((left, right) => left.bedCount - right.bedCount);
  }

  if (tab == null) {
    return (
      <Card>
        <Text style={[type.body, { color: colors.muted }]}>
          No occupancies were chosen for this property, so there is nothing to configure. Pick them in Rooms &
          inclusions first.
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <UnderlineTabs
        active={tab}
        bleed={spacing.lg}
        onChange={setActive}
        options={tabs.map((option) => ({
          // Ticked once EITHER variant exists: a property may well let a double
          // as non-AC only, and a tab that never completes reads as an error
          // the owner cannot clear.
          done: ROOM_CONDITIONINGS.some((variant) => slot(option, variant).length > 0),
          icon: <BedCount occupancy={option} selected={option === tab} />,
          label: TAB_LABELS[option],
          value: option,
        }))}
      />

      {ROOM_CONDITIONINGS.map((conditioning) => (
        <VariantSection
          conditioning={conditioning}
          entries={slot(tab, conditioning)}
          key={conditioning}
          // Only a dormitory can hold more than one, and only because its bed
          // count is the owner's to choose.
          multiple={tab === "DORMITORY"}
          onCreate={() => onCreate(tab, conditioning)}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}

      {/* Only while this occupancy has nothing. Standing permanently under a
          tab that is already done would make it wallpaper, and it is the empty
          tab where the rule is worth stating. */}
      {ROOM_CONDITIONINGS.every((variant) => slot(tab, variant).length === 0) ? (
        <NoticeBar
          // The full name, not the tab's abbreviation: "no four sharing room"
          // reads, "no four room" does not.
          message={`Create the AC or the non-AC one — or both. Until you do, no ${humanizeToken(
            tab,
          ).toLowerCase()} room can be created in this property.`}
          title="This occupancy needs at least one type"
          tone="warning"
        />
      ) : null}
    </View>
  );
}

/**
 * An occupancy drawn as the beds it means, for the tab above its label.
 *
 * <p>The beds wrap two to a row so every tab is the same height whether it draws
 * one or four — four small glyphs in a single line on a narrow phone would be a
 * smear rather than a count.
 */
function BedCount({ occupancy, selected }: { occupancy: RoomType; selected: boolean }) {
  const { colors, fonts } = useTheme();

  const tint = selected ? colors.ink : colors.kicker;

  return (
    <View
      style={{
        alignItems: "center",
        columnGap: 3,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        rowGap: 1,
        width: 36,
      }}
    >
      {Array.from({ length: TAB_BEDS[occupancy] }, (_, index) => (
        <Bed color={tint} key={index} size={14} strokeWidth={2.2} />
      ))}
      {occupancy === "DORMITORY" ? (
        <Text style={{ color: tint, fontFamily: fonts.sansBold, fontSize: 13 }}>+</Text>
      ) : null}
    </View>
  );
}

/**
 * One AC variant of one occupancy: what is configured for it, and the way to
 * add to it.
 *
 * <p>Both variants are always shown, even when only one will ever be used. An
 * empty slot is the only thing that says the other variant is possible — and it
 * says why it is worth filling, since "create the AC one too" is not obvious
 * until you know it carries its own price.
 */
function VariantSection({
  conditioning,
  entries,
  multiple,
  onCreate,
  onEdit,
  onRemove,
}: {
  conditioning: RoomConditioning;
  entries: RoomTypeEntry[];
  multiple: boolean;
  onCreate: () => void;
  onEdit: (entry: RoomTypeEntry) => void;
  onRemove: (entry: RoomTypeEntry) => void;
}) {
  const { colors, fonts, type } = useTheme();

  const label = conditioning === "AC" ? "AC" : "Non-AC";
  // Full caps on the buttons only. "AC" is an acronym and reads as one either
  // way; "Non-AC" beside it looked like a different KIND of word, so on the two
  // calls to action they are set alike.
  const shouted = conditioning === "AC" ? "AC" : "NON-AC";
  const other = conditioning === "AC" ? "non-AC" : "AC";

  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map((entry) => (
        <TypeCard entry={entry} key={entry.id} label={label} onEdit={onEdit} onRemove={onRemove} />
      ))}

      {entries.length > 0 && !multiple ? null : (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onCreate}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 16,
            borderStyle: "dashed",
            borderWidth: 1,
            gap: 2,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <Plus color={colors.ink} size={16} strokeWidth={2.6} />
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {entries.length > 0 ? `Add another ${shouted} size` : `Create ${shouted} type`}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>Priced separately from {other}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

/**
 * One configured room type.
 *
 * <p>Rent sits on the title row, opposite the variant it belongs to, rather than
 * on a line of its own. As its own headline it needed a unit spelled out beside
 * it — and a caption nested inside a 22pt display line is exactly the
 * combination Android clips, so the tail of "per bed / month" was being cut off.
 * On the title row the number needs no unit: it is the only money on the card,
 * and the sheet that sets it says what it is per.
 */
function TypeCard({
  entry,
  label,
  onEdit,
  onRemove,
}: {
  entry: RoomTypeEntry;
  label: string;
  onEdit: (entry: RoomTypeEntry) => void;
  onRemove: (entry: RoomTypeEntry) => void;
}) {
  const { colors, fonts, type } = useTheme();

  const amenityCount = entry.amenities.length + entry.customAmenities.length;

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>{label}</Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
          {formatMoneyPaise(entry.baseRentPaise)}
        </Text>
      </View>

      <Text style={[type.caption, { color: colors.muted }]}>
        {entry.bedCount} {entry.bedCount === 1 ? "bed" : "beds"} · {amenityCount}{" "}
        {amenityCount === 1 ? "amenity" : "amenities"}
        {entry.roomCount > 0 ? ` · ${entry.roomCount} ${entry.roomCount === 1 ? "room" : "rooms"}` : ""}
      </Text>

      {/* Stated either way. A silent card gives a type with no photos the same
          face as one with six, and "no photos yet" is the nudge — worded as an
          outstanding thing rather than a fault, because photos are optional. */}
      <Text
        style={[
          type.caption,
          { color: entry.images.length > 0 ? colors.muted : colors.accent },
        ]}
      >
        {entry.images.length > 0
          ? `${entry.images.length} ${entry.images.length === 1 ? "photo" : "photos"}`
          : "No photos yet"}
      </Text>

      {/* Named, not bare glyphs. Two unlabelled discs in the corner made the
          destructive one a coin toss at a glance; the words are the difference
          between reading the card and remembering the icons. */}
      <View style={{ flexDirection: "row", gap: spacing.lg }}>
        <CardAction color={colors.primary} icon={Pencil} label="Edit" onPress={() => onEdit(entry)} />
        <CardAction color={colors.danger} icon={Trash2} label="Remove" onPress={() => onRemove(entry)} />
      </View>
    </Card>
  );
}

function CardAction({
  color,
  icon: Icon,
  label,
  onPress,
}: {
  color: string;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 5 }}
    >
      <Icon color={color} size={14} strokeWidth={2.4} />
      <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
  );
}
