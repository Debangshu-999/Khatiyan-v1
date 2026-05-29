package com.khatiyan.d_modules.property.model;

/**
 * Cooling category attached to a room.
 *
 * <p>This is separate from {@link RoomType} so the same sharing category
 * can be offered as AC or non-AC without creating many combined enum values.
 */
public enum RoomConditioning {
    AC,
    NON_AC
}

