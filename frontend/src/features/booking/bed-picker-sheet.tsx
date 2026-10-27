import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Check, ChevronDown, ChevronUp } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { compareFloors, formatFloor } from "@/features/property/floor";
import type { ExternalBookingRoom } from "@/store/services/lead-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const ROOM_TYPE: Record<string, string> = {
  SINGLE: "Single",
  DOUBLE: "Double",
  TRIPLE: "Triple",
  FOUR_SHARING: "Four sharing",
  DORMITORY: "Dormitory",
};

function describe(room: ExternalBookingRoom) {
  const kind = room.roomType ? ROOM_TYPE[room.roomType] ?? room.roomType : `${room.capacity} beds`;
  const air = room.conditioning === "AC" ? "AC" : room.conditioning === "NON_AC" ? "Non-AC" : null;
  return [kind, air, formatMoneyPaise(room.rentPaise)].filter(Boolean).join(" · ");
}

/**
 * Choose a bed for an external booking (user, 2026-10-19): a sheet from the
 * bottom, the floors that have a bed free, each opening to its rooms. A room
 * shows its type, AC and rent, and how many of its beds are free.
 */
export function BedPickerSheet({
  onChoose,
  onClose,
  rooms,
  selectedRoomId,
}: {
  onChoose: (room: ExternalBookingRoom) => void;
  onClose: () => void;
  rooms: ExternalBookingRoom[];
  selectedRoomId: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const floors = useMemo(() => {
    const byFloor = new Map<string, ExternalBookingRoom[]>();
    for (const room of rooms) {
      const key = room.floor ?? "";
      byFloor.set(key, [...(byFloor.get(key) ?? []), room]);
    }
    return [...byFloor.entries()]
      .sort(([left], [right]) => compareFloors(left, right))
      .map(([floor, inFloor]) => ({ floor, rooms: [...inFloor].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })) }));
  }, [rooms]);
  const selectedFloor = rooms.find((room) => room.roomId === selectedRoomId)?.floor ?? null;
  const [openFloor, setOpenFloor] = useState<string | null>(selectedFloor ?? (floors.length === 1 ? floors[0].floor : null));

  return (
    <SheetShell onClose={onClose} title="Choose a bed">
      <View style={{ gap: spacing.sm }}>
        {floors.map(({ floor, rooms: inFloor }) => {
          const open = openFloor === floor;
          const beds = inFloor.reduce((sum, room) => sum + room.freeBeds, 0);
          return (
            <View key={floor} style={{ borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
              <AnimatedPressable
                accessibilityLabel={`${formatFloor(floor)}, ${inFloor.length} ${inFloor.length === 1 ? "room" : "rooms"}, ${beds} ${beds === 1 ? "bed" : "beds"} free`}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenFloor(open ? null : floor)}
                style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, padding: spacing.md }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>{formatFloor(floor)}</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {inFloor.length} {inFloor.length === 1 ? "room" : "rooms"} · {beds} {beds === 1 ? "bed" : "beds"} free
                  </Text>
                </View>
                <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 24, justifyContent: "center", width: 24 }}>
                  {/* An up chevron while open (user, 2026-10-19): a rotated icon did not turn on every platform. */}
          {open ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
                </View>
              </AnimatedPressable>
              {open
                ? inFloor.map((room) => {
                    const chosen = room.roomId === selectedRoomId;
                    return (
                      <AnimatedPressable
                        accessibilityLabel={`Room ${room.roomNumber}, ${describe(room)}, ${room.freeBeds} of ${room.capacity} free`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: chosen }}
                        key={room.roomId}
                        onPress={() => onChoose(room)}
                        style={{
                          alignItems: "center",
                          backgroundColor: chosen ? colors.surfaceSunken : colors.surface,
                          borderTopColor: colors.border,
                          borderTopWidth: 1,
                          flexDirection: "row",
                          gap: spacing.sm,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>Room {room.roomNumber}</Text>
                          <Text style={[type.caption, { color: colors.muted }]}>{describe(room)}</Text>
                        </View>
                        {chosen ? (
                          <Check color={colors.primary} size={18} />
                        ) : (
                          <Text style={[type.caption, { color: colors.jade, fontFamily: fonts.sansBold }]}>
                            {room.freeBeds} of {room.capacity} free
                          </Text>
                        )}
                      </AnimatedPressable>
                    );
                  })
                : null}
            </View>
          );
        })}
      </View>
    </SheetShell>
  );
}
