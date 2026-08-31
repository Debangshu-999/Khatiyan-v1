import { useState } from "react";
import { Text, View } from "react-native";
import { AirVent, ChevronDown, Fan, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { RequiredMark } from "@/features/owner/owner-ui";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SheetShell } from "@/components/sheet-shell";
import { formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import { ROOM_TYPES, type RoomMold } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** One type's name: "AC double", "Non-AC 8-bed dormitory". */
export function moldLabel(mold: RoomMold) {
  const variant = mold.conditioning === "AC" ? "AC" : "Non-AC";
  if (mold.sharingType === "DORMITORY") {
    return `${variant} ${mold.bedCount}-bed dormitory`;
  }
  return `${variant} ${humanizeToken(mold.sharingType).toLowerCase()}`;
}

/**
 * Beds and price, and nothing else.
 *
 * <p>The amenity count was a number nobody picks a type by — five against five
 * separates nothing — and it pushed the two figures that DO decide it to the
 * left of a line that then wrapped. The amenities themselves are on the screen
 * a moment later, ticked.
 */
function moldMeta(mold: RoomMold) {
  return `${mold.bedCount} ${mold.bedCount === 1 ? "bed" : "beds"} · ${formatMoneyPaise(mold.baseRentPaise)} per bed`;
}

/**
 * Choosing the type a room is cut from.
 *
 * <p>A field that opens a sheet, like every other picker in the app, rather than
 * a stack of rows on the page — a property with six types would otherwise push
 * the numbers and the floor below the fold before a single one was entered.
 *
 * <p>The rows carry each type's beds and price, because the choice sets both for
 * every room being created and a bare name would not be enough to pick between
 * an AC double and a non-AC one.
 */
export function MoldPicker({
  error,
  molds,
  onChange,
  value,
}: {
  error?: string;
  molds: RoomMold[];
  /** Null clears the choice — the cross on the field. */
  onChange: (moldId: string | null) => void;
  value: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  const chosen = molds.find((option) => option.id === value) ?? null;

  // By occupancy ascending, then AC before non-AC, then by beds. The list
  // arrives ordered by the sharing type's STRING — double, dormitory, four
  // sharing, single, triple — which is alphabetical and no order at all to
  // somebody scanning for the size they want.
  const ordered = [...molds].sort((left, right) => {
    const bySize = ROOM_TYPES.indexOf(left.sharingType) - ROOM_TYPES.indexOf(right.sharingType);
    if (bySize !== 0) {
      return bySize;
    }
    if (left.conditioning !== right.conditioning) {
      return left.conditioning === "AC" ? -1 : 1;
    }
    return left.bedCount - right.bedCount;
  });

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>
        Room type
        <RequiredMark required />
      </Text>

      {/* The clear button is a SIBLING of the field, not a child of it. Nested
          inside, its press bubbled to the field underneath — so clearing the
          type also reopened the sheet — and on web it is a button inside a
          button, which is invalid markup. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1.5,
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          {chosen ? <ChosenIcon conditioning={chosen.conditioning} /> : null}
          <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
            {chosen ? (
              <>
                <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  {moldLabel(chosen)}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                  {moldMeta(chosen)}
                </Text>
              </>
            ) : (
              <Text style={[type.caption, { color: colors.muted }]}>Choose a room type</Text>
            )}
          </View>
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
        </AnimatedPressable>

        {chosen ? (
          <AnimatedPressable
            accessibilityLabel="Clear room type"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChange(null)}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              height: 32,
              justifyContent: "center",
              width: 32,
            }}
          >
            <X color={colors.inkSoft} size={15} strokeWidth={2.6} />
          </AnimatedPressable>
        ) : null}
      </View>

      <FieldError message={error} />

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Room type">
          <View>
            {ordered.length === 0 ? (
              // The screens that open this mostly guard on having types at all,
              // but the sheet has to answer for itself: an empty list with no
              // explanation reads as a picker that failed to load.
              <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                  No room types yet
                </Text>
                <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
                  A room is cut from a type. Set them up on the property first.
                </Text>
              </View>
            ) : null}

            {ordered.map((mold, index) => (
              <PickerOptionRow
                first={index === 0}
                key={mold.id}
                label={moldLabel(mold)}
                onPress={() => {
                  onChange(mold.id);
                  setOpen(false);
                }}
                selected={mold.id === value}
                subtitle={moldMeta(mold)}
              />
            ))}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}

function ChosenIcon({ conditioning }: { conditioning: RoomMold["conditioning"] }) {
  const { colors } = useTheme();
  const Icon = conditioning === "AC" ? AirVent : Fan;
  return <Icon color={colors.inkSoft} size={18} strokeWidth={2.2} />;
}
