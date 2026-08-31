import { useState } from "react";
import { Text, View } from "react-native";
import { Check, Plus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { AirVent } from "lucide-react-native";

import { ROOM_AMENITY_ICONS, type AmenityIconProps } from "@/features/property/room-amenity-icons";
import { type RoomAmenity, type RoomConditioning } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export const MAX_CUSTOM_AMENITIES = 10;
export const MAX_CUSTOM_AMENITY_LENGTH = 80;

const AMENITY_LABELS: Record<RoomAmenity, string> = {
  ATTACHED_TOILET: "Attached toilet",
  BEDDING: "Bedding",
  CUPBOARD: "Cupboard",
  GEYSER: "Geyser",
  TV: "TV",
};

/**
 * Reading order across two columns, with AC sitting third.
 *
 * <p>Not `ROOM_AMENITIES` order: AC is not in that list at all — it is the
 * mold's variant — and it belongs beside the others rather than exiled above
 * them, because to whoever is ticking this grid it is one more thing the room
 * either has or does not.
 */
const AMENITY_GRID: (RoomAmenity | "AC")[] = [
  "CUPBOARD",
  "TV",
  "AC",
  "GEYSER",
  "ATTACHED_TOILET",
  "BEDDING",
];

/**
 * What a room comes with: six ticks in two columns, then anything else.
 *
 * <p>Shared by the room type sheet, which sets a type's defaults, and the add
 * rooms screen, which may differ from them for one batch. Same question in both
 * places, so the same grid.
 */
export function AmenityPicker({
  amenities,
  conditioning,
  customAmenities,
  onChangeAmenities,
  onChangeCustom,
}: {
  amenities: RoomAmenity[];
  /** Decides the AC row, which is shown answered and not answerable. */
  conditioning: RoomConditioning;
  customAmenities: string[];
  onChangeAmenities: (next: RoomAmenity[]) => void;
  onChangeCustom: (next: string[]) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  function toggle(amenity: RoomAmenity) {
    onChangeAmenities(
      amenities.includes(amenity) ? amenities.filter((item) => item !== amenity) : [...amenities, amenity],
    );
  }

  function addCustom() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    // Case-insensitive, matching the server's own dedup — otherwise "Balcony"
    // and "balcony" both survive here and only one comes back.
    if (customAmenities.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setCustomError("That is already on the list.");
      return;
    }
    if (customAmenities.length >= MAX_CUSTOM_AMENITIES) {
      setCustomError(`At most ${MAX_CUSTOM_AMENITIES} of your own.`);
      return;
    }
    onChangeCustom([...customAmenities, trimmed]);
    setDraft("");
    setCustomError(null);
  }

  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      {/* Outside the box it heads. Inside, it read as the first row of the
          block's contents rather than its name — and a heading that sits within
          the thing it names cannot also mark where that thing begins. */}
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Room Amenities</Text>

      {/* The grid is six tick rows and a chip field. Left loose among the
          inputs it read as more form, with nothing telling the eye where the
          questions stopped and the checklist began. */}
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1,
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View style={{ gap: spacing.sm }}>

        {/* Two columns of three. One column of six ran past the fold, and these
            are short labels beside a tickbox — exactly the content a full-width
            row wastes.

            The columns are spread rather than butted together: at exactly half
            width each, a long label like "Attached toilet" ran up against the
            next column's checkbox and the two read as one wrapping row. */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: spacing.sm,
          }}
        >
          {AMENITY_GRID.map((amenity) =>
            amenity === "AC" ? (
              // The variant, answered and not answerable. Leaving it out reads
              // as an omission; a tickable copy could contradict the variant.
              <AmenityCell
                icon={({ color, size }) => <AirVent color={color} size={size} strokeWidth={2} />}
                key="AC"
                label="AC"
                locked
                on={conditioning === "AC"}
              />
            ) : (
              <AmenityCell
                icon={ROOM_AMENITY_ICONS[amenity]}
                key={amenity}
                label={AMENITY_LABELS[amenity]}
                on={amenities.includes(amenity)}
                onPress={() => toggle(amenity)}
              />
            ),
          )}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[type.label, { color: colors.inkSoft }]}>Anything else</Text>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View
            style={{
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: spacing.md,
            }}
          >
            <AppTextInput
              accessibilityLabel="Other amenity"
              autoCapitalize="sentences"
              maxLength={MAX_CUSTOM_AMENITY_LENGTH}
              onChangeText={(next) => {
                setDraft(next);
                setCustomError(null);
              }}
              onSubmitEditing={addCustom}
              placeholder="Balcony, study table…"
              placeholderTextColor={colors.kicker}
              returnKeyType="done"
              style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15, minHeight: 46, paddingVertical: 0 }}
              value={draft}
            />
          </View>
          {/* Outlined with an ink glyph, not a filled slab. A solid black
              square beside a hairline input was the heaviest mark in the
              section and read as the primary action of the whole screen, which
              belongs to the button in the footer. It also breaks the app's own
              icon rule: fills are for status, outlines for actions.

              The glyph alone: beside a field whose placeholder already says
              what goes in it, the word "Add" was a third piece of text in a row
              that only does one thing. Square, so it reads as a control on the
              field rather than a button after it.

              Dimmed until there is something to add, so it stops looking like a
              button you failed to press. */}
          <AnimatedPressable
            accessibilityLabel="Add amenity"
            accessibilityRole="button"
            disabled={!draft.trim()}
            onPress={addCustom}
            style={{
              alignItems: "center",
              aspectRatio: 1,
              borderColor: draft.trim() ? colors.ink : colors.border,
              borderCurve: "continuous",
              borderRadius: 12,
              borderWidth: 1.5,
              justifyContent: "center",
            }}
          >
            <Plus color={draft.trim() ? colors.ink : colors.kicker} size={18} strokeWidth={2.6} />
          </AnimatedPressable>
        </View>
        <FieldError message={customError ?? undefined} />

        {customAmenities.length === 0 ? null : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {customAmenities.map((item) => (
              <View
                key={item}
                style={{
                  alignItems: "center",
                  borderColor: colors.border,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 6,
                  paddingLeft: spacing.sm,
                  paddingRight: 6,
                  paddingVertical: 6,
                }}
              >
                <Text style={[type.caption, { color: colors.inkSoft }]}>{item}</Text>
                <AnimatedPressable
                  accessibilityLabel={`Remove ${item}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onChangeCustom(customAmenities.filter((entry) => entry !== item))}
                >
                  <X color={colors.muted} size={13} strokeWidth={2.6} />
                </AnimatedPressable>
              </View>
            ))}
          </View>
        )}
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
      <Text
        numberOfLines={2}
        style={{ color: on ? colors.ink : colors.muted, flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 15 }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
