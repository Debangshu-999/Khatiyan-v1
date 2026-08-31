package com.khatiyan.d_modules.property.model;

/**
 * What a room comes with, beyond its four walls.
 *
 * <p><b>AC is deliberately absent.</b> Conditioning is the mold's variant axis
 * — see {@link RoomConditioning} — and an AC entry here would be the same fact
 * recorded twice in two places that can disagree. The amenity list shows AC as
 * a locked, derived row instead.
 *
 * <p>Persisted and read back years later. Never remove or rename a constant;
 * deprecate one that falls out of use.
 */
public enum RoomAmenity {
    CUPBOARD,
    ATTACHED_TOILET,
    TV,

    /** Spelt correctly, whatever the label on the switch says. */
    GEYSER,

    BEDDING
}
