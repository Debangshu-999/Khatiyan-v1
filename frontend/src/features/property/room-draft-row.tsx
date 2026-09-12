import { Text, View } from "react-native";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { FormInput, formatMoneyPaise } from "@/features/owner/owner-ui";
import { AmenityPicker } from "@/features/property/amenity-picker";
import { FLOOR_PLACEHOLDER, MAX_FLOOR_DIGITS, sanitizeFloorInput } from "@/features/property/floor";
import { MoldPicker, moldLabel } from "@/features/property/mold-picker";
import type { RoomAmenity, RoomMold } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** One room being written down, before any of them are created. */
export type RoomDraft = {
  amenities: RoomAmenity[];
  customAmenities: string[];
  floor: string;
  /** Stable across removals, so an open row stays the row it was. */
  id: string;
  moldId: string | null;
  prefix: string;
  rent: string;
  roomNumber: string;
};

export type RoomDraftError = Partial<Record<"mold" | "number" | "floor" | "rent", string>>;

export function emptyDraft(seed?: Partial<RoomDraft>): RoomDraft {
  return {
    amenities: [],
    customAmenities: [],
    floor: "",
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    moldId: null,
    prefix: "",
    rent: "",
    roomNumber: "",
    ...seed,
  };
}

/** What the row's number will actually be. */
export function draftNumber(draft: RoomDraft) {
  return `${draft.prefix.trim()}${draft.roomNumber.trim()}`;
}

/**
 * Everything about one room: its type, its number, its floor, its rent and what
 * it comes with.
 *
 * <p>Used twice. In a custom list every row owns all of it, because a list is
 * for the floor that is NOT uniform — two singles, a double and a dormitory is
 * an ordinary landing, and a series cannot say that. Adding a single room asks
 * exactly the same questions, so it renders the same fields `standalone`,
 * without the card and the collapse that only a list needs.
 *
 * <p>In a list, one row is open at a time: ten rooms of open form is a wall to
 * scroll past, and the row being filled loses its heading above the fold.
 */
export function RoomDraftRow({
  draft,
  errors,
  expanded,
  index,
  molds,
  onChange,
  onRemove,
  onToggle,
  removable,
  standalone,
}: {
  draft: RoomDraft;
  errors?: RoomDraftError;
  expanded: boolean;
  index: number;
  molds: RoomMold[];
  onChange: (patch: Partial<RoomDraft>) => void;
  onRemove: () => void;
  onToggle: () => void;
  /** False for the last remaining row — a list of none is not a list. */
  removable: boolean;
  /** Fields alone: no card, no heading, no collapse. */
  standalone?: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  const mold = molds.find((option) => option.id === draft.moldId) ?? null;
  const number = draftNumber(draft);
  const faulted = errors ? Object.values(errors).some(Boolean) : false;

  const fields = (
    <View style={{ gap: spacing.md }}>
      <MoldPicker
        error={errors?.mold}
        molds={molds}
        onChange={(next) => {
          const chosen = molds.find((option) => option.id === next);
          // Rent and amenities follow the type. A row that keeps the previous
          // type's price after switching to another is quietly wrong.
          onChange({
            amenities: chosen ? chosen.amenities : [],
            customAmenities: chosen ? chosen.customAmenities : [],
            moldId: next,
            rent: chosen ? String(Math.round(chosen.baseRentPaise / 100)) : "",
          });
        }}
        value={draft.moldId}
      />

      {/* Locked until the type is chosen. Every one of these is an answer
          ABOUT a type — its number in that type's series, its rent against that
          type's default — and offering them first invites a rent that the next
          tap overwrites. Equal widths across both rows, so the four read as one
          block rather than two unrelated pairs. */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <FormInput
            autoCapitalize="characters"
            disabled={!mold}
            label="Prefix"
            onChangeText={(next) => onChange({ prefix: next })}
            placeholder=""
            value={draft.prefix}
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormInput
            autoCapitalize="characters"
            disabled={!mold}
            error={errors?.number}
            label="Room number"
            onChangeText={(next) => onChange({ roomNumber: next })}
            // No placeholder. A greyed "101" in an empty required field reads
            // as a value already there, and the label says what goes in it.
            placeholder=""
            required
            value={draft.roomNumber}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <FormInput
            disabled={!mold}
            error={errors?.floor}
            keyboardType="number-pad"
            label="Floor"
            maxLength={MAX_FLOOR_DIGITS}
            onChangeText={(next) => onChange({ floor: sanitizeFloorInput(next) })}
            placeholder={FLOOR_PLACEHOLDER}
            required
            value={draft.floor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormInput
            disabled={!mold}
            error={errors?.rent}
            keyboardType="decimal-pad"
            label="Rent per bed"
            onChangeText={(next) => onChange({ rent: next })}
            placeholder=""
            prefix="₹"
            required
            value={draft.rent}
          />
        </View>
      </View>

      {mold ? (
        <AmenityPicker
          amenities={draft.amenities}
          conditioning={mold.conditioning}
          customAmenities={draft.customAmenities}
          onChangeAmenities={(next) => onChange({ amenities: next })}
          onChangeCustom={(next) => onChange({ customAmenities: next })}
        />
      ) : (
        // Muted, not red. Nothing is wrong yet — the row has simply not been
        // told which type it is, and an error colour on a form you have not
        // filled in reads as a mistake you have already made.
        <Text style={[type.caption, { color: colors.muted }]}>
          Choose a room type and its amenities appear here, ready to adjust.
        </Text>
      )}
    </View>
  );

  if (standalone) {
    // One room, one card. The fields used to sit bare on the page, which left
    // the screen as a column of inputs with nothing saying where the room
    // begins and the page ends.
    return <Card>{fields}</Card>;
  }

  return (
    // A card per room, inset like every other card in the app. Edge to edge
    // with the sides and the radius stripped, each row was a full-width strip
    // ruled top and bottom — so the first one opened with a hairline across the
    // screen above "Room 1", which reads as a divider under a heading that is
    // not there rather than as the top of a card.
    <Card
      style={{
        borderColor: faulted ? colors.danger : colors.borderStrong,
        gap: expanded ? spacing.md : 0,
      }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
      >
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
            {number || `Room ${index + 1}`}
          </Text>
          {/* Collapsed, the row still has to say what it is — otherwise a list
              of ten is ten identical headings and the only way to check one is
              to open it. */}
          <Text numberOfLines={1} style={[type.caption, { color: faulted ? colors.danger : colors.muted }]}>
            {faulted
              ? "Something is missing"
              : mold
                ? `${moldLabel(mold)}${draft.floor.trim() ? ` · floor ${draft.floor.trim()}` : ""} · ${
                    draft.rent.trim() ? `₹${draft.rent.trim()}` : formatMoneyPaise(mold.baseRentPaise)
                  }`
                : "No room type chosen"}
          </Text>
        </View>

        {removable ? (
          <AnimatedPressable
            accessibilityLabel={`Remove ${number || `room ${index + 1}`}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onRemove}
            style={{ alignItems: "center", height: 32, justifyContent: "center", width: 32 }}
          >
            <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}

        {expanded ? (
          <ChevronUp color={colors.muted} size={18} strokeWidth={2.2} />
        ) : (
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
        )}
      </AnimatedPressable>

      {expanded ? fields : null}
    </Card>
  );
}
