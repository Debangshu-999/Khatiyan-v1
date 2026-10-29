import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ItemIcon } from "@/features/property/item-icon";
import { ROOM_AMENITY_ICONS } from "@/features/property/room-amenity-icons";
import { ROOM_AMENITIES, type RoomAmenity } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { softShadow } from "@/theme/shadows";
import { useTheme } from "@/theme/use-theme";

/** Exported for a card that names a room's amenities in words beside their glyphs (the booking form). */
export const ROOM_AMENITY_LABELS: Record<RoomAmenity, string> = {
  ATTACHED_TOILET: "Attached toilet",
  COMMON_TOILET: "Common toilet",
  BEDDING: "Bedding",
  CUPBOARD: "Cupboard",
  GEYSER: "Geyser",
  TV: "TV",
};

/**
 * What a room comes with, as a row of glyphs.
 *
 * <p>Icons rather than the ticked grid the forms use: on a card in a list this
 * answers "does it have a geyser" at a glance. Only allotted amenities appear;
 * the +n control expands the room's additional item icons in the same row.
 *
 * <p>No AC glyph: the card already carries an AC / Non-AC chip beside the room
 * number, and the same fact stated twice on one card is a reader wondering
 * which of the two is authoritative.
 */
export function RoomAmenityStrip({
  amenities,
  custom,
  tiles = false,
}: {
  amenities: RoomAmenity[];
  custom: string[];
  tiles?: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const allotted = [...ROOM_AMENITIES, "COMMON_TOILET" as const].filter((amenity) => amenities.includes(amenity));
  if (allotted.length === 0 && custom.length === 0) return null;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {allotted.map((amenity) => {
        const Icon = ROOM_AMENITY_ICONS[amenity];
        return (
          <Glyph key={amenity} label={ROOM_AMENITY_LABELS[amenity]} tiles={tiles}>
            <Icon color={colors.inkSoft} size={tiles ? 23 : 17} />
          </Glyph>
        );
      })}

      {expanded ? custom.map((name, index) => (
        <Glyph key={`${name}-${index}`} label={name} tiles={tiles}>
          <ItemIcon color={colors.inkSoft} name={name} size={tiles ? 23 : 17} />
        </Glyph>
      )) : null}
      {custom.length > 0 ? (
        <AnimatedPressable
          accessibilityLabel={expanded ? "Show fewer amenities" : `Show ${custom.length} more ${custom.length === 1 ? "amenity" : "amenities"}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          onPress={() => setExpanded((current) => !current)}
          style={{ alignItems: "center", justifyContent: "center", minHeight: tiles ? 38 : 20, paddingHorizontal: spacing.sm }}
        >
          <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>
            {expanded ? "Show less" : `+${custom.length}`}
          </Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function Glyph({ children, label, tiles }: { children: React.ReactNode; label: string; tiles: boolean }) {
  const { colors, fonts } = useTheme();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => setAnchor(null), [width, height]);
  const close = () => setAnchor(null);
  const open = () => trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, width: w, height: h }));
  // Position the name in the icon's own view, never in the native Modal's
  // window. Android's two windows can have different status-bar origins.
  const left = anchor ? Math.max(16 - anchor.x, Math.min(anchor.width / 2 - size.width / 2, width - anchor.x - size.width - 16)) : 0;
  const above = !!anchor && anchor.y - size.height - 10 >= 16;
  const availableWidth = Math.min(240, width - 32);
  return (
    <>
      <View collapsable={false} ref={trigger} style={{ position: "relative", zIndex: anchor ? 1 : 0 }}>
        <AnimatedPressable
          accessibilityHint="Show amenity name"
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ expanded: !!anchor }}
          hitSlop={6}
          onPress={open}
          style={{ alignItems: "center", height: tiles ? 38 : 20, justifyContent: "center", width: tiles ? 38 : 20, backgroundColor: tiles ? colors.neutralSoft : undefined, borderRadius: tiles ? 10 : 0 }}
        >
          {children}
        </AnimatedPressable>
        {anchor ? (
          <View
            pointerEvents="none"
            // An explicit layout width keeps Yoga from shrinking the name to
            // the 38px icon tile. The inner card still hugs its text.
            style={{ alignItems: "flex-start", bottom: above ? anchor.height + 10 : undefined, left, position: "absolute", top: above ? undefined : anchor.height + 10, width: availableWidth }}
          >
            <View
              onLayout={(event) => {
                const { width: w, height: h } = event.nativeEvent.layout;
                setSize((current) => current.width === w && current.height === h ? current : { width: w, height: h });
              }}
              style={{ ...softShadow(colors.shadow, 3, 10), alignSelf: "flex-start", backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 10, borderWidth: 1, maxWidth: "100%", opacity: size.width > 0 ? 1 : 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
            >
              <Text accessibilityLiveRegion="polite" style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14, textAlign: "center" }}>{label}</Text>
              <View
                pointerEvents="none"
                style={{ backgroundColor: colors.surface, borderBottomWidth: above ? 1 : 0, borderColor: colors.borderStrong, borderLeftWidth: above ? 0 : 1, borderRightWidth: above ? 1 : 0, borderTopWidth: above ? 0 : 1, bottom: above ? -6 : undefined, height: 10, left: Math.max(12, Math.min(anchor.width / 2 - left - 5, size.width - 22)), position: "absolute", top: above ? undefined : -6, transform: [{ rotate: "45deg" }], width: 10 }}
              />
            </View>
          </View>
        ) : null}
      </View>
      {anchor ? (
        // Only dismissal lives in the transparent overlay. The visible name
        // remains anchored locally, so scrolling and safe-area offsets cannot
        // separate its pointer from the icon.
        <Modal animationType="none" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible>
          <Pressable accessibilityLabel={`${label}. Dismiss amenity name`} accessibilityRole="button" onPress={close} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        </Modal>
      ) : null}
    </>
  );
}
