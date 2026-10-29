package com.khatiyan.d_modules.tenancy.model;

/**
 * Where an item sits on the move-in checklist (user, 2026-10-29). Persisted by
 * name. Never delete a constant.
 */
public enum MoveInSection {
    /** Basic things every room has, like a pillow, and anything added by hand. Removable. */
    ROOM,
    /** The room's own amenities, including its extra ones. Not removable. */
    AMENITY,
    /** Things in an attached bathroom, like the geyser. Only when bathrooms are attached. */
    BATHROOM
}
