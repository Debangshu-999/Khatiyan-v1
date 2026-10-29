package com.khatiyan.d_modules.property.model;

/**
 * Where a damage-charge item sits, the same sections as the move-in checklist
 * (user, 2026-10-29). Persisted by name. Never delete a constant.
 */
public enum DamageCategory {
    /** Basic things in the room, like a pillow, and anything added to it. */
    ROOM,
    /**
     * The rooms' own amenities. No longer used (user, 2026-10-29): amenities are
     * Room or Bathroom items now, the damage list being the one list of what a
     * room can have. Kept because it is persisted by name.
     */
    @Deprecated
    AMENITY,
    /** Things in an attached bathroom, like taps or a geyser. */
    BATHROOM,
    /**
     * What a common toilet has (2026-10-29): listed, never priced, since it is
     * shared and its damage is not one tenant's.
     */
    COMMON_TOILET
}
