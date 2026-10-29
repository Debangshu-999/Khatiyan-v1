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

    /**
     * Set by the property's bathroom type, never ticked (user, 2026-10-29):
     * ATTACHED_TOILET on a property with attached bathrooms, COMMON_TOILET on
     * one with common ones. Like AC, answered and not answerable.
     */
    ATTACHED_TOILET,
    TV,

    /** Spelt correctly, whatever the label on the switch says. */
    GEYSER,

    BEDDING,

    /** The toilet is shared: the property's bathroom type is COMMON. See ATTACHED_TOILET. */
    COMMON_TOILET
}
