import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { PropertyArtwork } from "@/components/artwork-icon";
import { FitText } from "@/components/fit-text";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SheetShell } from "@/components/sheet-shell";
import { formatFloor } from "@/features/property/floor";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The floor picker, the owner's Rooms screen's, shared with the tenant's room
 * change request (user, 2026-11-11). "" is the unassigned floor.
 */
function floorLabel(floor: string | null) {
  if (floor == null) {
    return "Select floor";
  }
  return formatFloor(floor);
}

export function FloorSelector({ active, floors, onSelect }: { active: string | null; floors: string[]; onSelect: (floor: string) => void }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      {/* The floor you are looking at, stated rather than labelled. "Floor"
          above a field saying "Ground" was two lines to say one thing; the name
          takes the weight instead, and what it does — switch — is the button
          on the right rather than a chevron hanging off the end of a form
          field. The glyph is the building, not a staircase: this picks WHICH
          floor of the property, and stairs are the way between them. */}
      <Pressable
        accessibilityLabel={`Floor ${floorLabel(active)}. Change floor`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          // On a card of its own. Bare on the page it read as a heading for the
          // rooms below rather than a control, and there was nothing to say
          // where the tappable area began or ended.
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          padding: spacing.md,
          ...cardShadow(colors.shadow),
        }}
      >
        {/* Unboxed and full size, as on the Home property picker. A ringed
            glyph drew a circle around a mark that is already two shapes. */}
        <PropertyArtwork size={34} />

        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            {floorLabel(active)}
          </FitText>
          <Text style={[type.caption, { color: colors.muted }]}>
            {floors.length} floor{floors.length === 1 ? "" : "s"} in this property
          </Text>
        </View>

        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            flexDirection: "row",
            gap: 4,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12 }}>Switch</Text>
          <ChevronDown color={colors.inkSoft} size={14} strokeWidth={2.4} />
        </View>
      </Pressable>

      {open ? (
        <SheetShell
          closeButtonVariant="circle"
          fullBleed
          onClose={() => setOpen(false)}
          showClose
          size="content"
          title="Choose floor"
        >
          <View>
            {floors.map((floor) => (
              <PickerOptionRow
                fullBleed
                key={floor || "unassigned"}
                label={floor ? `Floor ${floor}` : "Unassigned"}
                onPress={() => {
                  onSelect(floor);
                  setOpen(false);
                }}
                selected={floor === active}
              />
            ))}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}
