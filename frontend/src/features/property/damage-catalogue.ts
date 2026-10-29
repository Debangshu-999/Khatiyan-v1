import type { BathroomType, DamageCategory, OwnerRoom } from "@/store/services/property-api";

/**
 * What the rooms add to the damage list by themselves (user, 2026-10-29).
 *
 * <p>The damage list is the one list of what a room can have: room types pick
 * their things from it, and the move-in checklist shows what a room's type
 * picked. So nothing comes from the rooms but AC and Fan, the room's variant
 * rather than a pick: each joins as a Room item where any room has it.
 */
export function roomDamageItems(rooms: OwnerRoom[], _bathroomType: BathroomType | undefined) {
  // A non-AC room's fan is its variant's thing in the same way (user, 2026-10-29).
  return [
    ...(rooms.some((room) => room.conditioning === "AC") ? [{ category: "ROOM" as DamageCategory, name: "AC" }] : []),
    ...(rooms.some((room) => room.conditioning !== "AC") ? [{ category: "ROOM" as DamageCategory, name: "Fan" }] : []),
  ];
}
